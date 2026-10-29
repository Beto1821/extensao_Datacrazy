// CRM falso para os testes ponta a ponta: uma página parecida com o editor de flow do Datacrazy
// (blocos, painel de logs com abas e cards nativos) e uma API falsa de logs e sessões.
// Nada sai para a internet: o Playwright responde todas as chamadas a crm.datacrazy.io.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const ORIGIN = "https://crm.datacrazy.io";
const FLOW = "flow-teste", VERSION = "versao-teste";
const APP_SIG = "sig-da-aplicacao"; // assinatura que a "aplicação" manda; o cenário pode recusá-la

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
               "outubro", "novembro", "dezembro"];

// log cru, no formato da rota /logs
function log(block, type, i, over = {}) {
  return {
    flowBlockId: block, flowSessionId: `s${i}`, contactId: "", contactName: "", platform: null,
    createdAt: new Date(Date.UTC(2026, 9, 27, 18, 0) - i * 60e3).toISOString(),
    message: type, errorCode: "", errorParameters: null, type, lead: null, business: null, ...over
  };
}

// sessão no formato de /flow-sessions/<id>/details
function session(id, name, phone) {
  return {
    id, parameters: { leadName: name, leadPhone: phone },
    datasources: { "Api-request-1": { name, phone } }, history: []
  };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>CRM falso</title>
<script id="env">window.__ENV = {"REQUEST_SIGNATURE_KEY":"chave-publica-teste"}</script>
<style>body{font:14px sans-serif;margin:0;display:flex} .react-flow{flex:1;padding:16px}
.react-flow__node{border:1px solid #ccc;margin:8px;padding:8px;width:260px} .react-flow__node b{cursor:pointer;margin-right:8px}
#sheet{width:420px;border-left:1px solid #ccc;padding:8px;height:100vh;overflow:auto} [role=tab][aria-selected=true]{font-weight:bold}</style>
</head><body>
<div class="react-flow">
  <div class="react-flow__node" data-id="bloco-inicio"><span class="text-base font-semibold">Início</span><br>
    <b data-t="succeeded">Sucessos</b><b data-t="warning">Alertas</b><b data-t="error">Erros</b></div>
  <div class="react-flow__node" data-id="bloco-acao"><span class="text-base font-semibold">Ação</span><br>
    <b data-t="succeeded">Sucessos</b><b data-t="warning">Alertas</b><b data-t="error">Erros</b></div>
  <div class="react-flow__node" data-id="bloco-espera"><span class="text-base font-semibold">Espera</span><br>
    <b data-t="succeeded">Sucessos</b><b data-t="warning">Alertas</b><b data-t="error">Erros</b></div>
</div>
<div id="sheet" hidden>
  <div>Logs do bloco</div>
  <div><span role="tab" data-t="entered">Entraram</span> <span role="tab" data-t="succeeded">Sucessos</span>
       <span role="tab" data-t="warning">Alertas</span> <span role="tab" data-t="error">Erros</span></div>
  <div><div id="lista"></div></div>
</div>
<script>
  const MESES = ${JSON.stringify(MESES)};
  let block = null, type = null, seq = 0;
  const pad = n => String(n).padStart(2, "0");
  const dataPt = d => d.getDate() + " de " + MESES[d.getMonth()] + " de " + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  async function open(b, t) {
    block = b; type = t; const my = ++seq;
    document.getElementById("sheet").hidden = false;
    document.querySelectorAll("[role=tab]").forEach(x => x.setAttribute("aria-selected", x.dataset.t === t));
    const u = "/api/crm/flows/${FLOW}/versions/${VERSION}/logs?take=30&skip=0&filter%5BflowBlockId%5D=" + b + "&filter%5Btype%5D=" + t;
    const res = await window.fetch(u, { headers: { authorization: "Bearer token-teste", "x-signature": "${APP_SIG}", "x-dz-include-totals": "true" } });
    const json = await res.json();
    if (my !== seq) return;
    document.getElementById("lista").innerHTML = json.data.map(r =>
      '<div class="cursor-pointer rounded-lg"><div>' + dataPt(new Date(r.createdAt)) + '</div><div>' + r.type + '</div>' +
      (r.lead ? '<div>Lead:</div><div>' + r.lead.name + '</div>' : '') + '</div>').join("");
  }
  document.querySelectorAll(".react-flow__node b").forEach(e => e.onclick = () => open(e.closest(".react-flow__node").dataset.id, e.dataset.t));
  document.querySelectorAll("[role=tab]").forEach(e => e.onclick = () => block && open(block, e.dataset.t));
</script></body></html>`;

// cenário: { logs: { "bloco|tipo": [log...] }, sessions: { id: sessão }, pageCap, sessionDelay,
//            sessionStatus(id, tentativa) -> status|undefined,
//            reprocessStatus(id) -> status|undefined, logsStatus(skip, headers) -> status|undefined }
async function abrir(cenario = {}) {
  const sc = { logs: {}, sessions: {}, pageCap: 93, sessionDelay: 0, ...cenario };
  const stats = { sessionCalls: {}, inFlight: 0, maxInFlight: 0, logsCalls: [], signatures: new Set(), reprocessCalls: [] };
  const exe = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ headless: process.env.HEADED ? false : true, executablePath: exe });
  const context = await browser.newContext({ acceptDownloads: true, timezoneId: "America/Sao_Paulo", locale: "pt-BR" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));

  await page.route(`${ORIGIN}/**`, async route => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (u.pathname.startsWith("/flow/")) return route.fulfill({ contentType: "text/html", body: PAGE });
    if (u.pathname === "/api/time") return json(200, { iso: new Date().toISOString() });

    const rp = u.pathname.match(/^\/api\/crm\/flow-sessions\/([^/]+)\/reprocess$/);
    if (rp && req.method() === "POST") {
      const id = decodeURIComponent(rp[1]);
      stats.reprocessCalls.push({ id, body: JSON.parse(req.postData() || "null"), type: req.headers()["content-type"] });
      const st = sc.reprocessStatus?.(id);
      return st ? json(st, { message: "erro simulado" }) : route.fulfill({ status: 204, body: "" });
    }

    const m = u.pathname.match(/^\/api\/crm\/flow-sessions\/([^/]+)\/details$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const n = stats.sessionCalls[id] = (stats.sessionCalls[id] || 0) + 1;
      stats.inFlight++;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      await new Promise(r => setTimeout(r, sc.sessionDelay));
      stats.inFlight--;
      const st = sc.sessionStatus?.(id, n);
      if (st) return json(st, { message: "erro simulado" });
      return sc.sessions[id] ? json(200, sc.sessions[id]) : json(404, { message: "sessão não existe" });
    }

    if (u.pathname === `/api/crm/flows/${FLOW}/versions/${VERSION}/logs`) {
      const q = u.searchParams, h = req.headers();
      const skip = +q.get("skip") || 0, take = Math.min(+q.get("take") || 30, sc.pageCap);
      stats.logsCalls.push({ skip, take, asked: +q.get("take") });
      stats.signatures.add(h["x-signature"]);
      const st = sc.logsStatus?.(skip, h, +q.get("take"));
      if (st) return json(st, { message: "erro simulado" });
      const all = sc.logs[`${q.get("filter[flowBlockId]")}|${q.get("filter[type]")}`] || [];
      return json(200, { count: all.length, data: all.slice(skip, skip + take) });
    }
    return json(404, {});
  });

  // mesma ordem do manifest: hook.js antes da aplicação; lib.js, content.js e styles.css depois
  await page.addInitScript({ content: fs.readFileSync(path.join(ROOT, "hook.js"), "utf8") });
  await page.goto(`${ORIGIN}/flow/${FLOW}`);
  await page.addStyleTag({ path: path.join(ROOT, "styles.css") });
  await page.addScriptTag({ path: path.join(ROOT, "lib.js") });
  await page.addScriptTag({ path: path.join(ROOT, "content.js") });

  let mark = 0; // posição em stats.logsCalls no último clique
  return {
    page, stats, errors, sc,
    // clica numa aba do bloco (como o usuário) e espera a lista da extensão terminar
    async abrirBloco(bloco, tab = "Sucessos") {
      mark = stats.logsCalls.length;
      await page.locator(`.react-flow__node[data-id="${bloco}"]`).getByText(tab, { exact: true }).click();
    },
    async aba(tab) { mark = stats.logsCalls.length; await page.getByRole("tab", { name: tab, exact: true }).click(); },
    // espera a lista Crazy carregar e a busca de sessões acabar
    async esperarLista(timeout = 30000) {
      // primeiro a carga da extensão (take=200) que começou depois do último clique
      const t0 = Date.now();
      while (!stats.logsCalls.slice(mark).some(c => c.asked === 200)) {
        if (Date.now() - t0 > timeout) throw new Error("a extensão não buscou os logs");
        await page.waitForTimeout(100);
      }
      await page.waitForFunction(() => {
        const v = [...document.querySelectorAll(".dcf-list")].find(l => l.offsetParent !== null);
        return v && !v.dataset.dcfSessions && !document.querySelector(".dcf-loading");
      }, null, { timeout });
      await page.waitForTimeout(400); // redesenho atrasado da lista (250 ms)
    },
    itens: () => page.$$eval(".dcf-list .dcf-item", els => els.map(e => ({
      sid: e.dataset.sid,
      name: e.querySelector(".dcf-name")?.textContent,
      phone: e.querySelector(".dcf-phone")?.textContent || ""
    }))),
    contador: () => page.locator(".dcf-count").first().innerText(),
    fechar: () => browser.close()
  };
}

module.exports = { abrir, log, session, APP_SIG };
