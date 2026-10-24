// Datacrazy – Filtro de Logs do Bloco
// Detecta as listas de logs (cards que começam com data) e insere uma barra de filtro acima.
// "Carregar tudo" e "Baixar CSV" buscam o log inteiro direto na API (rota capturada pelo hook.js);
// se a API falhar, caem para o modo antigo (rolar a lista até o fim).

(() => {
  const DATE_RE = /^(\d{1,2}) de (\w+) de (\d{4}) (\d{2}):(\d{2})/i;
  const MONTHS = { janeiro:0, fevereiro:1, "março":2, marco:2, abril:3, maio:4, junho:5,
                   julho:6, agosto:7, setembro:8, outubro:9, novembro:10, dezembro:11 };
  const TYPE_LABEL = { entered: "Entrou", succeeded: "Concluído com sucesso", warning: "Alerta",
                       alert: "Alerta", error: "Erro", failed: "Erro" };
  const PAGE_SIZE = 200;
  const REQUEST_TIMEOUT = 30000;
  const MAX_RENDER = 3000; // acima disso a lista na tela é cortada (o CSV leva tudo)
  const PARALLEL = 3;      // páginas buscadas ao mesmo tempo
  const RETENTION_DAYS = 7; // o Datacrazy só guarda 7 dias de log

  // Estado global (mantido ao trocar entre Entraram/Sucessos/Alertas/Erros)
  const state = { q: "", from: "", to: "", unique: false, onlyDup: false };
  const bars = new Map(); // list element -> bar element
  const api = new Map();  // list element -> { items, from, to, key, view } quando carregado pela API
  let lastReq = null;     // última chamada da aplicação à rota de logs { url, headers }
  let pendingAuto = null; // bloco/aba que acabou de abrir e ainda não foi carregado pela API
  let auto = true;        // "Carregar tudo" sozinho ao abrir um bloco/aba
  try { auto = localStorage.getItem("dcf-auto") !== "0"; } catch {}

  // ---------- captura da rota (mensagens do hook.js) ----------
  window.addEventListener("message", e => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "dcf-hook" || d.type !== "logs-request") return;
    lastReq = { url: d.url, headers: d.headers };
    // outro bloco ou outra aba na aplicação: volta à lista nativa. Recargas do mesmo bloco/aba
    // (ex.: seletor "Última semana") não derrubam a lista carregada pela extensão.
    const key = reqKey(d.url);
    for (const [list, a] of api) if (a.key !== key) exitApi(list);
    if (auto && ![...api.values()].some(a => a.key === key)) pendingAuto = key;
    clearTimeout(t);
    t = setTimeout(scan, 300); // a lista pode já estar na tela (e cards sem Lead só valem agora)
  });
  window.postMessage({ source: "dcf-content", type: "get-last" }, location.origin);

  function reqKey(url) {
    const s = new URL(url).searchParams;
    return `${s.get("filter[flowBlockId]")}|${s.get("filter[type]")}`;
  }

  const retentionStart = () => new Date(Date.now() - RETENTION_DAYS * 864e5);

  // ---------- leitura dos cards ----------
  // innerText de card oculto (display:none) vem sem quebras de linha, então o parse
  // é feito com o card visível e guardado; só refaz se o conteúdo do card mudar.
  const parsed = new WeakMap(); // card -> { sig, data }
  function parseCard(card) {
    const sig = card.textContent;
    const hit = parsed.get(card);
    if (hit && hit.sig === sig) return hit.data;
    if (card.dataset.dcfHidden === "1") return null;
    const data = parseLines(card);
    parsed.set(card, { sig, data });
    return data;
  }

  function parseLines(card) {
    const lines = card.innerText.split("\n").map(s => s.trim()).filter(Boolean);
    const m = (lines[0] || "").match(DATE_RE);
    if (!m) return null;
    const date = new Date(+m[3], MONTHS[m[2].toLowerCase()] ?? 0, +m[1], +m[4], +m[5]);
    const after = label => {
      const i = lines.indexOf(label);
      if (i < 0) return "";
      let v = lines[i + 1] || "";
      if (v.length === 1 && lines[i + 2]) v = lines[i + 2]; // pula a letra do avatar
      return v;
    };
    const phone = [...lines].reverse().find(l => /^\+?\d{8,}$/.test(l)) || "";
    return {
      card, date, dateText: lines[0], status: lines[1] || "",
      lead: after("Lead:"), contact: after("Contato:"), phone,
      text: lines.join(" ").toLowerCase()
    };
  }

  function findCards(root = document) {
    return [...root.querySelectorAll("div.cursor-pointer.rounded-lg")]
      // card com data no topo; sem "Lead:"/"Contato:" (ex.: execução agendada) só vale depois que
      // a rota de logs foi vista, para não pegar listas de outras telas do CRM
      .filter(el => DATE_RE.test((el.textContent || "").trim()) && (lastReq || /Lead:|Contato:/.test(el.textContent)));
  }

  // ---------- leitura da API ----------
  const pad = n => String(n).padStart(2, "0");
  const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function fromApi(r) {
    const date = new Date(r.createdAt);
    const status = [TYPE_LABEL[r.type] || r.type || r.message || "", r.errorCode].filter(Boolean).join(" – ");
    const lead = r.lead?.name?.trim() || "";
    const contact = (r.contactName || "").trim();
    const phone = r.contactId || "";
    return {
      id: `${r.flowSessionId}|${r.createdAt}`, date, dateText: fmtDate(date), status, lead, contact, phone,
      text: [fmtDate(date), status, lead, contact, phone, r.message].join(" ").toLowerCase()
    };
  }

  // x-signature da aplicação: AES-256-CBC(horário do servidor, SHA-256(chave pública da página))
  let sigKey, timeOffset;
  async function freshSignature() {
    if (sigKey === undefined) {
      const m = document.documentElement.innerHTML.match(/REQUEST_SIGNATURE_KEY\\?"\s*:\s*\\?"([^"\\]+)/);
      sigKey = m ? m[1] : null;
    }
    if (!sigKey) return null;
    if (timeOffset === undefined) {
      try {
        const t0 = Date.now(), res = await fetch("/api/time", { cache: "no-store" }), t1 = Date.now();
        timeOffset = new Date((await res.json()).iso).getTime() - (t0 + (t1 - t0) / 2) || 0;
      } catch { timeOffset = 0; }
    }
    const enc = new TextEncoder();
    const raw = await crypto.subtle.digest("SHA-256", enc.encode(sigKey.trim()));
    const key = await crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key,
      enc.encode(new Date(Date.now() + timeOffset).toISOString()));
    const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `${b64(iv)}:${b64(ct)}`;
  }

  // fetch com tempo limite: uma página travada não pode segurar o carregamento para sempre
  async function fetchTimeout(url, headers) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT);
    try {
      const res = await fetch(url, { headers, cache: "no-store", signal: ctl.signal });
      return { res, json: res.ok ? await res.json() : null };
    } catch (e) {
      throw new Error(e.name === "AbortError" ? `sem resposta em ${REQUEST_TIMEOUT / 1000}s` : e.message);
    } finally {
      clearTimeout(timer);
    }
  }

  async function getJson(url, headers) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let { res, json } = await fetchTimeout(url, headers);
        if (res.status === 401 || res.status === 403) { // assinatura/token velhos: tenta com assinatura nova
          const sig = await freshSignature();
          if (sig) {
            headers["x-signature"] = sig; // próximas páginas já saem com a assinatura nova
            ({ res, json } = await fetchTimeout(url, headers));
          }
        }
        if (res.ok) return json;
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status < 500 && res.status !== 429) break; // erro do pedido: repetir não adianta
      } catch (e) {
        lastErr = e;
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    throw lastErr;
  }

  // busca todas as páginas da mesma rota que a aplicação usa, com páginas maiores e em paralelo
  // onProgress(carregados, total|null); cancelled() = usuário clicou em Cancelar
  async function fetchAllLogs(onProgress, cancelled) {
    if (!lastReq) throw new Error("rota de logs ainda não capturada");
    const base = new URL(lastReq.url);
    base.searchParams.set("take", PAGE_SIZE);
    if (state.from) base.searchParams.set("filter[createdAtGreaterOrEqual]", new Date(state.from).toISOString());
    if (state.to) base.searchParams.set("filter[createdAtLessOrEqual]", new Date(state.to).toISOString());
    const headers = { ...lastReq.headers };
    delete headers["x-dz-include-totals"];
    const out = [], seen = new Set();
    let total = null;
    const result = error => ({ items: out, from: state.from, to: state.to, key: reqKey(lastReq.url), error });
    const getPage = async skip => {
      if (cancelled()) throw new Error("cancelado");
      const u = new URL(base);
      u.searchParams.set("skip", skip);
      // 1ª página pede o total (mesmo header que a aplicação usa), para a barra de progresso
      const json = await getJson(u.href, skip ? headers : { ...headers, "x-dz-include-totals": "true" });
      if (json && !Array.isArray(json)) {
        const n = json.total ?? json.count ?? json.totalCount ?? json.meta?.total;
        if (Number.isFinite(+n) && n !== null) total = +n;
      }
      return Array.isArray(json) ? json : json.data || json.items || json.logs || json.results || [];
    };
    const add = page => {
      let added = 0;
      for (const r of page) {
        const it = fromApi(r);
        if (!seen.has(it.id)) { seen.add(it.id); out.push(it); added++; }
      }
      return added;
    };

    // 1ª página sozinha: descobre quantos itens o servidor devolve por página
    const first = await getPage(0);
    add(first);
    onProgress(out.length, total);
    const step = first.length;
    if (!step) return result();

    for (let skip = step, guard = 0; guard < 200; guard++, skip += step * PARALLEL) {
      const skips = Array.from({ length: PARALLEL }, (_, i) => skip + i * step);
      let pages;
      try {
        pages = await Promise.all(skips.map(getPage));
      } catch (err) {
        if (cancelled()) throw err;
        // já veio parte do log: mostra o que tem em vez de jogar tudo fora
        console.warn(`[Filtro de Logs] parou perto de skip=${skip}:`, err.message);
        return result(err.message);
      }
      let added = 0, end = false;
      for (const p of pages) {
        added += add(p);
        if (p.length < step) end = true; // página incompleta = fim do log
      }
      onProgress(out.length, total);
      if (end || !added) break;
    }
    return result();
  }

  // ---------- filtro ----------
  function filterItems(items) {
    const terms = state.q.toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
    const from = state.from ? new Date(state.from) : null;
    const to = state.to ? new Date(state.to) : null;
    const freq = {};
    // repetido = mesmo telefone; sem telefone (ex.: só Lead), usa o nome
    // log sem telefone, lead e contato (ex.: execução agendada) nunca conta como repetido
    const keyOf = it => it.phone || it.lead || it.contact || "";
    items.forEach(it => { const k = keyOf(it); if (k) freq[k] = (freq[k] || 0) + 1; });
    const seen = new Set();
    for (const it of items) {
      const key = keyOf(it);
      let ok = true;
      if (terms.length && !terms.some(t => it.text.includes(t))) ok = false;
      if (from && it.date < from) ok = false;
      if (to && it.date > to) ok = false;
      if (state.onlyDup && !(freq[key] > 1)) ok = false;
      if (ok && state.unique && key) { if (seen.has(key)) ok = false; else seen.add(key); }
      it.visible = ok;
      it.count = freq[key] || 1;
    }
    return items;
  }

  function setCount(list, shown, total, extra = "") {
    const bar = bars.get(list);
    if (bar) bar.querySelector(".dcf-count").textContent = `Mostrando ${shown} de ${total}${extra}`;
  }

  function apply(list) {
    const a = api.get(list);
    if (a) return renderApi(list, a);
    const items = filterItems(findCards(list).map(parseCard).filter(Boolean));
    for (const it of items) {
      it.card.dataset.dcfHidden = it.visible ? "0" : "1";
      if (it.count > 1) it.card.dataset.dcfCount = it.count;
      else delete it.card.dataset.dcfCount;
    }
    setCount(list, items.filter(i => i.visible).length, items.length);
    return items;
  }

  // ---------- lista própria (dados da API) ----------
  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function renderApi(list, a) {
    const items = filterItems(a.items);
    const vis = items.filter(i => i.visible);
    a.view.innerHTML = vis.slice(0, MAX_RENDER).map(it => `
      <div class="dcf-item"${it.count > 1 ? ` data-dcf-count="${it.count}"` : ""}>
        <div class="dcf-item-top"><span>${escHtml(it.dateText)}</span><span class="dcf-status">${escHtml(it.status)}</span></div>
        <div>${[it.lead && `<b>Lead:</b> ${escHtml(it.lead)}`, it.contact && `<b>Contato:</b> ${escHtml(it.contact)}`].filter(Boolean).join(" · ")}</div>
        <div class="dcf-phone">${escHtml(it.phone)}</div>
      </div>`).join("") || `<div class="dcf-empty">Nenhum log no filtro.</div>`;
    setCount(list, vis.length, items.length,
      (vis.length > MAX_RENDER ? ` (tela: ${MAX_RENDER})` : "") + (a.error ? ` – incompleto: ${a.error}` : ""));
    return items;
  }

  function enterApi(list, data) {
    exitApi(list);
    const view = document.createElement("div");
    view.className = "dcf-list";
    list.parentElement.insertBefore(view, list);
    list.classList.add("dcf-native-off");
    api.set(list, { ...data, view });
    apply(list);
  }

  function exitApi(list) {
    const a = api.get(list);
    if (!a) return;
    a.view.remove();
    list.classList.remove("dcf-native-off");
    api.delete(list);
    if (list.isConnected) apply(list);
  }

  // ---------- ações ----------
  // elemento que de fato rola (a lista ou um ancestral com overflow)
  function scrollerOf(list) {
    for (let el = list; el && el !== document.body; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
    }
    return list;
  }

  // modo antigo: rola até o fim até o número de cards parar de crescer
  async function scrollToEnd(list, onProgress) {
    const sc = scrollerOf(list);
    let last = -1, stable = 0;
    for (let i = 0; i < 200 && stable < 4; i++) {
      sc.scrollTop = sc.scrollHeight;
      await new Promise(r => setTimeout(r, 700));
      const n = findCards(list).length;
      onProgress(n);
      stable = n === last ? stable + 1 : 0;
      last = n;
    }
    sc.scrollTop = 0;
  }

  // carrega o log inteiro: API primeiro, rolagem da lista se a API falhar
  let loadSeq = 0;
  const fmtN = n => n.toLocaleString("pt-BR");

  // aviso grande na área da lista enquanto carrega (há blocos com mais de 10 mil logs)
  function showLoading(list, onCancel) {
    const box = document.createElement("div");
    box.className = "dcf-loading";
    box.innerHTML = `
      <div class="dcf-loading-title"><span class="dcf-spinner"></span> Carregando todos os logs…</div>
      <div class="dcf-loading-count">Buscando no Datacrazy</div>
      <div class="dcf-progress"><div></div></div>
      <button data-a="cancel">Cancelar</button>`;
    box.querySelector('[data-a="cancel"]').onclick = onCancel;
    list.parentElement.insertBefore(box, list);
    const fill = box.querySelector(".dcf-progress > div"), label = box.querySelector(".dcf-loading-count");
    return {
      update(n, total) {
        if (total) {
          label.textContent = `${fmtN(n)} de ${fmtN(total)} logs`;
          fill.style.width = `${Math.min(100, (n / total) * 100)}%`;
          fill.parentElement.classList.remove("dcf-indeterminate");
        } else {
          label.textContent = `${fmtN(n)} logs carregados`;
          fill.parentElement.classList.add("dcf-indeterminate");
        }
      },
      remove: () => box.remove()
    };
  }

  async function loadEverything(list, btn) {
    const my = ++loadSeq; // se outra carga começar depois, esta é descartada
    let userCancel = false;
    const cancelled = () => userCancel || my !== loadSeq;
    btn.disabled = true;
    // esconde a lista (nativa ou da API) durante a carga; o aviso fica no lugar
    list.classList.add("dcf-native-off");
    api.get(list)?.view.classList.add("dcf-native-off");
    const loading = showLoading(list, () => { userCancel = true; });
    loading.update(0, null);
    const progress = (n, total) => {
      if (cancelled()) return;
      btn.textContent = `Carregando… (${fmtN(n)})`;
      loading.update(n, total);
    };
    try {
      const data = await fetchAllLogs(progress, cancelled);
      if (!cancelled()) enterApi(list, data);
    } catch (err) {
      if (!cancelled()) {
        console.warn("[Filtro de Logs] API indisponível, usando rolagem da lista:", err.message);
        exitApi(list);
        list.classList.remove("dcf-native-off"); // a rolagem precisa da lista visível
        await scrollToEnd(list, n => progress(n, null));
      }
    }
    loading.remove();
    api.get(list)?.view.classList.remove("dcf-native-off");
    if (!api.has(list)) list.classList.remove("dcf-native-off");
    if (my === loadSeq) {
      btn.textContent = "Carregar tudo";
      btn.disabled = false;
    }
    return apply(list);
  }

  function tabName() {
    const tab = document.querySelector('[role="tab"][aria-selected="true"], [role="tab"][data-state="active"]');
    return (tab?.innerText || "logs").trim().toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-");
  }

  // baixa as linhas que passam no filtro (sem filtro = todas)
  async function downloadCsv(list, btn) {
    const a = api.get(list);
    const fresh = a && a.from === state.from && a.to === state.to && !a.error;
    const rows = (fresh ? apply(list) : await loadEverything(list, bars.get(list).querySelector('[data-a="load"]')))
      .filter(i => i.visible);
    btn.disabled = true;
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ["data;status;lead;contato;telefone",
      ...rows.map(r => [r.dateText, r.status, r.lead, r.contact, r.phone].map(esc).join(";"))].join("\r\n");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); // BOM = acentos certos no Excel
    const link = Object.assign(document.createElement("a"), { href: url, download: `logs-${tabName()}-${stamp}.csv` });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    btn.textContent = `Baixado (${rows.length})`;
    setTimeout(() => { btn.textContent = "Baixar CSV"; btn.disabled = false; }, 1500);
  }

  // ---------- UI ----------
  let refetchTimer;
  function makeBar(list) {
    const bar = document.createElement("div");
    bar.className = "dcf-bar";
    bar.innerHTML = `
      <div class="dcf-row">
        <input type="text" data-k="q" placeholder="Filtrar por nome, telefone ou status (vírgula = OU)">
      </div>
      <div class="dcf-row">
        <input type="datetime-local" data-k="from" title="De">
        <input type="datetime-local" data-k="to" title="Até">
      </div>
      <div class="dcf-note" hidden></div>
      <div class="dcf-row">
        <label><input type="checkbox" data-k="unique"> Únicos por telefone</label>
        <label><input type="checkbox" data-k="onlyDup"> Só repetidos</label>
        <label title="Buscar o log inteiro sozinho ao abrir um bloco ou aba"><input type="checkbox" data-a="auto"> Auto</label>
        <span class="dcf-count"></span>
      </div>
      <div class="dcf-row">
        <button data-a="load">Carregar tudo</button>
        <button data-a="csv">Baixar CSV</button>
        <button data-a="clear">Limpar</button>
      </div>`;

    const min = retentionStart(), p2 = n => String(n).padStart(2, "0");
    const minStr = `${min.getFullYear()}-${p2(min.getMonth() + 1)}-${p2(min.getDate())}T00:00`;
    bar.querySelectorAll('input[type="datetime-local"]').forEach(i => (i.min = minStr));
    bar.querySelectorAll("[data-k]").forEach(inp => {
      const k = inp.dataset.k;
      if (inp.type === "checkbox") inp.checked = state[k]; else inp.value = state[k];
      inp.addEventListener("input", () => {
        state[k] = inp.type === "checkbox" ? inp.checked : inp.value;
        bars.forEach((_, l) => apply(l));
        if (k === "from" || k === "to") updateRetentionNote();
        // período mudou com dados da API na tela: busca de novo com o novo período
        if ((k === "from" || k === "to") && api.has(list)) {
          clearTimeout(refetchTimer);
          refetchTimer = setTimeout(() => loadEverything(list, bar.querySelector('[data-a="load"]')), 800);
        }
      });
    });
    const autoBox = bar.querySelector('[data-a="auto"]');
    autoBox.checked = auto;
    autoBox.onchange = () => {
      auto = autoBox.checked;
      try { localStorage.setItem("dcf-auto", auto ? "1" : "0"); } catch {}
      bars.forEach(b => (b.querySelector('[data-a="auto"]').checked = auto));
    };
    bar.querySelector('[data-a="load"]').onclick = e => loadEverything(list, e.currentTarget);
    bar.querySelector('[data-a="csv"]').onclick = e => downloadCsv(list, e.currentTarget);
    bar.querySelector('[data-a="clear"]').onclick = () => {
      Object.assign(state, { q: "", from: "", to: "", unique: false, onlyDup: false });
      // o estado é global: limpa os campos de todas as barras, não só desta
      bars.forEach((b, l) => {
        b.querySelectorAll("[data-k]").forEach(i => (i.type === "checkbox" ? (i.checked = false) : (i.value = "")));
        apply(l);
      });
    };
    return bar;
  }

  // o Datacrazy só guarda 7 dias: avisa quando o período escolhido sai dessa janela
  function updateRetentionNote() {
    const start = retentionStart();
    const to = state.to ? new Date(state.to) : null;
    const from = state.from ? new Date(state.from) : null;
    const msg = to && to < start
      ? `O Datacrazy guarda só ${RETENTION_DAYS} dias de log (desde ${fmtDate(start)}). Esse período não tem logs.`
      : from && from < start
        ? `O Datacrazy guarda só ${RETENTION_DAYS} dias de log: antes de ${fmtDate(start)} não há registros.`
        : "";
    bars.forEach(b => {
      const n = b.querySelector(".dcf-note");
      n.textContent = msg;
      n.hidden = !msg;
    });
  }

  // ---------- observar o DOM (SPA) ----------
  function scan() {
    // remove barras órfãs
    for (const [list, bar] of bars) {
      if (!list.isConnected) { exitApi(list); bar.remove(); bars.delete(list); }
    }
    const lists = new Set(findCards().map(c => c.parentElement));
    for (const list of lists) {
      if (!bars.has(list)) {
        const bar = makeBar(list);
        list.parentElement.insertBefore(bar, list); // fora do container do React
        list.parentElement.classList.add("dcf-host"); // CSS respeita o atributo [hidden] das abas inativas
        bars.set(list, bar);
        updateRetentionNote();
      }
      if (!api.has(list)) apply(list); // lista da API só muda com filtro, não com o DOM da página
    }
    // abriu bloco/aba novo com o automático ligado: carrega tudo na lista que está visível
    if (pendingAuto && lastReq && reqKey(lastReq.url) === pendingAuto) {
      const visible = [...lists].find(l => l.offsetParent !== null && !api.has(l));
      if (visible) {
        pendingAuto = null;
        loadEverything(visible, bars.get(visible).querySelector('[data-a="load"]'));
      }
    }
  }

  let t;
  new MutationObserver(muts => {
    if (muts.every(m => m.target.closest?.(".dcf-bar, .dcf-list"))) return;
    clearTimeout(t);
    t = setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
