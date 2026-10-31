// Datacrazy – Filtro de Logs do Bloco (mundo da página)
// Observa as chamadas da própria aplicação à rota de logs e repassa URL + headers
// para o content.js, que reaproveita a mesma rota para buscar o log inteiro.
// Também repassa os headers das chamadas aos servidores do CRM (crm.g1, accounts.g1…) e a lista
// de conexões, para o aviso de conexão desconectada.

(() => {
  const LOGS_RE = /\/api\/crm\/flows\/[^/]+\/versions\/[^/]+\/logs\?/;
  const API_RE = /^https:\/\/[a-z]+\.[a-z0-9-]+\.datacrazy\.io\/api\//; // crm.g1, accounts.g1, messaging.g1…
  const INSTANCES_RE = /\/api\/messaging\/instances\?/;
  const origFetch = window.fetch;
  let last = null; // guardado para o content.js, que carrega depois da primeira chamada
  let auth = null, authAt = 0; // última chamada autenticada { url, headers } e quando foi repassada

  const sendAuth = () => {
    if (!auth) return;
    authAt = Date.now();
    window.postMessage({ source: "dcf-hook", type: "api-auth", ...auth }, location.origin);
  };

  const send = () => {
    if (!last) return;
    const texts = errorTexts();
    if (texts) window.postMessage({ source: "dcf-hook", type: "error-texts", texts }, location.origin);
    window.postMessage({ source: "dcf-hook", type: "logs-request", ...last }, location.origin);
  };
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "dcf-content") return;
    if (e.data.type === "get-last") { send(); sendAuth(); }
    if (e.data.type === "load-session") loadSession(e.data.id);
  });

  // campos de data da barra (botão "Escolher" ou o próprio campo): abre o calendário daqui,
  // porque no mundo isolado do content.js o showPicker() não abre nada
  document.addEventListener("click", e => {
    const field = e.target.closest?.(".dcf-date");
    const input = field?.querySelector('input[type="datetime-local"]');
    if (!input) return;
    try { input.showPicker(); } catch { input.focus(); }
  }, true);

  // clique num log da lista Crazy: mesma ação do card do Clássico (mostra o caminho da sessão
  // em cima dos blocos). A função vem do contexto React do editor de flow.
  function loadSession(id) {
    const el = document.querySelector(".react-flow");
    const fk = el && Object.keys(el).find(k => k.startsWith("__reactFiber"));
    for (let f = fk && el[fk]; f; f = f.return)
      for (let d = f.dependencies?.firstContext; d; d = d.next) {
        const h = d.memoizedValue?.sessionHistory;
        if (typeof h?.loadSessionHistory === "function") return void h.loadSessionHistory(id).catch(() => {});
      }
  }

  // traduções do CRM (next-intl): o objeto messages está nas props do provider, acima do editor.
  // O log só traz o código (ex.: "chat.errors.invalid-whatsapp-number"); a frase sai daqui.
  let texts = null;
  function errorTexts() {
    if (texts) return texts;
    const el = document.querySelector(".react-flow");
    const fk = el && Object.keys(el).find(k => k.startsWith("__reactFiber"));
    for (let f = fk && el[fk]; f; f = f.return) {
      const m = f.memoizedProps?.messages;
      if (m && typeof m === "object" && !Array.isArray(m)) return texts = flatErrors(m);
    }
    return null;
  }
  // só as frases de erro, com a chave completa: { "chat.errors.x": "..." }
  function flatErrors(o, pre = "", inErr = false, out = {}) {
    for (const [k, v] of Object.entries(o)) {
      const key = pre ? `${pre}.${k}` : k;
      if (typeof v === "string") { if (inErr) out[key] = v; }
      else if (v && typeof v === "object") flatErrors(v, key, inErr || k === "errors", out);
    }
    return out;
  }

  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
      // init.dcf: chamada da própria extensão (só acontece no CRM falso dos testes, onde o
      // content.js roda no mundo da página); no Chrome ela usa o fetch do mundo isolado
      const headers = () => Object.fromEntries(new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)).entries());
      if (url && LOGS_RE.test(url) && !init?.dcf) {
        // URL absoluta: o content.js monta outras rotas a partir dela
        const req = { url: new URL(url, location.href).href, headers: headers() };
        // só guarda chamadas que deram certo: ao trocar de aba a aplicação cancela a anterior
        p.then(res => { if (res.ok) { last = req; send(); } }, () => {});
      }
      const abs = url && new URL(url, location.href).href;
      if (abs && API_RE.test(abs) && !init?.dcf) {
        const h = headers();
        // a aplicação chama a API toda hora: repassa no máximo a cada 30 s (o content.js renova a assinatura)
        if (h.authorization) { auth = { url: abs, headers: h }; if (Date.now() - authAt > 30e3) sendAuth(); }
        // a própria aplicação listou as conexões (tela Conexões): o aviso atualiza na hora
        if (INSTANCES_RE.test(abs))
          p.then(res => res.ok && res.clone().json()).then(j => {
            if (Array.isArray(j?.data)) window.postMessage({ source: "dcf-hook", type: "instances", data: j.data, count: j.count }, location.origin);
          }).catch(() => {});
      }
    } catch (e) { /* nunca quebrar a requisição da aplicação */ }
    return p;
  };
})();
