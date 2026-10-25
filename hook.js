// Datacrazy – Filtro de Logs do Bloco (mundo da página)
// Observa as chamadas da própria aplicação à rota de logs e repassa URL + headers
// para o content.js, que reaproveita a mesma rota para buscar o log inteiro.

(() => {
  const LOGS_RE = /\/api\/crm\/flows\/[^/]+\/versions\/[^/]+\/logs\?/;
  const origFetch = window.fetch;
  let last = null; // guardado para o content.js, que carrega depois da primeira chamada

  const send = () => last && window.postMessage({ source: "dcf-hook", type: "logs-request", ...last }, location.origin);
  window.addEventListener("message", e => {
    if (e.source !== window || e.data?.source !== "dcf-content") return;
    if (e.data.type === "get-last") send();
    if (e.data.type === "load-session") loadSession(e.data.id);
  });

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

  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
      if (url && LOGS_RE.test(url)) {
        const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const req = { url, headers: Object.fromEntries(h.entries()) };
        // só guarda chamadas que deram certo: ao trocar de aba a aplicação cancela a anterior
        p.then(res => { if (res.ok) { last = req; send(); } }, () => {});
      }
    } catch (e) { /* nunca quebrar a requisição da aplicação */ }
    return p;
  };
})();
