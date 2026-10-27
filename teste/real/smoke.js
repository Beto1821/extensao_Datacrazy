// Teste no CRM real: abre o Chromium com a extensão, espera você fazer login, passa por todos os
// blocos e abas do flow e mostra um relatório (logs, sem nome, sem telefone, falhas).
// Uso: npm run real -- https://crm.datacrazy.io/flow/<id-do-flow>
// O login fica salvo em ~/.cache/dcf-teste-perfil (fora do OneDrive e do git); o relatório vai para teste/relatorios/.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "..");
const ABAS = ["Sucessos", "Entraram", "Alertas", "Erros"]; // Sucessos primeiro: é o contador que abre o painel
const LOGIN_TIMEOUT = 10 * 60e3;
const LISTA_TIMEOUT = 180e3; // blocos com milhares de logs demoram

const url = process.argv[2];
if (!/^https:\/\/crm\.datacrazy\.io\/flow\//.test(url || "")) {
  console.error("Uso: npm run real -- https://crm.datacrazy.io/flow/<id-do-flow>");
  process.exit(2);
}

(async () => {
  const ctx = await chromium.launchPersistentContext(process.env.DCF_PERFIL || path.join(os.homedir(), ".cache", "dcf-teste-perfil"), {
    headless: false, viewport: null, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`]
  });
  // modo Crazy com carga automática, como vem de fábrica
  await ctx.addInitScript(() => {
    try { localStorage.setItem("dcf-mode", "crazy"); localStorage.setItem("dcf-auto", "1"); } catch {}
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const erros = [];
  // erro com chrome-extension:// na pilha é da extensão; o resto é do próprio Datacrazy
  page.on("pageerror", e => erros.push(/chrome-extension:\/\//.test(e.stack || "")
    ? `erro da extensão: ${e.message}` : `erro do Datacrazy (não é da extensão): ${e.message}`));
  page.on("console", m => { if (/\[Filtro de Logs\]/.test(m.text())) erros.push(m.text()); });

  await page.goto(url);
  console.log("Faça login na janela do Chromium, se pedir. Esperando o editor do flow abrir…");
  await page.waitForSelector(".react-flow__node", { timeout: LOGIN_TIMEOUT });
  await page.waitForTimeout(2000);
  await page.locator(".react-flow__controls-fitview").click().catch(() => {}); // todos os blocos na tela
  await page.waitForTimeout(1000);

  const blocos = await page.$$eval(".react-flow__node", ns => ns
    .filter(n => /Sucessos/.test(n.innerText))
    .map(n => ({ id: n.dataset.id, nome: n.innerText.split("\n")[0].trim() })));
  console.log(`${blocos.length} blocos com logs. Testando ${ABAS.length} abas em cada um…\n`);

  const linhas = [];
  for (const b of blocos) {
    for (const aba of ABAS) {
      const r = { bloco: b.nome, id: b.id, aba, datacrazy: null, extensao: null, semNome: 0, semTel: 0, segundos: 0, problema: "" };
      const t0 = Date.now();
      try {
        // resposta da própria aplicação (take=30): traz o total que o Datacrazy conhece
        // só vale a resposta deste bloco: assim um clique perdido não mede o bloco anterior
        const resp = page.waitForResponse(x => /\/logs\?/.test(x.url()) && /[?&]take=30(&|$)/.test(x.url())
          && new URL(x.url()).searchParams.get("filter[flowBlockId]") === b.id, { timeout: 30e3 });
        resp.catch(() => {}); // se o clique falhar, a espera não derruba o processo
        // evento de clique direto no elemento: o menu "Blocos básicos" e o painel de logs ficam por
        // cima de alguns blocos e roubariam um clique de mouse
        const alvo = aba === "Sucessos"
          ? page.locator(`.react-flow__node[data-id="${b.id}"]`).getByText("Sucessos", { exact: true }).last()
          : page.getByRole("tab", { name: aba, exact: true });
        for (const ev of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) await alvo.dispatchEvent(ev);
        const json = await (await resp).json().catch(() => null);
        r.datacrazy = json?.count ?? null;
        await page.waitForTimeout(1500);
        if (r.datacrazy === 0) r.extensao = 0;
        else await medir(r);
      } catch (e) {
        r.problema = e.name !== "TimeoutError" ? e.message.split("\n")[0]
          : r.datacrazy === null ? "o Datacrazy não buscou os logs (clique não abriu o bloco?)" : "a lista da extensão travou (tempo esgotado)";
      }
      r.segundos = Math.round((Date.now() - t0) / 100) / 10;
      linhas.push(r);
      console.log(`${r.problema ? "✖" : "✔"} ${r.bloco} › ${r.aba}: ${r.extensao ?? "-"} logs, ${r.semNome} sem nome, ${r.semTel} sem telefone (${r.segundos}s)${r.problema ? ` – ${r.problema}` : ""}`);
    }
  }

  // espera a lista da extensão e conta o que ela mostra
  async function medir(r) {
    await page.waitForFunction(() => {
      const v = [...document.querySelectorAll(".dcf-list")].find(l => l.offsetParent !== null);
      return v && !v.dataset.dcfSessions && !document.querySelector(".dcf-loading");
    }, null, { timeout: LISTA_TIMEOUT });
    await page.waitForTimeout(500);
    Object.assign(r, await page.evaluate(() => {
      const v = [...document.querySelectorAll(".dcf-list")].find(l => l.offsetParent !== null);
      const itens = [...v.querySelectorAll(".dcf-item")];
      const contador = [...document.querySelectorAll(".dcf-count")].find(c => c.offsetParent !== null)?.textContent || "";
      return {
        extensao: +(contador.match(/de ([\d.]+)/)?.[1] || "0").replace(/\./g, ""),
        semNome: itens.filter(e => /^(\(sem lead\)|\+)/.test(e.querySelector(".dcf-name").textContent)).length,
        semTel: itens.filter(e => !e.querySelector(".dcf-phone")).length,
        // sessões para abrir na inspeção (ícone de banco de dados) e ver por que vieram vazias
        sessoesSemNome: itens.filter(e => /^\(sem lead\)/.test(e.querySelector(".dcf-name").textContent)).slice(0, 5).map(e => e.dataset.sid),
        problema: /incompleto/.test(contador) ? contador.replace(/.*– /, "") : ""
      };
    }));
    if (!r.problema && r.datacrazy != null && r.extensao !== r.datacrazy)
      r.problema = `extensão mostra ${r.extensao}, Datacrazy diz ${r.datacrazy}`;
  }

  const problemas = linhas.filter(l => l.problema);
  console.log("\nResumo:");
  console.table(linhas.map(({ id, sessoesSemNome, ...l }) => l));
  if (erros.length) console.log("Avisos e erros da extensão no console:\n" + [...new Set(erros)].map(e => `  - ${e}`).join("\n"));

  const dir = path.join(__dirname, "..", "relatorios");
  fs.mkdirSync(dir, { recursive: true });
  const arq = path.join(dir, `relatorio-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(arq, JSON.stringify({ url, quando: new Date().toISOString(), linhas, erros }, null, 2));
  console.log(`\nRelatório: ${arq}`);
  const daExtensao = erros.filter(e => /^erro da extensão/.test(e)).length;
  const total = problemas.length + daExtensao;
  console.log(total ? `${total} problema(s) encontrado(s).` : "Nenhum problema encontrado.");
  await ctx.close();
  process.exit(total ? 1 : 0);
})();
