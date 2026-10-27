// Pacote da extensão: manifest, arquivos do zip da release e versão nos documentos.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const manifest = JSON.parse(read("manifest.json"));

// arquivos que o manifest carrega (scripts, estilos e ícones)
const used = [
  ...manifest.content_scripts.flatMap(c => [...(c.js || []), ...(c.css || [])]),
  ...Object.values(manifest.icons)
];

test("manifest: todo arquivo citado existe", () => {
  for (const f of used) assert.ok(fs.existsSync(path.join(root, f)), `falta ${f}`);
});

test("manifest: lib.js carrega antes do content.js", () => {
  const js = manifest.content_scripts.find(c => (c.js || []).includes("content.js")).js;
  assert.ok(js.indexOf("lib.js") > -1 && js.indexOf("lib.js") < js.indexOf("content.js"));
});

test("manifest: hook.js roda no mundo da página, antes da aplicação", () => {
  const hook = manifest.content_scripts.find(c => (c.js || []).includes("hook.js"));
  assert.equal(hook.world, "MAIN");
  assert.equal(hook.run_at, "document_start");
});

test("release.yml: o zip leva todos os arquivos do manifest", () => {
  const copy = read(".github/workflows/release.yml").match(/cp -r (.+) dist\/pkg\/extensao-datacrazy\//)[1].split(/\s+/);
  for (const f of used) assert.ok(copy.includes(f) || copy.includes(f.split("/")[0]), `release não copia ${f}`);
});

test("versão do manifest igual no README e no LEIA-ME", () => {
  const v = manifest.version;
  assert.match(read("README.MD"), new RegExp(`Versão atual: \\*\\*${v.replace(/\./g, "\\.")}\\*\\*`));
  assert.match(read("LEIA-ME.txt"), new RegExp(`versão ${v.replace(/\./g, "\\.")}`));
});

test("scripts sem erro de sintaxe", () => {
  for (const f of ["lib.js", "content.js", "hook.js"]) assert.doesNotThrow(() => new Function(read(f)), f);
});
