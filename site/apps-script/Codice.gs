/**
 * Il registro delle prenotazioni del sito.
 *
 * Il sito sta su GitHub Pages, che serve file e basta: non c'e' un
 * server che possa scrivere da qualche parte. Questo script e' quel
 * pezzo mancante, e sta dentro un foglio Google.
 *
 * Ogni richiesta mandata dal sito arriva qui e diventa una riga.
 * I nomi delle colonne sono gli stessi campi che manda la pagina:
 * cosi' il CSV del foglio si riusa senza tradurre niente, e
 * `tools/prenotazioni_sito.py --csv` ci tira fuori l'Excel.
 *
 * Come si mette in piedi: site/README.md, tre minuti.
 */

var COLONNE = [
  "receivedAt", "status", "guestName", "guestEmail",
  "roomId", "room", "unit", "guests", "unitsBooked",
  "checkin", "checkout", "nights",
  "pricePerUnit", "total", "currency", "note", "source"
];

function doPost(e) {
  try {
    var dati = JSON.parse(e.postData.contents);
    var ws = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // La prima volta si scrive l'intestazione, e poi mai piu'.
    if (ws.getLastRow() === 0) {
      ws.appendRow(COLONNE);
      ws.getRange(1, 1, 1, COLONNE.length).setFontWeight("bold");
      ws.setFrozenRows(1);
    }

    ws.appendRow(COLONNE.map(function (k) {
      return dati[k] === undefined ? "" : dati[k];
    }));

    return risposta({ ok: true });
  } catch (err) {
    return risposta({ ok: false, error: String(err) });
  }
}

// Un GET a mano serve solo a vedere che l'indirizzo sia vivo.
function doGet() {
  return risposta({ ok: true, note: "registro prenotazioni Mediterraneo" });
}

function risposta(oggetto) {
  return ContentService
    .createTextOutput(JSON.stringify(oggetto))
    .setMimeType(ContentService.MimeType.JSON);
}
