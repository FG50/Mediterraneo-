"""Collega la pagina al foglio delle prenotazioni e alle camere libere (e altre correzioni).

COME SI USA. index.html e' il pacchetto fatto con Claude Design: non si modifica a mano.
Si riparte sempre dall'originale (commit a6971d6 «Il sito rifatto con Claude Design») e si applica
questo script, che cambia punti precisi della pagina e fallisce se uno non si trova esattamente
una volta:

    git show a6971d6:index.html > /tmp/index.originale.html
    cp /tmp/index.originale.html /tmp/index.nuovo.html
    python3 tools/patch_sito.py /tmp/index.nuovo.html
    cp /tmp/index.nuovo.html index.html
    NODE_PATH=$(npm root -g) node prove/pagina.js        # serve Playwright

Per cambiare la pagina: si aggiunge un punto a questo script (prima della riga
`nuovo = json.dumps(...)`), non si tocca index.html.


index.html e' un pacchetto: dentro c'e' la pagina vera, come testo JSON. Si
apre, si cambiano cinque punti (ognuno deve esserci una volta sola), si
richiude con le stesse regole di scrittura.
"""
import json
import sys
from pathlib import Path

P = Path(sys.argv[1])
t = P.read_text(encoding="utf-8")
A, Z = '<script type="__bundler/template">', "</script>"
a = t.index(A) + len(A)
b = t.index(Z, a)
originale = t[a:b]
pagina = json.loads(originale.strip())
assert json.dumps(pagina, ensure_ascii=False).replace("/", "\\u002F") == originale.strip(), "scrittura diversa"


def sostituisci(testo, vecchio, nuovo):
    assert testo.count(vecchio) == 1, f"punto trovato {testo.count(vecchio)} volte: {vecchio[:60]!r}"
    return testo.replace(vecchio, nuovo)


# 1. L'indirizzo del foglio non e' piu' scritto qui: lo porta config.json.
pagina = sostituisci(pagina, 'const BOOKINGS_ENDPOINT = "";', 'let BOOKINGS_ENDPOINT = "";')

# 2. Su ogni camera, un cartellino «quanti liberi stanotte».
pagina = sostituisci(
    pagina, "Sleeps ${r.beds}</span></div>",
    'Sleeps ${r.beds}</span><span id="medi-free-${r.id}" style="display:none;font-size:13px;padding:7px 14px;'
    'border-radius:9999px;margin-left:8px;font-weight:600"></span></div>')

# 3. Il collegamento: config.json, camere libere, cartellini.
BLOCCO = r'''refresh();

    // ---------- connection: booking sheet + free rooms ----------
    // config.json, next to this page, holds the booking-sheet address and the contacts.
    // The same sheet gives back the free rooms night by night, counted from the hostel's own
    // spreadsheet. If anything here fails the page works as before: no numbers, no blocking.
    const DISP = { dati: null };
    const hoyAsuncion = oggiPy;
    const idxDia = (desde, dia) => Math.round((Date.parse(dia) - Date.parse(desde)) / 86400000);
    const camaDisp = id => (DISP.dati && DISP.dati.camere && DISP.dati.camere[id]) || null;

    // Free units on every night from check-in (included) to check-out (not included); null = unknown.
    function libres(id, desdeDia, hastaDia) {
      const c = camaDisp(id);
      if (!c || !desdeDia || !hastaDia) return null;
      const a = idxDia(DISP.dati.desde, desdeDia), b = idxDia(DISP.dati.desde, hastaDia);
      if (!(b > a) || a < 0 || b > c.liberi.length) return null;
      return Math.min(...c.liberi.slice(a, b));
    }
    function primeraLlena(id, desdeDia, hastaDia, n) {
      const c = camaDisp(id), a = idxDia(DISP.dati.desde, desdeDia), b = idxDia(DISP.dati.desde, hastaDia);
      for (let i = a; i < b; i++) if (c.liberi[i] < n) return iso(new Date(Date.parse(DISP.dati.desde) + i * 86400000));
      return null;
    }

    function pintaLibres() {
      ROOMS.forEach(r => {
        const el = root.querySelector(`#medi-free-${r.id}`), c = camaDisp(r.id);
        if (!el) return;
        const i = c ? idxDia(DISP.dati.desde, hoyAsuncion()) : -1;
        if (!c || i < 0 || i >= c.liberi.length) { el.style.display = "none"; return; }
        const n = c.liberi[i];
        el.textContent = r.unit === "bed"
          ? (n === 0 ? "Full tonight" : `${n} of ${c.totale} bed${c.totale === 1 ? "" : "s"} free tonight`)
          : (n === 0 ? "Taken tonight" : "Free tonight");
        el.style.background = n === 0 ? "#FBE9E7" : "#E3F3E8";
        el.style.color = n === 0 ? "#8A1C12" : "#14532D";
        el.style.display = "inline-flex";
      });
    }

    // The line shown in the booking dialog for the chosen dates.
    function avisoLibres(room, g) {
      const per = room.unit === "bed" ? Math.min(g, room.beds) : 1;
      const n = libres(room.id, elIn.value, elOut.value);
      if (n === null) return { html: "", bloquea: false };
      const caja = (fondo, color, texto) => `<div style="margin-top:9px;padding:9px 12px;border-radius:8px;font-size:14px;font-weight:600;background:${fondo};color:${color}">${texto}</div>`;
      if (n >= per) {
        return { html: caja("#E3F3E8", "#14532D", room.unit === "bed" ? `✓ ${n} bed${n === 1 ? "" : "s"} free on every night of your stay` : "✓ Free on every night of your stay"), bloquea: false };
      }
      const primera = primeraLlena(room.id, elIn.value, elOut.value, per);
      const cuando = primera ? ` — first night short: ${pretty(primera)}` : "";
      return { html: caja("#FBE9E7", "#8A1C12", n === 0
        ? `Not available on these dates${cuando}. Try other dates.`
        : `Only ${n} bed${n === 1 ? "" : "s"} free on every night of your stay${cuando}. Lower the number of guests or change the dates.`), bloquea: true };
    }

    (async function conectar() {
      const base = "https://fg50.github.io/Mediterraneo-/";
      try {
        const r = await fetch(new URL("config.json", base), { cache: "no-store" });
        if (r.ok) {
          const c = await r.json();
          if (c.endpoint) BOOKINGS_ENDPOINT = c.endpoint;
          if (c.whatsapp) CONTACT.whatsapp = c.whatsapp;
          if (c.email) CONTACT.email = c.email;
        }
      } catch { /* no config: the page keeps working by hand */ }
      if (!BOOKINGS_ENDPOINT) return;
      try {
        const r = await fetch(BOOKINGS_ENDPOINT + (BOOKINGS_ENDPOINT.includes("?") ? "&" : "?") + "accion=disponibilidad", { cache: "no-store" });
        const j = await r.json();
        // Numbers older than a day and a half are not to be trusted: better none than wrong ones.
        if (j.ok && j.datos && Date.now() - Date.parse(j.datos.generato) < 36 * 3600000) {
          DISP.dati = j.datos;
          pintaLibres();
          disegnaRiepilogo();
        }
      } catch { /* no numbers: nobody is blocked */ }
    })();

    // ---------- booking dialog ----------'''
pagina = sostituisci(pagina, "refresh();\n\n    // ---------- booking dialog ----------", BLOCCO)

# 4. Nel riquadro delle date, una riga che dice se ci sono posti.
pagina = sostituisci(
    pagina, 'dlgSummary.innerHTML = row("Room", current.name) + row("Guests", g) + conto;',
    'const av = avisoLibres(current, g);\n'
    '      dlgSummary.innerHTML = row("Room", current.name) + row("Guests", g) + conto + av.html;\n'
    '      const enviar = root.querySelector("#medi-send-req");\n'
    '      if (enviar && !dlg.dataset.grazie) enviar.disabled = av.bloquea;')

# 5. Il foglio puo' rispondere «no»: non si ringrazia a vuoto.
pagina = sostituisci(
    pagina, "if (!r.ok) throw new Error(r.status);\n        ringrazia();",
    'if (!r.ok) throw new Error(r.status);\n'
    '        const j = await r.json().catch(() => ({ ok: true }));\n'
    '        if (j && j.ok === false) throw new Error(j.error || "rejected");\n'
    '        ringrazia();')

# 6. Il tasto «Invia» era collegato due volte (onclick ad ogni apertura + un ascoltatore fisso):
#    ogni richiesta sarebbe arrivata al foglio due volte. Resta solo l'onclick, che cambia
#    anche in «Close» dopo il grazie.
pagina = sostituisci(
    pagina, '    root.querySelector("#medi-send-req").addEventListener("click", () => this.sendRequest());\n\n', '')

# 7. La prima notte non puo' mai essere nel passato. «Oggi» e' quello di Asunción (UTC-3),
#    non quello dell'orologio di chi guarda. All'apertura del riquadro il check-in e' oggi e il
#    check-out domani; una data passata, scritta a mano, torna a oggi; il minimo si rifa' ad
#    ogni apertura (una pagina lasciata aperta oltre la mezzanotte non resta indietro).
pagina = sostituisci(
    pagina, "    let elIn, elOut, elGuests;\n",
    "    // Today in Asunción (UTC-3), whatever the clock of the person looking.\n"
    "    const oggiPy = () => iso(new Date(Date.now() - 3 * 3600000));\n"
    "    let elIn, elOut, elGuests;\n")
pagina = sostituisci(
    pagina, "      const t = new Date();\n      const oggi = iso(new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())));\n",
    "      const oggi = oggiPy();\n")
pagina = sostituisci(
    pagina, "    function openBooking(room) {\n      current = room;\n",
    "    // The first night is never in the past: check-in starts as today, check-out as tomorrow.\n"
    "    function fechasDeHoy() {\n"
    "      const oggi = oggiPy();\n"
    "      elIn.min = oggi; elOut.min = oggi;\n"
    "      if (!elIn.value || elIn.value < oggi) elIn.value = oggi;\n"
    "      if (!elOut.value || elOut.value <= elIn.value) {\n"
    "        const a = new Date(elIn.value + \"T00:00:00Z\");\n"
    "        a.setUTCDate(a.getUTCDate() + 1);\n"
    "        elOut.value = iso(a);\n"
    "      }\n"
    "    }\n\n"
    "    function openBooking(room) {\n      current = room;\n      fechasDeHoy();\n")
pagina = sostituisci(
    pagina, '      if (!e.target.matches("#medi-checkin, #medi-checkout, #medi-guests")) return;\n',
    '      if (!e.target.matches("#medi-checkin, #medi-checkout, #medi-guests")) return;\n'
    '      if (elIn.value && elIn.value < oggiPy()) elIn.value = oggiPy();\n')
pagina = sostituisci(
    pagina, '      const form = root.querySelector("#medi-book-form");\n      if (!form.reportValidity()) return;\n',
    '      const form = root.querySelector("#medi-book-form");\n'
    '      elIn.min = oggiPy(); elOut.min = oggiPy();\n'
    '      if (!form.reportValidity()) return;\n')

# 8. La mappa: le tessere di CARTO ora chiedono una chiave a pagamento e coprono la mappa con
#    «API KEY REQUIRED». Si passa alle tessere libere di OpenStreetMap (con l'attribuzione).
pagina = sostituisci(
    pagina,
    'L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {\n'
    '        subdomains: "abcd", maxZoom: 20,\n'
    '        attribution: \'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>\'\n',
    'L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {\n'
    '        maxZoom: 19,\n'
    '        attribution: \'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors\'\n')

# 8b. La mappa partiva a volte PRIMA che la libreria Leaflet fosse arrivata, e mostrava il messaggio
#     «The map is not loading right now» anche se la libreria sarebbe arrivata un attimo dopo.
#     Ora aspetta fino a 8 secondi prima di arrendersi.
pagina = sostituisci(
    pagina, "(function drawMap() {\n",
    "(function drawMap(attese = 0) {\n"
    "      // Leaflet can arrive a moment after this code: wait for it (up to 8 s) before giving up.\n"
    "      if (!window.L && attese < 40) { setTimeout(() => drawMap(attese + 1), 200); return; }\n")

nuovo = json.dumps(pagina, ensure_ascii=False).replace("/", "\\u002F")
P.write_text(t[:a] + "\n" + nuovo + "\n  " + t[b:], encoding="utf-8")
print("[ok] pagina collegata:", len(pagina), "caratteri")


# 9. SEO. La pagina vera sta dentro il pacchetto e compare solo dopo che il browser lo apre: chi non
#    esegue JavaScript (le anteprime di WhatsApp e Facebook, molti motori) vede solo un titolo. Si
#    mettono nella testata statica descrizione, anteprima e dati strutturati, e nel corpo un testo
#    per chi non ha JavaScript. Il browser li butta via quando apre il pacchetto: nessun doppione.
SITO = "https://fg50.github.io/Mediterraneo-/"
DESCRIZIONE = ("Dorm beds and private rooms in the middle of Asunción, Paraguay. "
               "Book straight with Mediterraneo Youth Hostel — no booking site in between.")
DATI = {
    "@context": "https://schema.org", "@type": "Hostel", "name": "Mediterraneo Youth Hostel",
    "url": SITO, "description": DESCRIZIONE,
    "address": {"@type": "PostalAddress", "streetAddress": "Nuestra Señora de la Asunción 865",
                "addressLocality": "Asunción", "addressCountry": "PY"},
    "geo": {"@type": "GeoCoordinates", "latitude": -25.286771, "longitude": -57.637340},
    "currenciesAccepted": "PYG", "priceRange": "₲60,000–₲140,000",
    "amenityFeature": [{"@type": "LocationFeatureSpecification", "name": n, "value": True}
                       for n in ("Air conditioning", "Lockers in the dormitories", "Daily cleaning")],
}
TESTATA = f"""<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mediterraneo Youth Hostel · Hostel in Asunción, Paraguay</title>
  <meta name="description" content="{DESCRIZIONE}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="theme-color" content="#EAF1F8">
  <link rel="canonical" href="{SITO}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Mediterraneo Youth Hostel">
  <meta property="og:title" content="Mediterraneo Youth Hostel · Asunción">
  <meta property="og:description" content="{DESCRIZIONE}">
  <meta property="og:url" content="{SITO}">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary">
  <script type="application/ld+json">{json.dumps(DATI, ensure_ascii=False)}</script>"""
CORPO = """<body>
  <noscript>
    <h1>Mediterraneo Youth Hostel — Asunción, Paraguay</h1>
    <p>Dormitories (mixed, women only, men only) and private rooms in the middle of Asunción,
    at Nuestra Señora de la Asunción 865. Beds from ₲60,000 a night. Book straight with us.</p>
    <p>This page needs JavaScript to show the rooms and the booking form.</p>
  </noscript>"""
fine = P.read_text(encoding="utf-8")
assert fine.count("<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>Mediterraneo Youth Hostel</title>") == 1, "testata statica non trovata"
fine = fine.replace("<html>\n<head>\n  <meta charset=\"utf-8\">\n  <title>Mediterraneo Youth Hostel</title>", TESTATA, 1)
assert fine.count("<body>\n  <div id=\"__bundler_thumbnail\">") == 1, "corpo statico non trovato"
fine = fine.replace("<body>\n  <div id=\"__bundler_thumbnail\">", CORPO + "\n  <div id=\"__bundler_thumbnail\">", 1)
P.write_text(fine, encoding="utf-8")
print("[ok] mappa libera + testata SEO")
