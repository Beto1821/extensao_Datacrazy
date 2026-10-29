// Extensão rodando num CRM falso (crm-falso.js): carga dos logs, nome/telefone pela sessão,
// falhas da API (401, 500, página quebrada), filtro, CSV e seletor Clássico/Crazy.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { abrir, log, session, APP_SIG } = require("./crm-falso");

const I = "bloco-inicio", A = "bloco-acao";

// abre o CRM falso, roda o teste e sempre fecha o navegador
const comCrm = (cenario, fn) => async () => {
  const crm = await abrir(cenario);
  try {
    await fn(crm);
    assert.deepEqual(crm.errors, [], "erro de JavaScript na página");
  } finally {
    await crm.fechar();
  }
};

test("início com webhook: nome e telefone vêm da sessão", comCrm({
  logs: { [`${I}|succeeded`]: [0, 1, 2].map(i => log(I, "succeeded", i)) },
  sessions: {
    s0: session("s0", "Maria Teste", "5511987654321"),
    s1: session("s1", "João Exemplo", "5521912345678"),
    s2: session("s2", "", "") // webhook vazio
  }
}, async crm => {
  await crm.abrirBloco(I);
  await crm.esperarLista();
  assert.deepEqual(await crm.itens(), [
    { sid: "s0", name: "Maria Teste", phone: "+55 (11) 98765-4321" },
    { sid: "s1", name: "João Exemplo", phone: "+55 (21) 91234-5678" },
    { sid: "s2", name: "(sem lead)", phone: "" }
  ]);
  assert.equal(await crm.contador(), "Mostrando 3 de 3");
}));

test("Criar lead: nome do log fica, só o telefone vem da sessão", comCrm({
  logs: { [`${A}|succeeded`]: [log(A, "succeeded", 0, { lead: { name: "Nome do Lead" } })] },
  sessions: { s0: session("s0", "Outro Nome", "5511987654321") }
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  assert.deepEqual(await crm.itens(), [{ sid: "s0", name: "Nome do Lead", phone: "+55 (11) 98765-4321" }]);
}));

test("log com nome e telefone não busca a sessão", comCrm({
  logs: { [`${A}|succeeded`]: [log(A, "succeeded", 0, { lead: { name: "Completo" }, contactId: "5511987654321" })] }
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  assert.deepEqual(crm.stats.sessionCalls, {});
}));

test("no máximo 6 sessões ao mesmo tempo, uma vez cada, com cache entre abas", comCrm({
  logs: {
    [`${I}|succeeded`]: Array.from({ length: 40 }, (_, i) => log(I, "succeeded", i)),
    [`${I}|entered`]: Array.from({ length: 40 }, (_, i) => log(I, "entered", i))
  },
  sessions: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`s${i}`, session(`s${i}`, `Lead ${i}`, `55119000000${String(i).padStart(2, "0")}`)])),
  sessionDelay: 60
}, async crm => {
  await crm.abrirBloco(I);
  await crm.esperarLista();
  assert.ok(crm.stats.maxInFlight <= 6, `chegou a ${crm.stats.maxInFlight} pedidos ao mesmo tempo`);
  assert.equal(Object.keys(crm.stats.sessionCalls).length, 40);
  assert.ok(Object.values(crm.stats.sessionCalls).every(n => n === 1), "sessão buscada mais de uma vez");
  // mesmas sessões na aba Entraram: nada de pedido novo
  await crm.aba("Entraram");
  await crm.esperarLista();
  assert.ok(Object.values(crm.stats.sessionCalls).every(n => n === 1), "aba nova buscou a sessão de novo");
  assert.equal((await crm.itens()).filter(i => i.name.startsWith("Lead ")).length, 40);
}));

test("sessão com erro 500: o log fica sem nome e o resto da lista carrega", comCrm({
  logs: { [`${I}|succeeded`]: [0, 1].map(i => log(I, "succeeded", i)) },
  sessions: { s0: session("s0", "Maria Teste", "5511987654321"), s1: session("s1", "Nunca", "1") },
  sessionStatus: id => (id === "s1" ? 500 : undefined)
}, async crm => {
  await crm.abrirBloco(I);
  await crm.esperarLista(40000);
  const it = await crm.itens();
  assert.equal(it[0].name, "Maria Teste");
  assert.equal(it[1].name, "(sem lead)");
  assert.equal(crm.stats.sessionCalls.s1, 3, "tenta 3 vezes antes de desistir");
}));

test("paginação: servidor manda 93 por página e a lista junta 250 sem repetir", comCrm({
  logs: { [`${A}|succeeded`]: Array.from({ length: 250 }, (_, i) => log(A, "succeeded", i, { lead: { name: `L${i}` }, contactId: `55119${i}` })) },
  pageCap: 93
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  assert.equal(await crm.contador(), "Mostrando 250 de 250");
  assert.equal(new Set((await crm.itens()).map(i => i.name)).size, 250);
}));

test("página de logs com erro 500: mostra o que veio, com aviso de incompleto", comCrm({
  logs: { [`${A}|succeeded`]: Array.from({ length: 250 }, (_, i) => log(A, "succeeded", i, { lead: { name: `L${i}` }, contactId: `55119${i}` })) },
  logsStatus: skip => (skip >= 93 ? 500 : undefined)
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista(60000);
  assert.match(await crm.contador(), /^Mostrando 93 de 93 – incompleto: HTTP 500$/);
}));

test("assinatura velha (401): refaz com assinatura nova e carrega", comCrm({
  logs: { [`${A}|succeeded`]: [log(A, "succeeded", 0, { lead: { name: "Assinado" }, contactId: "5511987654321" })] },
  // a chamada da aplicação (take=30) passa; a da extensão com a assinatura da aplicação é recusada
  logsStatus: (skip, h, take) => (take !== 30 && h["x-signature"] === APP_SIG ? 401 : undefined)
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  assert.deepEqual((await crm.itens()).map(i => i.name), ["Assinado"]);
  assert.ok([...crm.stats.signatures].some(s => s !== APP_SIG && /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(s)),
    "não gerou assinatura nova no formato iv:texto");
}));

test("busca por telefone com máscara e CSV só com o filtrado", comCrm({
  logs: { [`${I}|succeeded`]: [0, 1].map(i => log(I, "succeeded", i)) },
  sessions: { s0: session("s0", "Maria Teste", "5511987654321"), s1: session("s1", "João Exemplo", "5521912345678") }
}, async crm => {
  await crm.abrirBloco(I);
  await crm.esperarLista();
  await crm.page.fill('.dcf-bar input[data-k="q"]', "(21) 91234-5678");
  assert.equal(await crm.contador(), "Mostrando 1 de 2");
  assert.deepEqual((await crm.itens()).map(i => i.name), ["João Exemplo"]);
  const [dl] = await Promise.all([crm.page.waitForEvent("download"), crm.page.click('.dcf-bar [data-a="csv"]')]);
  assert.match(dl.suggestedFilename(), /^logs-sucessos-\d{4}-\d{2}-\d{2}_\d{4}\.csv$/);
  const csv = fs.readFileSync(await dl.path(), "utf8").replace(/^﻿/, "").split("\r\n");
  assert.equal(csv[0], "data;status;lead;contato;telefone");
  assert.equal(csv.length, 2);
  assert.match(csv[1], /"João Exemplo";"";"5521912345678"$/);
}));

test("Clássico esconde a extensão e Crazy volta com a lista carregada", comCrm({
  logs: { [`${A}|succeeded`]: [log(A, "succeeded", 0, { lead: { name: "Alguém" }, contactId: "5511987654321" })] }
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  await crm.page.click('.dcf-mode [data-m="classic"]');
  assert.equal(await crm.page.locator(".dcf-list").count(), 0);
  assert.ok(await crm.page.locator(".dcf-bar").first().evaluate(b => b.classList.contains("dcf-off")));
  assert.ok(await crm.page.locator("#lista").isVisible(), "lista original do Datacrazy deve aparecer");
  await crm.page.click('.dcf-mode [data-m="crazy"]');
  await crm.esperarLista();
  assert.deepEqual((await crm.itens()).map(i => i.name), ["Alguém"]);
}));

test("nome com HTML aparece como texto (sem injetar código)", comCrm({
  logs: { [`${I}|succeeded`]: [log(I, "succeeded", 0)] },
  sessions: { s0: session("s0", `<img src=x onerror="window.__xss=1">`, "5511987654321") }
}, async crm => {
  await crm.abrirBloco(I);
  await crm.esperarLista();
  assert.equal(await crm.page.locator(".dcf-list img").count(), 0);
  assert.equal(await crm.page.evaluate(() => window.__xss), undefined);
  assert.equal((await crm.itens())[0].name, `<img src=x onerror="window.__xss=1">`);
}));

test("▶ reprocessa a sessão a partir do bloco do log, depois de confirmar", comCrm({
  logs: { [`${A}|entered`]: [log(A, "entered", 0, { lead: { name: "Maria Teste" }, contactId: "5511987654321" })] }
}, async crm => {
  await crm.abrirBloco(A, "Sucessos");
  await crm.aba("Entraram");
  await crm.esperarLista();
  const p = crm.page;
  await p.locator(".dcf-play").click();
  await p.getByText("Ação", { exact: true }).last().waitFor(); // nome do bloco na confirmação
  assert.match(await p.locator(".dcf-confirm").innerText(), /Maria Teste/);
  assert.equal(await p.locator(".dcf-sel").count(), 0, "clicar no ▶ não seleciona o card");
  await p.locator('.dcf-confirm [data-a="ok"]').click();
  await p.locator(".dcf-rp-ok").waitFor();
  assert.deepEqual(crm.stats.reprocessCalls, [{ id: "s0", body: { reprocessFromBlockId: A }, type: "application/json" }]);
}));

test("▶ cancelado não chama a API", comCrm({
  logs: { [`${A}|succeeded`]: [log(A, "succeeded", 0, { lead: { name: "Maria Teste" }, contactId: "5511987654321" })] }
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  const p = crm.page;
  await p.locator(".dcf-play").click();
  await p.locator('.dcf-confirm [data-a="cancel"]').click();
  await p.locator(".dcf-play").click();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  assert.equal(await p.locator(".dcf-confirm").count(), 0);
  assert.deepEqual(crm.stats.reprocessCalls, []);
}));

test("▶ com erro mostra a falha no card e libera o botão", comCrm({
  logs: { [`${A}|error`]: [log(A, "error", 0, { lead: { name: "Maria Teste" }, contactId: "5511987654321" })] },
  reprocessStatus: () => 400
}, async crm => {
  await crm.abrirBloco(A, "Erros");
  await crm.esperarLista();
  const p = crm.page;
  await p.locator(".dcf-play").click();
  await p.locator('.dcf-confirm [data-a="ok"]').click();
  await p.locator(".dcf-rp-fail").waitFor();
  assert.equal(await p.locator(".dcf-rp-fail").innerText(), "falhou: HTTP 400");
  assert.equal(await p.locator(".dcf-play").isDisabled(), false);
  assert.equal(crm.stats.reprocessCalls.length, 1, "erro 400 não repete o pedido");
}));

const E = "bloco-espera";
const parado = (block, type, i, name) => log(block, type, i, { lead: { name }, contactId: `551190000000${i}` });

test("Parados: entrou sem sucesso nem erro; alerta ganha tag", comCrm({
  logs: {
    [`${A}|entered`]: [0, 1, 2, 3].map(i => parado(A, "entered", i, `Lead ${i}`)),
    [`${A}|succeeded`]: [parado(A, "succeeded", 0, "Lead 0")],
    [`${A}|error`]: [parado(A, "error", 1, "Lead 1")],
    [`${A}|warning`]: [parado(A, "warning", 3, "Lead 3")]
  }
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  const p = crm.page;
  await p.locator('[data-a="stuck"]').click();
  await p.waitForFunction(() => /parados/.test(document.querySelector(".dcf-count")?.textContent));
  assert.deepEqual((await crm.itens()).map(i => i.sid), ["s2", "s3"]);
  assert.equal(await crm.contador(), "Mostrando 2 de 2 parados");
  assert.equal(await p.locator('.dcf-item[data-sid="s3"] .dcf-rep').innerText(), "alerta");
}));

test("Parados em bloco de Espera: quem ainda está no bloco ganha \"em espera\"", comCrm({
  logs: { [`${E}|entered`]: [0, 1].map(i => parado(E, "entered", i, `Lead ${i}`)),
          [`${E}|succeeded`]: [parado(E, "succeeded", 5, "Lead 5")] }, // sem card nenhum a barra não aparece
  sessions: {
    s0: { ...session("s0", "Lead 0", "1"), history: [{ flowBlockId: E, enteredDate: "2026-10-27T10:00:00Z", exitedDate: null }] },
    s1: { ...session("s1", "Lead 1", "1"), history: [{ flowBlockId: E, enteredDate: "2026-10-27T10:00:00Z", exitedDate: "2026-10-27T10:05:00Z" }] }
  }
}, async crm => {
  await crm.abrirBloco(E);
  await crm.esperarLista();
  const p = crm.page;
  await p.locator('[data-a="stuck"]').click();
  await p.locator('.dcf-item[data-sid="s0"] .dcf-rp-wait').waitFor();
  assert.equal(await p.locator('.dcf-item[data-sid="s1"] .dcf-rp-wait').count(), 0);
}));

test("caixinhas: reprocessa os selecionados um por vez, sessão repetida uma vez só", comCrm({
  logs: { [`${A}|succeeded`]: [0, 1, 2].map(i => parado(A, "succeeded", i, `Lead ${i}`))
    .concat([log(A, "succeeded", 9, { flowSessionId: "s0", lead: { name: "Lead 0" }, contactId: "5511900000000" })]) },
  reprocessStatus: id => id === "s2" ? 500 : undefined
}, async crm => {
  await crm.abrirBloco(A);
  await crm.esperarLista();
  const p = crm.page;
  const btn = p.locator('[data-a="rpsel"]');
  assert.equal(await btn.isDisabled(), true);
  await p.locator('[data-a="pickall"]').check();
  assert.equal(await btn.innerText(), "Reprocessar selecionados (3)");
  await p.locator('.dcf-item[data-sid="s1"] .dcf-chk').uncheck();
  assert.equal(await btn.innerText(), "Reprocessar selecionados (2)");
  assert.equal(await p.locator(".dcf-sel").count(), 0, "caixinha não seleciona o card");
  await btn.click();
  assert.match(await p.locator(".dcf-confirm").innerText(), /2 sessões/);
  await p.locator('.dcf-confirm [data-a="ok"]').click();
  await p.waitForFunction(() => /reprocessados: 1, falharam: 1/.test(document.querySelector(".dcf-count")?.textContent));
  assert.deepEqual(crm.stats.reprocessCalls.map(c => c.id), ["s0", "s2"]);
  assert.equal(await p.locator('.dcf-item[data-sid="s0"] .dcf-rp-ok').count(), 2, "os dois cards da sessão s0");
  assert.equal(await btn.innerText(), "Reprocessar selecionados (1)", "a que falhou continua marcada");
}));
