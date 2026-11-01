// Prova dello script del foglio, senza Google: si carica Codice.gs con dei finti
// SpreadsheetApp, ContentService, LockService e PropertiesService.
//
//     node apps-script/prueba.js
//
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const codice = fs.readFileSync(__dirname + "/Codice.gs", "utf8");

function nuovoMondo(proprieta) {
  const fogli = {};
  const foglioFinto = () => {
    const celle = {};
    const ws = {
      righe: [], celle,
      getLastRow() { return ws.righe.length; },
      appendRow(r) { ws.righe.push(r); },
      getRange(a, b, c, d) {
        const chiave = typeof a === "string" ? a : `${a},${b}`;
        return {
          setFontWeight() {},
          setValues(v) {
            celle[chiave] = v;
            // «A2:B2» scrive anche le celle una per una, come il foglio vero
            const m = /^([A-Z])(\d+):([A-Z])(\d+)$/.exec(chiave);
            if (m) v.forEach((riga, i) => riga.forEach((x, j) => {
              celle[String.fromCharCode(m[1].charCodeAt(0) + j) + (Number(m[2]) + i)] = [[x]];
            }));
          },
          getValue() { const v = celle[chiave]; return v ? v[0][0] : ""; }
        };
      },
      setFrozenRows() {}
    };
    return ws;
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: n => fogli[n] || null,
      insertSheet: n => (fogli[n] = foglioFinto())
    }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => ({ testo: t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => proprieta[k] }) },
    console, Date, JSON, Math, Number, String, Array, isFinite, isNaN, RegExp
  };
  vm.createContext(ctx);
  vm.runInContext(codice, ctx);
  return { ctx, fogli };
}

const post = (ctx, corpo) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(corpo) } }).testo);
const get = (ctx, parametri) => JSON.parse(ctx.doGet({ parameter: parametri || {} }).testo);

const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const dopodomani = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const richiesta = (extra) => Object.assign({
  receivedAt: "2020-01-01T00:00:00Z", status: "confirmed", roomId: "mixed", room: "Mixed Dormitory", unit: "bed",
  checkin: domani, checkout: dopodomani, nights: 1, guests: 2, unitsBooked: 2, pricePerUnit: 70000, total: 140000,
  currency: "PYG", guestName: "Ana Perez", guestEmail: "ana@example.com", note: "", source: "website"
}, extra || {});

function libere(valore) {
  const camere = {};
  for (const [id, tot] of Object.entries({ mixed: 8, female: 6, male: 8, triple: 3, twin: 1, ensuite: 1, private: 1 }))
    camere[id] = { totale: tot, liberi: [tot, tot, Math.max(0, tot - 1)] };
  return Object.assign({ generato: "2026-11-01T12:00:00Z", desde: "2026-11-01", giorni: 3, camere }, valore || {});
}

let prove = 0;
const prova = (nome, f) => { f(); prove++; console.log("ok -", nome); };

prova("una richiesta valida diventa una riga, nell'ordine delle colonne", () => {
  const { ctx, fogli } = nuovoMondo({});
  assert.deepStrictEqual(post(ctx, richiesta()), { ok: true });
  const [testa, riga] = fogli.Pedidos.righe;
  assert.strictEqual(testa[0], "receivedAt");
  assert.strictEqual(riga[testa.indexOf("status")], "new", "lo stato lo decide lo script, non la pagina");
  assert.notStrictEqual(riga[0], "2020-01-01T00:00:00Z", "l'ora la mette lo script");
  assert.strictEqual(riga[testa.indexOf("guestName")], "Ana Perez");
  assert.strictEqual(riga[testa.indexOf("nights")], 1);
  assert.strictEqual(riga[testa.indexOf("total")], 140000);
  assert.strictEqual(riga[testa.indexOf("source")], "website");
});

prova("un testo che comincia per = + - @ non diventa una formula", () => {
  const { ctx, fogli } = nuovoMondo({});
  post(ctx, richiesta({ guestName: '=HYPERLINK("http://x","clic")', note: "+cmd|' /C calc'!A0" }));
  const [testa, riga] = fogli.Pedidos.righe;
  assert.strictEqual(riga[testa.indexOf("guestName")][0], "'");
  assert.strictEqual(riga[testa.indexOf("note")][0], "'");
});

prova("le richieste sbagliate non scrivono niente", () => {
  const { ctx, fogli } = nuovoMondo({});
  const male = [
    [{ checkout: domani }, "notti"], [{ checkin: "domani" }, "date"], [{ roomId: "suite" }, "camera"],
    [{ guestEmail: "non-una-mail" }, "email"], [{ guestName: "  " }, "nome"], [{ guests: 0 }, "ospiti"],
    [{ guests: 2.5 }, "ospiti"], [{ total: -5 }, "importi"], [{ checkin: "2020-01-01", checkout: "2020-01-03" }, "date nel passato"],
    [{ checkin: domani, checkout: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) }, "notti"],
    [{ checkin: "2026-02-30" }, "date"]
  ];
  for (const [extra, errore] of male) {
    const r = post(ctx, richiesta(extra));
    assert.strictEqual(r.ok, false, JSON.stringify(extra));
    assert.strictEqual(r.error, errore, JSON.stringify(extra));
  }
  assert.strictEqual(post(ctx, null).ok, false);
  assert.strictEqual(fogli.Pedidos, undefined, "nessun foglio creato per richieste sbagliate");
});

prova("le camere libere: senza CLAVE nello script o con quella sbagliata non si scrive", () => {
  let { ctx, fogli } = nuovoMondo({});
  assert.match(post(ctx, { accion: "disponibilidad", clave: "x", datos: libere() }).error, /CLAVE/);
  ({ ctx, fogli } = nuovoMondo({ CLAVE: "segreto" }));
  assert.strictEqual(post(ctx, { accion: "disponibilidad", clave: "sbagliata", datos: libere() }).error, "clave");
  assert.strictEqual(post(ctx, { accion: "disponibilidad", datos: libere() }).error, "clave");
  assert.strictEqual(fogli.Disponibilidad, undefined);
});

prova("le camere libere mandate bene si leggono dal GET", () => {
  const { ctx, fogli } = nuovoMondo({ CLAVE: "segreto" });
  assert.strictEqual(get(ctx, { accion: "disponibilidad" }).ok, false, "prima che arrivi qualcosa");
  assert.deepStrictEqual(post(ctx, { accion: "disponibilidad", clave: "segreto", datos: libere() }), { ok: true });
  const letto = get(ctx, { accion: "disponibilidad" });
  assert.strictEqual(letto.ok, true);
  assert.deepStrictEqual(letto.datos, libere());
  const vista = JSON.parse(JSON.stringify(fogli.Disponibilidad.celle["4,1"]));   // fuori dal contesto finto
  assert.deepStrictEqual(vista[0].slice(0, 3), ["camera", "totale", "2026-11-01"]);
  assert.deepStrictEqual(vista[1], ["mixed", 8, 8, 8, 7]);
});

prova("le camere libere sbagliate non si salvano", () => {
  const { ctx, fogli } = nuovoMondo({ CLAVE: "segreto" });
  const manda = datos => post(ctx, { accion: "disponibilidad", clave: "segreto", datos });
  const senzaTripla = libere(); delete senzaTripla.camere.triple;
  assert.match(manda(senzaTripla).error, /triple/);
  const troppe = libere(); troppe.camere.mixed.liberi[1] = 9;       // piu' dei letti che ci sono
  assert.match(manda(troppe).error, /mixed/);
  assert.strictEqual(manda(libere({ desde: "ieri" })).error, "datos");
  assert.strictEqual(fogli.Disponibilidad, undefined);
});

prova("il GET senza azione dice solo che e' vivo", () => {
  const { ctx } = nuovoMondo({});
  assert.strictEqual(get(ctx).ok, true);
});

console.log(`\n${prove} prove passate`);
