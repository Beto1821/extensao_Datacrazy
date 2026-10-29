// Datacrazy – Filtro de Logs do Bloco (funções puras)
// Leitura dos logs, filtro e formatação, sem DOM e sem rede. O content.js usa pelo
// globalThis.dcfLib; os testes (pasta teste/) carregam pelo require do Node.

(root => {
  const DATE_RE = /^(\d{1,2}) de (\p{L}+) de (\d{4}) (\d{2}):(\d{2})/iu; // \p{L}: "março" tem ç
  const MONTHS = { janeiro:0, fevereiro:1, "março":2, marco:2, abril:3, maio:4, junho:5,
                   julho:6, agosto:7, setembro:8, outubro:9, novembro:10, dezembro:11 };
  const TYPE_LABEL = { entered: "Entrou", succeeded: "Concluído com sucesso", warning: "Alerta",
                       alert: "Alerta", error: "Erro", failed: "Erro" };
  const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const pad = n => String(n).padStart(2, "0");
  const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // bloco + aba da chamada de logs: identifica a lista aberta
  function reqKey(url) {
    const s = new URL(url).searchParams;
    return `${s.get("filter[flowBlockId]")}|${s.get("filter[type]")}`;
  }

  // linhas de texto de um card da lista nativa -> log (null se não começa com data)
  function parseLines(lines) {
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
      date, dateText: lines[0], status: lines[1] || "",
      lead: after("Lead:"), contact: after("Contato:"), phone,
      text: lines.join(" ").toLowerCase()
    };
  }

  // código de erro -> frase do CRM, com os {parâmetros} preenchidos ("" se não houver tradução)
  function errorText(code, params, texts) {
    const t = code && texts?.[code];
    if (typeof t !== "string") return "";
    return t.replace(/\{(\w+)\}/g, (m, k) => params?.[k] != null ? String(params[k]) : m);
  }

  // registro da API de logs -> log (texts: frases de erro traduzidas, do hook.js)
  function fromApi(r, texts) {
    const date = new Date(r.createdAt);
    const errorMsg = errorText(r.errorCode, r.errorParameters, texts);
    const status = [TYPE_LABEL[r.type] || r.type || r.message || "", errorMsg || r.errorCode].filter(Boolean).join(" – ");
    const lead = r.lead?.name?.trim() || "";
    const contact = (r.contactName || "").trim();
    const phone = r.contactId || "";
    return {
      id: `${r.flowSessionId}|${r.createdAt}`, sessionId: r.flowSessionId || "", date, dateText: fmtDate(date), status, lead, contact, phone,
      type: r.type, errorCode: r.errorCode || "", errorMsg,
      text: [fmtDate(date), status, r.errorCode, lead, contact, phone, r.message].join(" ").toLowerCase()
    };
  }

  // marca it.visible e it.count em cada log, conforme o estado da barra
  function filterItems(items, state) {
    const terms = state.q.toLowerCase().split(",").map(s => s.trim()).filter(Boolean).map(t => ({
      t,
      // telefone colado do card ("+55 (47) 93618-3266"): compara só os dígitos
      digits: /^[\d\s()+\-.]+$/.test(t) && t.replace(/\D/g, "").length >= 4 ? t.replace(/\D/g, "") : ""
    }));
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
      if (terms.length && !terms.some(({ t, digits }) => it.text.includes(t) || (digits && String(it.phone).replace(/\D/g, "").includes(digits)))) ok = false;
      if (from && it.date < from) ok = false;
      if (to && it.date > to) ok = false;
      if (state.onlyDup && !(freq[key] > 1)) ok = false;
      if (ok && state.unique && key) { if (seen.has(key)) ok = false; else seen.add(key); }
      it.visible = ok;
      it.count = freq[key] || 1;
    }
    return items;
  }

  function fmtPhone(p) {
    const d = String(p).replace(/\D/g, "");
    const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d ? `+${d}` : "";
  }

  // cor fixa por nome (mesmo lead = mesma cor)
  function hue(s) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }

  function dayLabel(d, now = new Date()) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 864e5);
    const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    return diff === 0 ? `Hoje · ${dm}` : diff === 1 ? `Ontem · ${dm}` : `${WEEKDAY[d.getDay()]}, ${dm}`;
  }

  // texto que é JSON (ex.: corpo de webhook) vira objeto, para abrir na árvore
  function unwrap(v) {
    if (typeof v !== "string" || !/^\s*[{[]/.test(v)) return v;
    try { return JSON.parse(v); } catch { return v; }
  }

  // detalhes da sessão -> nome e telefone do lead
  function personOf(d) {
    const p = d?.parameters || {};
    const digits = v => String(v || "").replace(/\D/g, "");
    let name = String(p.leadName || "").trim(), phone = digits(p.leadPhone);
    // corpo do webhook (Api-request-N) e análise de telefone (phone-N)
    for (const v of Object.values(d?.datasources || {})) {
      const o = unwrap(v);
      if (!o || typeof o !== "object") continue;
      name ||= String(o.name || o.nome || "").trim();
      phone ||= digits(o.phone || o.telefone || o.whatsapp || o.celular);
    }
    return { name, phone };
  }

  const lib = { DATE_RE, TYPE_LABEL, pad, fmtDate, escHtml, reqKey, parseLines, errorText, fromApi, filterItems,
                fmtPhone, hue, dayLabel, unwrap, personOf };
  if (typeof module === "object" && module.exports) module.exports = lib;
  else root.dcfLib = lib;
})(globalThis);
