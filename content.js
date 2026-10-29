// Datacrazy – Filtro de Logs do Bloco
// Detecta as listas de logs (cards que começam com data) e insere uma barra de filtro acima.
// "Carregar tudo" e "Baixar CSV" buscam o log inteiro direto na API (rota capturada pelo hook.js);
// se a API falhar, caem para o modo antigo (rolar a lista até o fim).

(() => {
  const { DATE_RE, pad, fmtDate, escHtml, reqKey, parseLines, fromApi, stuckItems, stillIn, fmtPhone, hue, dayLabel, unwrap, personOf } = dcfLib;
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
  // "crazy" = barra + lista da extensão; "classic" = painel original do Datacrazy, sem nada da extensão
  let mode = "crazy";
  try { mode = localStorage.getItem("dcf-mode") === "classic" ? "classic" : "crazy"; } catch {}
  const toggles = new Map(); // list element -> seletor Clássico/Crazy
  let selSession = null;     // sessão cujo caminho está desenhado sobre os blocos
  let errorTexts = {};       // código de erro -> frase traduzida do CRM (vem do hook.js)
  const reproc = new Map();  // "sessão|bloco" -> { st: "busy" | "ok" | "fail", msg } do botão reprocessar
  const picked = new Set();  // "sessão|bloco" marcados na caixinha, para reprocessar em lote

  // ---------- captura da rota (mensagens do hook.js) ----------
  window.addEventListener("message", e => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "dcf-hook") return;
    if (d.type === "error-texts") return void (errorTexts = d.texts || {});
    if (d.type !== "logs-request") return;
    lastReq = { url: d.url, headers: d.headers };
    // outro bloco ou outra aba na aplicação: volta à lista nativa. Recargas do mesmo bloco/aba
    // (ex.: seletor "Última semana") não derrubam a lista carregada pela extensão.
    const key = reqKey(d.url);
    for (const [list, a] of api) if (a.key !== key) exitApi(list);
    if (auto && mode === "crazy" && ![...api.values()].some(a => a.key === key)) pendingAuto = key;
    clearTimeout(t);
    t = setTimeout(scan, 300); // a lista pode já estar na tela (e cards sem Lead só valem agora)
  });
  window.postMessage({ source: "dcf-content", type: "get-last" }, location.origin);

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
    const data = parseLinesOf(card);
    parsed.set(card, { sig, data });
    return data;
  }

  function parseLinesOf(card) {
    const data = parseLines(card.innerText.split("\n").map(s => s.trim()).filter(Boolean));
    return data && { card, ...data };
  }

  function findCards(root = document) {
    return [...root.querySelectorAll("div.cursor-pointer.rounded-lg")]
      // card com data no topo; sem "Lead:"/"Contato:" (ex.: execução agendada) só vale depois que
      // a rota de logs foi vista, para não pegar listas de outras telas do CRM
      .filter(el => DATE_RE.test((el.textContent || "").trim()) && (lastReq || /Lead:|Contato:/.test(el.textContent)));
  }

  // ---------- leitura da API ----------
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
  // type: outra aba do mesmo bloco (ex.: "entered"); sem type, a aba aberta
  async function fetchAllLogs(onProgress, cancelled, type) {
    if (!lastReq) throw new Error("rota de logs ainda não capturada");
    const base = new URL(lastReq.url);
    base.searchParams.set("take", PAGE_SIZE);
    if (type) base.searchParams.set("filter[type]", type);
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
        const it = fromApi(r, errorTexts);
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
  const filterItems = items => dcfLib.filterItems(items, state);

  function setCount(list, shown, total, extra = "") {
    const bar = bars.get(list);
    if (bar) bar.querySelector(".dcf-count").textContent = `Mostrando ${shown} de ${total}${extra}`;
  }

  function apply(list) {
    if (mode === "classic") {
      // devolve os cards ao estado original da página
      for (const c of findCards(list)) { delete c.dataset.dcfHidden; delete c.dataset.dcfCount; }
      return [];
    }
    const a = api.get(list);
    if (a) { const r = renderApi(list, a); updatePickBar(list); return r; }
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
  // tipo do log -> classe de cor + rótulo curto
  const KIND = { succeeded: ["ok", "✓ Sucesso"], entered: ["in", "→ Entrou"], warning: ["warn", "! Alerta"],
                 alert: ["warn", "! Alerta"], error: ["err", "✕ Erro"], failed: ["err", "✕ Erro"] };

  function itemHtml(it) {
    const [kind, label] = KIND[it.type] || ["neutral", it.status || "—"];
    const name = it.lead || it.contact || fmtPhone(it.phone) || "(sem lead)";
    const sub = it.lead && it.contact && it.contact !== it.lead ? `<div class="dcf-sub">Contato: ${escHtml(it.contact)}</div>` : "";
    const time = `${pad(it.date.getHours())}:${pad(it.date.getMinutes())}`;
    const rp = reproc.get(`${it.sessionId}|${it.blockId}`);
    const play = it.sessionId && it.blockId
      ? `<button class="dcf-db dcf-play" title="Reprocessar a sessão a partir deste bloco"${rp?.st === "busy" ? " disabled" : ""}>${rp?.st === "busy" ? "…" : PLAY_ICON}</button>` : "";
    const rpTag = rp?.st === "ok" ? `<span class="dcf-rp dcf-rp-ok">reprocessado</span>`
      : rp?.st === "fail" ? `<span class="dcf-rp dcf-rp-fail">falhou: ${escHtml(rp.msg)}</span>` : "";
    const chk = it.sessionId && it.blockId
      ? `<input type="checkbox" class="dcf-chk" title="Selecionar para reprocessar"${picked.has(`${it.sessionId}|${it.blockId}`) ? " checked" : ""}>` : "";
    const stuckTags = (it.waiting ? `<span class="dcf-rp dcf-rp-wait">em espera</span>` : "")
      + (it.alert ? `<span class="dcf-rep">alerta</span>` : "");
    return `
      <div class="dcf-item dcf-k-${kind}${it.sessionId && it.sessionId === selSession ? " dcf-sel" : ""}" data-sid="${escHtml(it.sessionId)}" data-id="${escHtml(it.id)}">
        ${chk}<div class="dcf-av" style="--h:${hue(name)}">${escHtml((name.match(/[\p{L}\d]/u) || ["?"])[0].toUpperCase())}</div>
        <div class="dcf-main">
          <div class="dcf-l1"><span class="dcf-name">${escHtml(name)}</span><span class="dcf-time">${time}</span>${it.sessionId ? `<button class="dcf-db" title="Inspecionar dados da sessão">${DB_ICON}</button>` : ""}${play}</div>
          ${sub}
          <div class="dcf-l2">
            ${it.phone ? `<span class="dcf-phone">${escHtml(fmtPhone(it.phone))}</span>` : ""}
            <span class="dcf-pill"${it.errorCode ? ` title="${escHtml(it.errorCode)}"` : ""}>${escHtml(label)}${it.errorCode && !it.errorMsg ? ` · ${escHtml(it.errorCode)}` : ""}</span>
            ${it.count > 1 ? `<span class="dcf-rep">repetido ${it.count}x</span>` : ""}
            ${stuckTags}${rpTag}
          </div>
          ${it.errorMsg ? `<div class="dcf-msg">${escHtml(it.errorMsg)}</div>` : ""}
        </div>
      </div>`;
  }

  function renderApi(list, a) {
    const items = filterItems(a.items);
    const vis = items.filter(i => i.visible);
    const shown = vis.slice(0, MAX_RENDER);
    // separador por dia, com a contagem de logs visíveis daquele dia
    const perDay = {};
    for (const it of vis) { const k = it.date.toDateString(); perDay[k] = (perDay[k] || 0) + 1; }
    let html = "", lastDay = "";
    for (const it of shown) {
      const k = it.date.toDateString();
      if (k !== lastDay) {
        html += `<div class="dcf-day"><span>${dayLabel(it.date)}</span><span>${perDay[k].toLocaleString("pt-BR")}</span></div>`;
        lastDay = k;
      }
      html += itemHtml(it);
    }
    a.view.innerHTML = html || `<div class="dcf-empty">Nenhum log no filtro.</div>`;
    setCount(list, vis.length, items.length, (a.stuck ? " parados" : "") +
      (vis.length > MAX_RENDER ? ` (tela: ${MAX_RENDER})` : "") + (a.error ? ` – incompleto: ${a.error}` : ""));
    return items;
  }

  function enterApi(list, data) {
    exitApi(list);
    const view = document.createElement("div");
    view.className = "dcf-list";
    view.onclick = e => {
      const item = e.target.closest(".dcf-item[data-sid]");
      if (!item?.dataset.sid) return;
      if (e.target.closest(".dcf-chk")) return void pick(list, item.dataset.id, e.target.checked);
      if (e.target.closest(".dcf-play")) return void confirmReprocess(list, item.dataset.id);
      if (e.target.closest(".dcf-db")) return void openSession(item.dataset.sid);
      selectSession(item.dataset.sid);
    };
    list.parentElement.insertBefore(view, list);
    list.classList.add("dcf-native-off");
    picked.clear();
    api.set(list, { ...data, view });
    updatePickBar(list);
    apply(list);
    enrich(list);
  }

  // ---------- nome/telefone pela sessão ----------
  // blocos antes do "Criar lead" (ex.: início por webhook) vêm no log sem lead e sem contato;
  // nome e telefone estão nos parâmetros/datasources da sessão (um pedido por sessão, com cache)
  const SESSION_PARALLEL = 6;
  const people = new Map(); // sessionId -> Promise<{ name, phone }>
  const details = new Map(); // sessionId -> Promise<detalhes|null> (aba Parados: a sessão ainda está no bloco?)

  function sessionDetails(id) {
    if (!lastReq) return Promise.reject(new Error("rota de logs ainda não capturada"));
    const headers = { ...lastReq.headers };
    delete headers["x-dz-include-totals"];
    return getJson(`${new URL(lastReq.url).origin}/api/crm/flow-sessions/${encodeURIComponent(id)}/details`, headers);
  }

  function fetchDetails(id) {
    if (!details.has(id))
      details.set(id, sessionDetails(id).catch(err => {
        details.delete(id);
        console.warn(`[Filtro de Logs] sessão ${id}:`, err.message);
        return null;
      }));
    return details.get(id);
  }

  // Parados em bloco de Espera: quem ainda está no bloco ganha a tag "em espera"
  async function markWaiting(list) {
    const a = api.get(list);
    if (!a?.stuck || !/espera/i.test(blockName(a.blockId))) return;
    let i = 0, timer;
    const redraw = () => { clearTimeout(timer); timer = setTimeout(() => api.get(list) === a && apply(list), 250); };
    const worker = async () => {
      while (i < a.items.length && api.get(list) === a) {
        const it = a.items[i++];
        if (stillIn(await fetchDetails(it.sessionId), it.blockId)) { it.waiting = true; it.text += " em espera"; redraw(); }
      }
    };
    await Promise.all(Array.from({ length: SESSION_PARALLEL }, worker));
  }

  function fetchPerson(id) {
    if (!people.has(id))
      people.set(id, sessionDetails(id).then(personOf, err => {
        people.delete(id); // falhou: tenta de novo na próxima carga
        console.warn(`[Filtro de Logs] sessão ${id}:`, err.message);
        return { name: "", phone: "" };
      }));
    return people.get(id);
  }

  async function enrich(list) {
    const a = api.get(list);
    const todo = a.items.filter(it => it.sessionId && (!it.phone || !(it.lead || it.contact)));
    let i = 0, timer;
    if (todo.length) a.view.dataset.dcfSessions = "loading"; // sinal para o teste real (teste/real)
    const redraw = () => { clearTimeout(timer); timer = setTimeout(() => api.get(list) === a && apply(list), 250); };
    const worker = async () => {
      while (i < todo.length && api.get(list) === a) {
        const it = todo[i++];
        const { name, phone } = await fetchPerson(it.sessionId);
        const add = [];
        if (name && !it.lead && !it.contact) add.push((it.lead = name));
        if (phone && !it.phone) add.push((it.phone = phone));
        if (!add.length) continue;
        it.text += ` ${add.join(" ")}`.toLowerCase();
        redraw();
      }
    };
    await Promise.all(Array.from({ length: SESSION_PARALLEL }, worker));
    delete a.view.dataset.dcfSessions;
  }

  function exitApi(list) {
    const a = api.get(list);
    if (!a) return;
    a.view.remove();
    list.classList.remove("dcf-native-off");
    api.delete(list);
    updatePickBar(list);
    if (list.isConnected) apply(list);
  }

  // ---------- sessão do log: caminho nos blocos + inspeção ----------
  const DB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`;

  const PLAY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`;

  // ---------- reprocessar a sessão a partir do bloco do log (mesma rota do ▶ do Clássico) ----------
  // sem repetir em erro de rede ou 5xx: o reprocesso pode ter rodado e mandaria a mensagem duas vezes
  async function reprocess(sessionId, blockId) {
    if (!lastReq) throw new Error("rota de logs ainda não capturada");
    const headers = { ...lastReq.headers, "content-type": "application/json" };
    delete headers["x-dz-include-totals"];
    const url = `${new URL(lastReq.url).origin}/api/crm/flow-sessions/${encodeURIComponent(sessionId)}/reprocess`;
    const body = JSON.stringify({ reprocessFromBlockId: blockId });
    const send = () => fetch(url, { method: "POST", headers, body, cache: "no-store" });
    let res = await send();
    if (res.status === 401 || res.status === 403) { // recusado antes de rodar: pode tentar com assinatura nova
      const sig = await freshSignature();
      if (sig) { headers["x-signature"] = sig; res = await send(); }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  // redesenha só os cards da sessão (a lista inteira perderia o que está aberto)
  function redrawSession(sessionId) {
    for (const a of api.values())
      a.view.querySelectorAll(`.dcf-item[data-sid="${CSS.escape(sessionId)}"]`).forEach(el => {
        const it = a.items.find(i => i.id === el.dataset.id);
        if (it) el.outerHTML = itemHtml(it);
      });
  }

  // confirmação no estilo do modal de inspeção; resolve true só no Confirmar
  function askConfirm(title, html) {
    return new Promise(resolve => {
      document.querySelector(".dcf-modal-bg")?.remove();
      const bg = document.createElement("div");
      bg.className = "dcf-modal-bg";
      const src = getComputedStyle(document.querySelector("#sheet") || document.body);
      if (src.backgroundColor && !/rgba\(.*,\s*0\)|transparent/.test(src.backgroundColor)) bg.style.setProperty("--dcf-mbg", src.backgroundColor);
      bg.style.setProperty("--dcf-mfg", src.color);
      bg.innerHTML = `
        <div class="dcf-confirm" role="dialog" aria-label="${escHtml(title)}">
          <div class="dcf-mtitle">${PLAY_ICON} ${escHtml(title)}</div>
          <p>${html}</p>
          <div class="dcf-mtools"><button data-a="cancel">Cancelar</button><button data-a="ok" class="dcf-primary">Confirmar</button></div>
        </div>`;
      document.body.appendChild(bg);
      const close = ok => { bg.remove(); document.removeEventListener("keydown", onKey, true); resolve(ok); };
      const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(false); } };
      document.addEventListener("keydown", onKey, true);
      bg.onclick = e => { if (e.target === bg) close(false); };
      bg.querySelector('[data-a="cancel"]').onclick = () => close(false);
      bg.querySelector('[data-a="cancel"]').focus(); // Enter sem querer não reprocessa
      bg.querySelector('[data-a="ok"]').onclick = () => close(true);
    });
  }

  async function runReprocess(it) {
    const key = `${it.sessionId}|${it.blockId}`;
    reproc.set(key, { st: "busy" });
    redrawSession(it.sessionId);
    try {
      await reprocess(it.sessionId, it.blockId);
      reproc.set(key, { st: "ok" });
      picked.delete(key);
    } catch (err) {
      reproc.set(key, { st: "fail", msg: err.message });
    }
    redrawSession(it.sessionId);
    return reproc.get(key).st === "ok";
  }

  async function confirmReprocess(list, itemId) {
    const it = api.get(list)?.items.find(i => i.id === itemId);
    if (!it || reproc.get(`${it.sessionId}|${it.blockId}`)?.st === "busy") return;
    const name = it.lead || it.contact || fmtPhone(it.phone) || "sem lead";
    const ok = await askConfirm("Reprocessar a sessão?",
      `A sessão de <b>${escHtml(name)}</b> vai rodar de novo a partir do bloco <b>${escHtml(blockName(it.blockId))}</b>.
       Mensagens deste bloco em diante são enviadas outra vez.`);
    if (ok) await runReprocess(it);
  }

  // ---------- seleção para reprocessar em lote ----------
  // um card por sessão: a mesma sessão repetida no bloco é reprocessada uma vez só
  function pickedItems(list) {
    const a = api.get(list), seen = new Set();
    return (a?.items || []).filter(it => {
      const k = `${it.sessionId}|${it.blockId}`;
      if (!picked.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function pick(list, itemId, on) {
    const it = api.get(list)?.items.find(i => i.id === itemId);
    if (!it) return;
    const k = `${it.sessionId}|${it.blockId}`;
    if (on) picked.add(k); else picked.delete(k);
    redrawSession(it.sessionId); // outros cards da mesma sessão acompanham
    updatePickBar(list);
  }

  function updatePickBar(list) {
    const bar = bars.get(list);
    if (!bar) return;
    const n = pickedItems(list).length;
    const btn = bar.querySelector('[data-a="rpsel"]');
    if (!btn.dataset.running) { btn.textContent = `Reprocessar selecionados (${n})`; btn.disabled = !n; }
    const all = bar.querySelector('[data-a="pickall"]');
    const vis = (api.get(list)?.items || []).filter(i => i.visible && i.sessionId && i.blockId);
    all.checked = !!vis.length && vis.every(i => picked.has(`${i.sessionId}|${i.blockId}`));
    bar.querySelector(".dcf-pickrow").hidden = !api.has(list);
    bar.querySelector('[data-a="stuck"]').classList.toggle("dcf-on", !!api.get(list)?.stuck); // aba Parados aberta
  }

  let bulkStop = false;
  async function reprocessPicked(list, btn) {
    if (btn.dataset.running) { bulkStop = true; return; } // segundo clique = cancelar
    const todo = pickedItems(list);
    if (!todo.length) return;
    const ok = await askConfirm(`Reprocessar ${todo.length} ${todo.length === 1 ? "sessão" : "sessões"}?`,
      `${todo.length === 1 ? "A sessão selecionada vai" : `As ${todo.length} sessões selecionadas vão`} rodar de novo a partir do bloco
       <b>${escHtml(blockName(todo[0].blockId))}</b>, uma por vez. Mensagens deste bloco em diante são enviadas outra vez.`);
    if (!ok) return;
    bulkStop = false;
    btn.dataset.running = "1";
    let done = 0, fail = 0;
    for (const it of todo) {
      if (bulkStop) break;
      btn.textContent = `Reprocessando ${done + fail + 1}/${todo.length}… (Cancelar)`;
      if (await runReprocess(it)) done++; else fail++;
    }
    delete btn.dataset.running;
    updatePickBar(list);
    setCount(list, ...countOf(list), ` – reprocessados: ${done}${fail ? `, falharam: ${fail}` : ""}${bulkStop ? " (cancelado)" : ""}`);
  }

  const countOf = list => { const it = api.get(list)?.items || []; return [it.filter(i => i.visible).length, it.length]; };

  // mesma ação do card do Clássico; clicar de novo na mesma sessão apaga o caminho (como no Clássico)
  function selectSession(id) {
    selSession = selSession === id ? null : id;
    window.postMessage({ source: "dcf-content", type: "load-session", id }, location.origin);
    for (const a of api.values())
      a.view.querySelectorAll(".dcf-item[data-sid]").forEach(el => el.classList.toggle("dcf-sel", el.dataset.sid === selSession));
  }

  // nome do bloco no editor (o histórico da sessão só traz o id)
  function blockName(id) {
    const node = document.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
    return node?.querySelector("span.text-base.font-semibold")?.textContent.trim() || id;
  }

  function treeHtml(v, key, depth = 0) {
    v = unwrap(v);
    const k = key === undefined ? "" : `<span class="dcf-tk">${escHtml(key)}</span>`;
    if (v && typeof v === "object") {
      const entries = Object.entries(v);
      const size = Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`;
      if (!entries.length) return `<div class="dcf-tr">${k}<span class="dcf-tn">${size}</span></div>`;
      return `<details${depth < 2 ? " open" : ""}><summary>${k}<span class="dcf-tn">${size}</span></summary>
        <div class="dcf-tin">${entries.map(([ck, cv]) => treeHtml(cv, ck, depth + 1)).join("")}</div></details>`;
    }
    const t = v === null ? "null" : typeof v;
    const txt = t === "string" ? `"${v}"` : String(v);
    return `<div class="dcf-tr">${k}<span class="dcf-tv dcf-t-${t}">${escHtml(txt)}</span></div>`;
  }

  function historyHtml(hist) {
    if (!hist.length) return `<div class="dcf-empty">Sem histórico.</div>`;
    return hist.map((h, i) => {
      const a = new Date(h.enteredDate), b = h.exitedDate ? new Date(h.exitedDate) : null;
      const dur = b ? `${fmtN(b - a)} ms` : "ainda no bloco";
      return `<div class="dcf-hrow${h.hasErrors ? " dcf-herr" : ""}">
        <span class="dcf-hpos">${i + 1}º</span>
        <span class="dcf-hname">${escHtml(blockName(h.flowBlockId))}</span>
        <span class="dcf-hmeta">${fmtDate(a)}:${pad(a.getSeconds())} · ${dur}${h.hasErrors ? " · com erro" : ""}</span>
      </div>`;
    }).join("");
  }

  async function openSession(id) {
    document.querySelector(".dcf-modal-bg")?.remove();
    const bg = document.createElement("div");
    bg.className = "dcf-modal-bg";
    // herda as cores do painel do Datacrazy (tema claro ou escuro)
    const src = getComputedStyle(document.querySelector("#sheet") || document.body);
    const opaque = c => c && !/rgba\(.*,\s*0\)|transparent/.test(c);
    if (opaque(src.backgroundColor)) bg.style.setProperty("--dcf-mbg", src.backgroundColor);
    bg.style.setProperty("--dcf-mfg", src.color);
    bg.innerHTML = `
      <div class="dcf-modal" role="dialog" aria-label="Inspeção da sessão">
        <div class="dcf-mhead">
          <div><div class="dcf-mtitle">${DB_ICON} Inspeção da sessão</div><div class="dcf-msub">Sessão ${escHtml(id)}</div></div>
          <div class="dcf-mtools">
            <div class="dcf-seg"><button data-v="tree" class="dcf-on">Árvore</button><button data-v="raw">Raw</button></div>
            <button data-a="copy">Copiar JSON</button>
            <button data-a="close" title="Fechar (Esc)">✕</button>
          </div>
        </div>
        <div class="dcf-mbody">
          <div class="dcf-mnav"></div>
          <div class="dcf-mcontent"><div class="dcf-empty"><span class="dcf-spinner"></span> Buscando dados da sessão…</div></div>
        </div>
      </div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    bg.onclick = e => { if (e.target === bg) close(); };
    bg.querySelector('[data-a="close"]').onclick = close;
    const content = bg.querySelector(".dcf-mcontent");

    let data;
    try {
      data = await sessionDetails(id);
    } catch (err) {
      content.innerHTML = `<div class="dcf-empty">Não foi possível buscar a sessão: ${escHtml(err.message)}</div>`;
      return;
    }
    if (!bg.isConnected) return;

    const { parameters = {}, datasources = {}, history = [], ...meta } = data || {};
    const sections = [
      { name: "Sessão/metadados", value: meta },
      { name: "Parâmetros", value: parameters },
      { name: "Datasources", value: datasources },
      { name: "Histórico", value: history, html: () => historyHtml(history) }
    ];
    const count = v => Array.isArray(v) ? `${v.length} itens` : `${Object.keys(v || {}).length} chaves`;
    let cur = 0, view = "tree";
    const nav = bg.querySelector(".dcf-mnav");
    nav.innerHTML = sections.map((s, i) => `<button data-i="${i}"><b>${s.name}</b><span>${count(s.value)}</span></button>`).join("");
    const render = () => {
      const s = sections[cur];
      nav.querySelectorAll("[data-i]").forEach(b => b.classList.toggle("dcf-on", +b.dataset.i === cur));
      bg.querySelectorAll("[data-v]").forEach(b => b.classList.toggle("dcf-on", b.dataset.v === view));
      content.innerHTML = view === "raw"
        ? `<pre class="dcf-raw">${escHtml(JSON.stringify(s.value, null, 2))}</pre>`
        : s.html ? s.html()
        : `<div class="dcf-tree">${Object.entries(s.value || {}).map(([k, v]) => treeHtml(v, k)).join("") || `<div class="dcf-empty">Vazio.</div>`}</div>`;
    };
    nav.onclick = e => { const b = e.target.closest("[data-i]"); if (b) { cur = +b.dataset.i; render(); } };
    bg.querySelectorAll("[data-v]").forEach(b => (b.onclick = () => { view = b.dataset.v; render(); }));
    const copy = bg.querySelector('[data-a="copy"]');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(sections[cur].value, null, 2));
        copy.textContent = "Copiado";
      } catch { copy.textContent = "Falhou"; }
      setTimeout(() => (copy.textContent = "Copiar JSON"), 1200);
    };
    render();
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
    if (mode === "classic") return [];
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

  // aba "Parados" da extensão: Entraram menos (Sucessos + Erros) do bloco aberto, cruzando pela sessão
  async function loadStuck(list, btn) {
    if (mode === "classic" || !lastReq) return [];
    const my = ++loadSeq;
    let userCancel = false;
    const cancelled = () => userCancel || my !== loadSeq;
    btn.disabled = true;
    list.classList.add("dcf-native-off");
    api.get(list)?.view.classList.add("dcf-native-off");
    const loading = showLoading(list, () => { userCancel = true; });
    const TYPES = [["entered", "Entraram"], ["succeeded", "Sucessos"], ["error", "Erros"], ["warning", "Alertas"]];
    const got = {};
    let err = "";
    try {
      for (const [type, label] of TYPES) {
        loading.update(0, null);
        const data = await fetchAllLogs((n, total) => !cancelled() && loading.update(n, total), cancelled, type);
        if (cancelled()) break;
        got[type] = data;
        if (data.error) err = `${label}: ${data.error}`; // faltou parte: a lista pode trazer quem não está parado
        btn.textContent = `Parados… (${label})`;
      }
      if (!cancelled()) {
        const blockId = new URL(lastReq.url).searchParams.get("filter[flowBlockId]") || "";
        const items = stuckItems(got.entered.items, got.succeeded.items, got.error.items, got.warning.items);
        enterApi(list, { items, from: state.from, to: state.to, key: reqKey(lastReq.url), error: err, stuck: true, blockId });
        markWaiting(list);
      }
    } catch (e) {
      if (!cancelled()) setCount(list, 0, 0, ` – não foi possível montar os parados: ${e.message}`);
      if (!api.has(list)) list.classList.remove("dcf-native-off");
    }
    loading.remove();
    api.get(list)?.view.classList.remove("dcf-native-off");
    if (my === loadSeq) { btn.textContent = "Parados"; btn.disabled = false; }
    return api.has(list) ? apply(list) : [];
  }

  function tabName() {
    const tab = document.querySelector('[role="tab"][aria-selected="true"], [role="tab"][data-state="active"]');
    return (tab?.innerText || "logs").trim().toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-");
  }

  // baixa as linhas que passam no filtro (sem filtro = todas)
  async function downloadCsv(list, btn) {
    const a = api.get(list);
    const fresh = a && ((a.from === state.from && a.to === state.to && !a.error) || a.stuck);
    const rows = (fresh ? apply(list) : await loadEverything(list, bars.get(list).querySelector('[data-a="load"]')))
      .filter(i => i.visible);
    btn.disabled = true;
    const esc = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ["data;status;lead;contato;telefone",
      ...rows.map(r => [r.dateText, r.status, r.lead, r.contact, r.phone].map(esc).join(";"))].join("\r\n");
    const d = new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })); // BOM = acentos certos no Excel
    const link = Object.assign(document.createElement("a"), { href: url, download: `logs-${a?.stuck ? "parados" : tabName()}-${stamp}.csv` });
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
        ${dateField("from", "De", "Escolher data inicial")}
        ${dateField("to", "Até", "Escolher data final")}
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
        <button data-a="stuck" title="Quem entrou neste bloco e não tem sucesso nem erro">Parados</button>
        <button data-a="csv">Baixar CSV</button>
        <button data-a="clear">Limpar</button>
      </div>
      <div class="dcf-row dcf-pickrow" hidden>
        <label title="Marca todos os logs que passam no filtro"><input type="checkbox" data-a="pickall"> Selecionar todos</label>
        <button data-a="rpsel" disabled>Reprocessar selecionados (0)</button>
      </div>`;

    const min = retentionStart(), p2 = n => String(n).padStart(2, "0");
    const minStr = `${min.getFullYear()}-${p2(min.getMonth() + 1)}-${p2(min.getDate())}T00:00`;
    bar.querySelectorAll('input[type="datetime-local"]').forEach(i => (i.min = minStr));
    initFolhinhas(bar);
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
          refetchTimer = setTimeout(() => api.get(list)?.stuck
            ? loadStuck(list, bar.querySelector('[data-a="stuck"]'))
            : loadEverything(list, bar.querySelector('[data-a="load"]')), 800);
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
    bar.querySelector('[data-a="stuck"]').onclick = e => loadStuck(list, e.currentTarget);
    bar.querySelector('[data-a="rpsel"]').onclick = e => reprocessPicked(list, e.currentTarget);
    bar.querySelector('[data-a="pickall"]').onchange = e => {
      const vis = (api.get(list)?.items || []).filter(i => i.visible && i.sessionId && i.blockId);
      for (const i of vis) { const k = `${i.sessionId}|${i.blockId}`; if (e.target.checked) picked.add(k); else picked.delete(k); }
      apply(list);
      updatePickBar(list);
    };
    bar.querySelector('[data-a="csv"]').onclick = e => downloadCsv(list, e.currentTarget);
    bar.querySelector('[data-a="clear"]').onclick = () => {
      Object.assign(state, { q: "", from: "", to: "", unique: false, onlyDup: false });
      // o estado é global: limpa os campos de todas as barras, não só desta
      bars.forEach((b, l) => {
        b.querySelectorAll("[data-k]").forEach(i => (i.type === "checkbox" ? (i.checked = false) : (i.value = "")));
        b.querySelectorAll(".dcf-date input").forEach(i => i.dispatchEvent(new Event("change"))); // folhinha volta para hoje
        apply(l);
      });
    };
    return bar;
  }

  // campo de data com "folhinha de mesa": mostra mês/dia escolhidos (vazio = hoje).
  // Quem abre o seletor é o hook.js: showPicker() falha calado no mundo isolado da extensão.
  const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const dateField = (k, title, label) => `
    <div class="dcf-date">
      <span class="dcf-date-lbl">${title}:</span>
      <input type="datetime-local" data-k="${k}" title="${title}">
      <button type="button" class="dcf-date-pill" aria-label="${label}">
        <span class="dcf-desk-cal" aria-hidden="true"><span class="dcf-desk-cal-mes"></span><span class="dcf-desk-cal-dia"></span></span>
        <span class="dcf-date-pill-txt">Escolher</span>
      </button>
    </div>`;

  function initFolhinhas(root) {
    root.querySelectorAll(".dcf-date").forEach(field => {
      const input = field.querySelector("input");
      const mes = field.querySelector(".dcf-desk-cal-mes"), dia = field.querySelector(".dcf-desk-cal-dia");
      const atualizar = () => {
        const d = input.value ? new Date(input.value) : new Date();
        mes.textContent = MESES[d.getMonth()];
        dia.textContent = d.getDate();
      };
      input.addEventListener("change", atualizar);
      input.addEventListener("input", atualizar);
      atualizar();
    });
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

  // ---------- seletor Clássico / Crazy ----------
  function makeToggle() {
    const el = document.createElement("div");
    el.className = "dcf-mode";
    el.innerHTML = `<button data-m="classic" title="Painel original do Datacrazy">Clássico</button><button data-m="crazy" title="Barra de filtro e log completo">Crazy</button>`;
    el.querySelectorAll("[data-m]").forEach(b => (b.onclick = () => setMode(b.dataset.m)));
    return el;
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    try { localStorage.setItem("dcf-mode", m); } catch {}
    if (m === "classic") loadSeq++; // descarta carga em andamento
    for (const [list, bar] of bars) {
      if (m === "classic") exitApi(list);
      bar.classList.toggle("dcf-off", m === "classic");
      apply(list);
    }
    updateToggles();
    // voltou ao Crazy com o automático ligado: carrega a lista visível
    if (m === "crazy" && auto && lastReq) pendingAuto = reqKey(lastReq.url);
    scan();
  }

  function updateToggles() {
    toggles.forEach(el => el.querySelectorAll("[data-m]").forEach(b => b.classList.toggle("dcf-on", b.dataset.m === mode)));
  }

  // ---------- observar o DOM (SPA) ----------
  function scan() {
    // remove barras órfãs
    for (const [list, bar] of bars) {
      if (!list.isConnected) { exitApi(list); bar.remove(); bars.delete(list); toggles.get(list)?.remove(); toggles.delete(list); }
    }
    const lists = new Set(findCards().map(c => c.parentElement));
    for (const list of lists) {
      if (!bars.has(list)) {
        const bar = makeBar(list);
        const toggle = makeToggle();
        list.parentElement.insertBefore(toggle, list);
        list.parentElement.insertBefore(bar, list); // fora do container do React
        list.parentElement.classList.add("dcf-host"); // CSS respeita o atributo [hidden] das abas inativas
        bar.classList.toggle("dcf-off", mode === "classic");
        bars.set(list, bar);
        toggles.set(list, toggle);
        updateToggles();
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
    if (muts.every(m => m.target.closest?.(".dcf-bar, .dcf-list, .dcf-mode, .dcf-modal-bg"))) return;
    clearTimeout(t);
    t = setTimeout(scan, 300);
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
