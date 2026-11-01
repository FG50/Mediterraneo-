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
 * Tre schede, create da sole la prima volta (o con la funzione prepara):
 *   Pedidos        una riga per richiesta. I nomi delle colonne sono i campi
 *                  che manda la pagina; a destra due colonne che si calcolano
 *                  da sole: quanti posti restano liberi in tutte le notti
 *                  chieste, e se bastano.
 *   Disponibilidad le camere libere notte per notte (45 giorni), colorate,
 *                  con l'ora dell'ultimo aggiornamento dal foglio dei conti.
 *   Datos          gli stessi numeri come testo per la pagina. Nascosta.
 *
 * Le proprieta' dello script (Impostazioni progetto → Proprieta' dello script):
 *   CLAVE          la parola che deve mandare il foglio dei conti per
 *                  aggiornare le camere libere. Senza, nessuno puo'.
 */

var PEDIDOS = "Pedidos";
var DISPONIBILIDAD = "Disponibilidad";
var DATOS = "Datos";

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
var GIORNI_GRIGLIA = 45;         // quanti giorni si vedono nella scheda Disponibilidad
var COLONNE_EXTRA = ["free_every_night", "availability"];   // calcolate dal foglio, non scritte dalla pagina
var COLORI = { piena: "#FBE9E7", parziale: "#FFF4D6", libera: "#E3F3E8", testa: "#E8EEF9", nd: "#EEEEEE" };


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

/** Numero di giorno del foglio (giorni dal 30/12/1899): non dipende dal fuso orario. */
function seriale(testoData) {
  return Math.round((Date.parse(testoData + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Lettera della colonna: 1 → A, 27 → AA. */
function lettera(n) {
  var s = "";
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Le due formule a destra di ogni richiesta. La prima prende, dalla griglia di
 * Disponibilidad, il numero piu' basso di posti liberi tra la notte d'arrivo e
 * l'ultima notte; la seconda lo confronta con quelli chiesti. Se le date non
 * sono nella griglia, lo dice e non inventa.
 */
function formuleControllo(fila) {
  var c = COLONNE, ultima = lettera(2 + GIORNI_GRIGLIA), fondo = 4 + CAMERE.length;
  var dati = "Disponibilidad!$C$5:$" + ultima + "$" + fondo;
  var giorni = "Disponibilidad!$C$4:$" + ultima + "$4";
  var nomi = "Disponibilidad!$A$5:$A$" + fondo;
  var col = function (k) { return "$" + lettera(c.indexOf(k) + 1) + fila; };
  var camera = "MATCH(" + col("roomId") + "," + nomi + ",0)";
  var libere = '=IFERROR(MIN(INDEX(' + dati + ',' + camera + ',MATCH(' + col("checkin") + ',' + giorni + ',0))' +
    ':INDEX(' + dati + ',' + camera + ',MATCH(' + col("checkout") + '-1,' + giorni + ',0))),"")';
  var R = "$" + lettera(c.length + 1) + fila;
  var esito = '=IF(' + R + '="","outside the table",IF(' + R + '>=' + col("unitsBooked") + ',"free","not enough"))';
  return [libere, esito];
}

function regola(area, testo, colore) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(testo).setBackground(colore).setRanges([area]).build();
}

/** La scheda delle richieste, con l'intestazione e i formati la prima volta. */
function preparaPedidos() {
  var ws = foglio(PEDIDOS);
  if (ws.getLastRow() === 0) {
    var testa = COLONNE.concat(COLONNE_EXTRA);
    ws.appendRow(testa);
    ws.getRange(1, 1, 1, testa.length).setFontWeight("bold").setBackground(COLORI.testa);
    ws.setFrozenRows(1);
    var giu = ws.getMaxRows() - 1;
    ws.getRange(2, COLONNE.indexOf("checkin") + 1, giu, 2).setNumberFormat("yyyy-mm-dd");
    var area = ws.getRange(2, COLONNE.length + 2, giu, 1);
    ws.setConditionalFormatRules([
      regola(area, "free", COLORI.libera),
      regola(area, "not enough", COLORI.piena),
      regola(area, "outside the table", COLORI.nd)
    ]);
  }
  return ws;
}

/** La scheda delle camere libere. Esiste prima di tutto: le formule di Pedidos la nominano. */
function preparaDisponibilidad() {
  var ws = foglio(DISPONIBILIDAD);
  if (ws.getRange("A1").getValue() === "") {
    ws.getRange("A1").setValue("Free beds (or rooms) per night, counted from the hostel's own spreadsheet. Read-only; refreshed every 30 minutes.");
    ws.getRange("A1").setFontWeight("bold");
    ws.getRange("A2").setValue("Waiting for the first update…");
    ws.setFrozenRows(4);
    ws.setFrozenColumns(2);
  }
  return ws;
}

/** Crea le schede vuote, per vederle prima della prima richiesta. Da lanciare una volta a mano. */
function prepara() {
  preparaDisponibilidad();
  preparaPedidos();
}

function guardaPedido(dati) {
  var v = validaPedido(dati);
  if (!v.ok) return v;
  var lucchetto = LockService.getScriptLock();
  lucchetto.waitLock(10000);          // due richieste insieme non si pestano
  try {
    preparaDisponibilidad();
    var ws = preparaPedidos();
    ws.appendRow(COLONNE.map(function (k) {
      return k === "checkin" || k === "checkout" ? seriale(v.riga[k]) : v.riga[k];
    }));
    var fila = ws.getLastRow();
    ws.getRange(fila, COLONNE.indexOf("checkin") + 1, 1, 2).setNumberFormat("yyyy-mm-dd");
    ws.getRange(fila, COLONNE.length + 1, 1, COLONNE_EXTRA.length).setFormulas([formuleControllo(fila)]);
  } finally {
    lucchetto.releaseLock();
  }
  return { ok: true };
}


// --- le camere libere ------------------------------------------------------

/** Controlla le camere libere mandate dal foglio dei conti. */
function validaDisponibilidad(datos) {
  if (!datos || !dataValida(datos.desde) || !datos.camere || !datos.generato || isNaN(Date.parse(datos.generato))) {
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
  var ws = preparaDisponibilidad();

  // Per la pagina: gli stessi numeri come testo, in una scheda nascosta.
  var datos = foglio(DATOS);
  datos.getRange("A1:B1").setValues([["json", "generato"]]);
  datos.getRange("A2:B2").setValues([[JSON.stringify(d), d.generato]]);
  try { datos.hideSheet(); } catch (err) { /* se non si puo' nascondere, resta visibile */ }

  // A vista, per chi guarda il foglio: camera per camera, notte per notte, a colori.
  var giorni = Math.min(GIORNI_GRIGLIA, d.camere[CAMERE[0]].liberi.length);
  var inizio = seriale(d.desde);
  var testa = ["camera", "totale"];
  for (var k = 0; k < giorni; k++) testa.push(inizio + k);
  var righe = [testa].concat(CAMERE.map(function (id) {
    return [id, d.camere[id].totale].concat(d.camere[id].liberi.slice(0, giorni));
  }));
  var colori = righe.map(function (r, i) {
    return r.map(function (x, j) {
      if (i === 0 || j < 2) return COLORI.testa;
      return x === 0 ? COLORI.piena : x < r[1] ? COLORI.parziale : COLORI.libera;
    });
  });
  ws.getRange(4, 1, CAMERE.length + 1, 2 + GIORNI_GRIGLIA).clearContent();
  var area = ws.getRange(4, 1, righe.length, testa.length);
  area.setValues(righe);
  area.setBackgrounds(colori);
  area.setHorizontalAlignment("center");
  ws.getRange(4, 1, 1, testa.length).setFontWeight("bold");
  ws.getRange(4, 3, 1, giorni).setNumberFormat("ddd d/m");

  var asuncion = new Date(Date.parse(d.generato) - 3 * 3600000).toISOString().replace("T", " ").substring(0, 16);
  ws.getRange("A2").setValue("Last update from the hostel spreadsheet: " + asuncion +
    " (Asunción time).   Green = all free · amber = some taken · red = full.");
  return { ok: true };
}

/** Le camere libere, come le ha mandate il foglio dei conti (per la pagina). */
function leggiDisponibilidad() {
  var ws = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DATOS);
  var testo = ws ? ws.getRange("A2").getValue() : "";
  if (!testo) return { ok: false, error: "sin datos" };
  return { ok: true, datos: JSON.parse(testo) };
}

function risposta(oggetto) {
  return ContentService
    .createTextOutput(JSON.stringify(oggetto))
    .setMimeType(ContentService.MimeType.JSON);
}
