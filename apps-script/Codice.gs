/**
 * Il banco delle prenotazioni del sito: un foglio Google che
 *
 *   1. riceve le richieste che la pagina manda (POST) e ne fa una riga;
 *   2. tiene le camere libere notte per notte, che gli manda il foglio
 *      dei conti dell'ostello (POST con la chiave), e le da' alla pagina (GET).
 *
 * Il sito sta su GitHub Pages, che serve file e basta: questo script e' il
 * pezzo che scrive e che risponde. Sta dentro il foglio Google. Come si mette
 * in piedi: README.md, "Il foglio delle prenotazioni".
 *
 * Due fogli (schede), creati da soli la prima volta:
 *   Pedidos        una riga per richiesta. I nomi delle colonne sono i campi
 *                  che manda la pagina.
 *   Disponibilidad le camere libere, come le ha contate il foglio dei conti.
 *
 * Le proprieta' dello script (Impostazioni progetto → Proprieta' dello script):
 *   CLAVE          la parola che deve mandare il foglio dei conti per
 *                  aggiornare le camere libere. Senza, nessuno puo'.
 */

var PEDIDOS = "Pedidos";
var DISPONIBILIDAD = "Disponibilidad";

var COLONNE = [
  "receivedAt", "status", "guestName", "guestEmail",
  "roomId", "room", "unit", "guests", "unitsBooked",
  "checkin", "checkout", "nights",
  "pricePerUnit", "total", "currency", "note", "source"
];

// Le camere in vendita: gli stessi id della pagina e del foglio dei conti.
var CAMERE = ["mixed", "female", "male", "triple", "twin", "ensuite", "private"];
var MASSIMO_NOTTI = 60;
var MASSIMO_GIORNI = 400;
var GIORNI_LEGGIBILI = 14;       // quanti giorni si scrivono a vista nel foglio


// --- il POST: una richiesta, o le camere libere --------------------------

function doPost(e) {
  try {
    var dati = JSON.parse(e.postData.contents);
    if (dati && dati.accion === "disponibilidad") return risposta(guardaDisponibilidad(dati));
    return risposta(guardaPedido(dati));
  } catch (err) {
    return risposta({ ok: false, error: String(err) });
  }
}

// --- il GET: le camere libere, o solo «sono vivo» -----------------------

function doGet(e) {
  var accion = e && e.parameter ? e.parameter.accion : "";
  if (accion === "disponibilidad") return risposta(leggiDisponibilidad());
  return risposta({ ok: true, note: "registro prenotazioni Mediterraneo" });
}


// --- le richieste --------------------------------------------------------

/**
 * Un testo che arriva da fuori, reso innocuo: un foglio che comincia con
 * = + - @ e' una formula, e chi apre il foglio in Excel la esegue. Si
 * mette un apostrofo davanti, e si taglia a una lunghezza ragionevole.
 */
function pulisci(valore, massimo) {
  if (valore === undefined || valore === null) return "";
  var testo = String(valore).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  testo = testo.substring(0, massimo || 500);
  return /^[=+\-@\t\r]/.test(testo) ? "'" + testo : testo;
}

function dataValida(testo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(testo))) return null;
  var d = new Date(testo + "T00:00:00Z");
  return isNaN(d.getTime()) || d.toISOString().substring(0, 10) !== testo ? null : d;
}

function intero(valore, minimo, massimo) {
  var n = Number(valore);
  return isFinite(n) && Math.floor(n) === n && n >= minimo && n <= massimo ? n : null;
}

/** Controlla una richiesta. Torna {ok:true, riga:{...}} o {ok:false, error:"..."} */
function validaPedido(dati, adesso) {
  if (!dati || typeof dati !== "object") return { ok: false, error: "richiesta vuota" };
  var entrata = dataValida(dati.checkin), uscita = dataValida(dati.checkout);
  if (!entrata || !uscita) return { ok: false, error: "date" };
  var notti = Math.round((uscita - entrata) / 86400000);
  if (notti < 1 || notti > MASSIMO_NOTTI) return { ok: false, error: "notti" };
  var ora = adesso || new Date();
  if (entrata.getTime() < ora.getTime() - 2 * 86400000) return { ok: false, error: "date nel passato" };
  if (CAMERE.indexOf(dati.roomId) < 0) return { ok: false, error: "camera" };
  var nome = pulisci(dati.guestName, 120).trim();
  if (!nome) return { ok: false, error: "nome" };
  var mail = String(dati.guestEmail || "").trim();
  if (mail.length > 160 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, error: "email" };
  var ospiti = intero(dati.guests, 1, 20), letti = intero(dati.unitsBooked, 1, 20);
  var totale = Number(dati.total), prezzo = Number(dati.pricePerUnit);
  if (ospiti === null || letti === null) return { ok: false, error: "ospiti" };
  if (!isFinite(totale) || totale < 0 || !isFinite(prezzo) || prezzo < 0) return { ok: false, error: "importi" };

  return {
    ok: true,
    riga: {
      receivedAt: ora.toISOString(), status: "new", guestName: nome, guestEmail: pulisci(mail, 160),
      roomId: dati.roomId, room: pulisci(dati.room, 80), unit: dati.unit === "room" ? "room" : "bed",
      guests: ospiti, unitsBooked: letti, checkin: dati.checkin, checkout: dati.checkout, nights: notti,
      pricePerUnit: prezzo, total: totale, currency: "PYG", note: pulisci(dati.note, 500), source: "website"
    }
  };
}

function foglio(nome) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  return libro.getSheetByName(nome) || libro.insertSheet(nome);
}

function guardaPedido(dati) {
  var v = validaPedido(dati);
  if (!v.ok) return v;
  var lucchetto = LockService.getScriptLock();
  lucchetto.waitLock(10000);          // due richieste insieme non si pestano
  try {
    var ws = foglio(PEDIDOS);
    // La prima volta si scrive l'intestazione, e poi mai piu'.
    if (ws.getLastRow() === 0) {
      ws.appendRow(COLONNE);
      ws.getRange(1, 1, 1, COLONNE.length).setFontWeight("bold");
      ws.setFrozenRows(1);
    }
    ws.appendRow(COLONNE.map(function (k) { return v.riga[k]; }));
  } finally {
    lucchetto.releaseLock();
  }
  return { ok: true };
}


// --- le camere libere ------------------------------------------------------

/** Controlla le camere libere mandate dal foglio dei conti. */
function validaDisponibilidad(datos) {
  if (!datos || !dataValida(datos.desde) || !datos.camere || !datos.generato) {
    return { ok: false, error: "datos" };
  }
  for (var i = 0; i < CAMERE.length; i++) {
    var c = datos.camere[CAMERE[i]];
    if (!c || intero(c.totale, 1, 50) === null || !Array.isArray(c.liberi) ||
        c.liberi.length < 1 || c.liberi.length > MASSIMO_GIORNI) {
      return { ok: false, error: "camera " + CAMERE[i] };
    }
    for (var j = 0; j < c.liberi.length; j++) {
      if (intero(c.liberi[j], 0, c.totale) === null) return { ok: false, error: "numero in " + CAMERE[i] };
    }
  }
  return { ok: true };
}

function guardaDisponibilidad(dati) {
  var chiave = PropertiesService.getScriptProperties().getProperty("CLAVE");
  if (!chiave) return { ok: false, error: "CLAVE non impostata nello script" };
  if (dati.clave !== chiave) return { ok: false, error: "clave" };
  var v = validaDisponibilidad(dati.datos);
  if (!v.ok) return v;

  var d = dati.datos;
  var ws = foglio(DISPONIBILIDAD);
  ws.getRange("A1:B1").setValues([["json", "generato"]]);
  ws.getRange("A2:B2").setValues([[JSON.stringify(d), d.generato]]);

  // A vista, per chi guarda il foglio: le prime notti, camera per camera.
  var giorni = Math.min(GIORNI_LEGGIBILI, d.camere[CAMERE[0]].liberi.length);
  var testa = ["camera", "totale"], fine = new Date(d.desde + "T00:00:00Z");
  for (var k = 0; k < giorni; k++) {
    testa.push(new Date(fine.getTime() + k * 86400000).toISOString().substring(0, 10));
  }
  var righe = [testa].concat(CAMERE.map(function (id) {
    return [id, d.camere[id].totale].concat(d.camere[id].liberi.slice(0, giorni));
  }));
  ws.getRange(4, 1, righe.length, testa.length).setValues(righe);
  ws.getRange(4, 1, 1, testa.length).setFontWeight("bold");
  return { ok: true };
}

function leggiDisponibilidad() {
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DISPONIBILIDAD);
  var testo = ws ? ws.getRange("A2").getValue() : "";
  if (!testo) return { ok: false, error: "sin datos" };
  return { ok: true, datos: JSON.parse(testo) };
}

function risposta(oggetto) {
  return ContentService
    .createTextOutput(JSON.stringify(oggetto))
    .setMimeType(ContentService.MimeType.JSON);
}
