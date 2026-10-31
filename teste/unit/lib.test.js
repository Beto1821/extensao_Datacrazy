// Funções puras do lib.js: leitura dos logs, filtro, formatação e nome/telefone da sessão.
const test = require("node:test");
const assert = require("node:assert/strict");
const lib = require("../../lib.js");
const sessao = name => require(`../fixtures/${name}.json`);

const log = (over = {}) => ({
  flowBlockId: "b1", flowSessionId: "s1", contactId: "", contactName: "", createdAt: "2026-10-27T18:27:10.827Z",
  message: "succeeded", errorCode: "", type: "succeeded", lead: null, ...over
});

test("reqKey junta bloco e aba da chamada de logs", () => {
  const url = "https://crm.g1.datacrazy.io/api/crm/flows/f/versions/v/logs?take=30&filter%5BflowBlockId%5D=b1&filter%5Btype%5D=succeeded";
  assert.equal(lib.reqKey(url), "b1|succeeded");
});

test("fromApi: log do webhook vem sem lead, contato e telefone", () => {
  const it = lib.fromApi(log());
  assert.equal(it.sessionId, "s1");
  assert.equal(it.lead, "");
  assert.equal(it.contact, "");
  assert.equal(it.phone, "");
  assert.equal(it.status, "Concluído com sucesso");
  assert.equal(it.id, "s1|2026-10-27T18:27:10.827Z");
});

test("fromApi: lead, contato, telefone e código de erro", () => {
  const it = lib.fromApi(log({ type: "error", errorCode: "lead-name-required", contactId: "5511987654321",
                                contactName: " Maria ", lead: { name: " Maria Teste " } }));
  assert.equal(it.lead, "Maria Teste");
  assert.equal(it.contact, "Maria");
  assert.equal(it.phone, "5511987654321");
  assert.equal(it.status, "Erro – lead-name-required");
  assert.match(it.text, /maria teste/);
});

test("fromApi: tipo desconhecido usa o próprio tipo como status", () => {
  assert.equal(lib.fromApi(log({ type: "scheduled" })).status, "scheduled");
});

test("parseLines: card da lista nativa", () => {
  const it = lib.parseLines(["27 de outubro de 2026 15:27", "Concluído com sucesso", "Lead:", "M", "Maria Teste",
                             "Contato:", "Maria", "5511987654321"]);
  assert.equal(it.date.getFullYear(), 2026);
  assert.equal(it.date.getMonth(), 9);
  assert.equal(it.date.getDate(), 27);
  assert.equal(it.date.getHours(), 15);
  assert.equal(it.lead, "Maria Teste", "pula a letra do avatar");
  assert.equal(it.contact, "Maria");
  assert.equal(it.phone, "5511987654321");
});

test("parseLines: março com e sem acento; card sem data é ignorado", () => {
  assert.equal(lib.parseLines(["3 de março de 2026 08:00"]).date.getMonth(), 2);
  assert.equal(lib.parseLines(["3 de marco de 2026 08:00"]).date.getMonth(), 2);
  assert.equal(lib.parseLines(["Sem data aqui"]), null);
  assert.equal(lib.parseLines([]), null);
});

test("fmtPhone: celular, fixo, sem 55 e vazio", () => {
  assert.equal(lib.fmtPhone("5511987654321"), "+55 (11) 98765-4321");
  assert.equal(lib.fmtPhone("551133334444"), "+55 (11) 3333-4444");
  assert.equal(lib.fmtPhone("+1 202 555 0100"), "+12025550100");
  assert.equal(lib.fmtPhone(""), "");
});

test("escHtml escapa o que quebraria o HTML da lista", () => {
  assert.equal(lib.escHtml(`<b a="1">&</b>`), "&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;");
});

test("dayLabel: hoje, ontem e dia da semana", () => {
  const now = new Date(2026, 9, 27, 12);
  assert.equal(lib.dayLabel(new Date(2026, 9, 27, 1), now), "Hoje · 27/10");
  assert.equal(lib.dayLabel(new Date(2026, 9, 26, 23), now), "Ontem · 26/10");
  assert.equal(lib.dayLabel(new Date(2026, 9, 23, 10), now), "Sex, 23/10");
});

test("hue: mesmo nome = mesma cor, entre 0 e 359", () => {
  assert.equal(lib.hue("Maria"), lib.hue("Maria"));
  for (const s of ["", "a", "Maria Teste", "Ñandú"]) assert.ok(lib.hue(s) >= 0 && lib.hue(s) < 360);
});

test("unwrap: JSON em texto vira objeto; texto comum fica igual", () => {
  assert.deepEqual(lib.unwrap('{"a":1}'), { a: 1 });
  assert.equal(lib.unwrap("{quebrado"), "{quebrado");
  assert.equal(lib.unwrap("oi"), "oi");
  assert.equal(lib.unwrap(5), 5);
});

// ---------- nome e telefone da sessão ----------
test("personOf: parâmetros do lead", () => {
  assert.deepEqual(lib.personOf(sessao("sessao-webhook")), { name: "Maria Teste", phone: "5511987654321" });
});

test("personOf: só o webhook, em texto JSON e com nome/telefone em português", () => {
  assert.deepEqual(lib.personOf(sessao("sessao-so-webhook")), { name: "João Exemplo", phone: "21998765432" });
});

test("personOf: webhook vazio não inventa dados", () => {
  assert.deepEqual(lib.personOf(sessao("sessao-vazia")), { name: "", phone: "" });
});

test("personOf: resposta vazia ou quebrada não lança erro", () => {
  for (const d of [null, undefined, {}, { parameters: null, datasources: null }, { datasources: { x: null, y: "texto" } }])
    assert.deepEqual(lib.personOf(d), { name: "", phone: "" });
});

test("personOf: parâmetro tem prioridade sobre o datasource", () => {
  const d = { parameters: { leadName: "Do Parâmetro" }, datasources: { a: { name: "Do Webhook", whatsapp: "+55 11 91111-2222" } } };
  assert.deepEqual(lib.personOf(d), { name: "Do Parâmetro", phone: "5511911112222" });
});

// ---------- filtro ----------
const st = (over = {}) => ({ q: "", from: "", to: "", unique: false, onlyDup: false, ...over });
const items = () => [
  { date: new Date(2026, 9, 27, 10), phone: "5511987654321", lead: "Maria", contact: "", text: "maria sucesso 5511987654321" },
  { date: new Date(2026, 9, 27, 11), phone: "5511987654321", lead: "Maria", contact: "", text: "maria sucesso 5511987654321" },
  { date: new Date(2026, 9, 26, 9), phone: "5521912345678", lead: "João", contact: "", text: "joão erro 5521912345678" },
  { date: new Date(2026, 9, 25, 9), phone: "", lead: "", contact: "", text: "execução agendada" }
];
const visible = list => list.filter(i => i.visible).map(i => i.lead || "-");

test("filtro: sem filtro mostra tudo e conta repetidos", () => {
  const r = lib.filterItems(items(), st());
  assert.deepEqual(visible(r), ["Maria", "Maria", "João", "-"]);
  assert.deepEqual(r.map(i => i.count), [2, 2, 1, 1]);
});

test("filtro: vírgula = OU, sem diferença de maiúsculas", () => {
  assert.deepEqual(visible(lib.filterItems(items(), st({ q: "JOÃO, agendada" }))), ["João", "-"]);
});

test("filtro: telefone colado do card, com máscara", () => {
  assert.deepEqual(visible(lib.filterItems(items(), st({ q: "+55 (21) 91234-5678" }))), ["João"]);
  assert.deepEqual(visible(lib.filterItems(items(), st({ q: "91234-5678" }))), ["João"]);
});

test("filtro: período De/Até", () => {
  assert.deepEqual(visible(lib.filterItems(items(), st({ from: "2026-10-26T00:00", to: "2026-10-26T23:59" }))), ["João"]);
  assert.deepEqual(visible(lib.filterItems(items(), st({ from: "2026-10-27T10:30" }))), ["Maria"]);
});

test("filtro: únicos por telefone e só repetidos", () => {
  assert.deepEqual(visible(lib.filterItems(items(), st({ unique: true }))), ["Maria", "João", "-"]);
  assert.deepEqual(visible(lib.filterItems(items(), st({ onlyDup: true }))), ["Maria", "Maria"]);
});

test("filtro: log sem telefone, lead e contato nunca é repetido", () => {
  const two = [{ date: new Date(), phone: "", lead: "", contact: "", text: "a" }, { date: new Date(), phone: "", lead: "", contact: "", text: "b" }];
  assert.deepEqual(lib.filterItems(two, st({ onlyDup: true })).map(i => i.visible), [false, false]);
  assert.deepEqual(lib.filterItems(two, st({ unique: true })).map(i => i.visible), [true, true]);
});

test("fromApi: código de erro vira a frase traduzida do CRM", () => {
  const texts = { "chat.errors.invalid-whatsapp-number": "Número não é WhatsApp.",
                  "chat.errors.send-message-error": "Erro ao enviar: {message}" };
  const it = lib.fromApi(log({ type: "error", errorCode: "chat.errors.invalid-whatsapp-number" }), texts);
  assert.equal(it.errorMsg, "Número não é WhatsApp.");
  assert.equal(it.status, "Erro – Número não é WhatsApp.");
  assert.match(it.text, /chat\.errors\.invalid-whatsapp-number/); // busca pelo código continua
  const p = lib.fromApi(log({ type: "error", errorCode: "chat.errors.send-message-error", errorParameters: { message: "timeout" } }), texts);
  assert.equal(p.errorMsg, "Erro ao enviar: timeout");
});

test("fromApi: código sem tradução continua aparecendo", () => {
  const it = lib.fromApi(log({ type: "error", errorCode: "x.errors.novo" }), {});
  assert.equal(it.errorMsg, "");
  assert.equal(it.status, "Erro – x.errors.novo");
});

test("downConns: só conexão ligada e fora do ar", () => {
  const c = (id, status, over = {}) => ({ id, name: `C ${id}`, status, isActive: true, deletedAt: null, ...over });
  assert.deepEqual(lib.downConns([
    c("1", "CONNECTED"), c("2", "DISCONNECTED"), c("3", "DISCONNECTED", { isActive: false }),
    c("4", "DISCONNECTED", { deletedAt: "2026-10-30T00:00:00Z" }), c("5", "CONNECTING", { name: "  " })
  ]), [{ id: "2", name: "C 2" }, { id: "5", name: "(sem nome)" }]);
  assert.deepEqual(lib.downConns(null), []);
});

test("messagingOrigin: mesmo shard da chamada", () => {
  assert.equal(lib.messagingOrigin("https://crm.g1.datacrazy.io/api/crm/sync"), "https://messaging.g1.datacrazy.io");
  assert.equal(lib.messagingOrigin("https://accounts.g2.datacrazy.io/api/x"), "https://messaging.g2.datacrazy.io");
  assert.equal(lib.messagingOrigin("https://crm.datacrazy.io/api/track"), null);
});
