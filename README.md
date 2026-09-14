# Il sito di Mediterraneo

Una pagina sola, `site/index.html`, senza niente da compilare. GitHub Pages
la pubblica ogni volta che cambia.

Questo repository e' **pubblico apposta**: un sito lo deve vedere il mondo, e
Pages gratis vuole un repository pubblico. Qui dentro non c'e' niente dei
conti dell'ostello — quelli stanno nel repository privato `Hostel`, e la'
restano.

## Cosa c'e' dentro

* Il meteo di Asunción in cima — **Open-Meteo**, gratis e senza account.
  Se la rete non risponde resta la riga del settembre tipico, non un buco.
* La mappa del quartiere — **Leaflet** con le mappe di OpenStreetMap:
  strade vere, si trascina e si zooma, coi nostri pallini sopra. Ogni posto
  nell'elenco a fianco ha il suo link «Open in Google Maps».
* Le sei camere con foto, disponibilita', prezzo e il tasto Prenota.

## Le tre cose da fare prima che vada online

### 1. I contatti

In cima allo `<script>` dentro `index.html`:

```js
const CONTACT = { whatsapp: "595981XXXXXX", email: "..." };
```

Il numero col prefisso internazionale, senza spazi e senza `+`.

### 2. Il registro delle prenotazioni

Le prenotazioni non vanno per email: finiscono in un foglio, e da li' esce
l'Excel. GitHub Pages non ha un server, quindi il pezzo che scrive sta
dentro un foglio Google.

1. Vai su [sheets.new](https://sheets.new) e chiama il foglio
   *Prenotazioni sito*.
2. **Estensioni → Apps Script**. Cancella quello che c'e' e incolla tutto
   `site/apps-script/Codice.gs`. Salva.
3. **Esegui il deployment → Nuovo deployment**, tipo **App web**, con
   *Esegui come*: **Me**, e *Chi ha accesso*: **Chiunque**.
4. Copia l'indirizzo che ti da (finisce per `/exec`) e mettilo in
   `index.html`:

```js
const BOOKINGS_ENDPOINT = "https://script.google.com/macros/s/..../exec";
```

Finche' resta vuoto il tasto Prenota non fa finta di niente: copia la
richiesta e apre WhatsApp gia' scritta.

### 3. Le foto

In `ROOMS`, dentro `photos`, ogni foto e' `{ src: "...", alt: "..." }`.
Finche' `src` manca, al suo posto compare un riquadro con scritto cosa
dovrebbe esserci. Le immagini si possono mettere in `site/foto/` e
richiamare come `foto/camerata-1.jpg`.

## Dall'Excel del foglio all'Excel che si legge

Dal foglio Google: **File → Scarica → CSV**. Poi:

```
python3 tools/prenotazioni_sito.py --csv prenotazioni.csv
```

(lo script sta nel repository privato `Hostel`, insieme al resto dei conti)

Esce `prenotazioni-sito.xlsx`, con le colonne di `REGISTRO RESERVAS`: una
riga si incolla la' senza spostare niente.

**Quello dell'ostello non lo tocca nessuno.** Il passaggio in
`REGISTRO RESERVAS` lo fa una persona, a prenotazione confermata.

## Come si pubblica

C'e' gia' `.github/workflows/pages.yml`: a ogni push che cambia `site/`,
GitHub ripubblica. Una volta sola, all'inizio, bisogna accendere Pages:

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

L'indirizzo e' `https://fg50.github.io/Mediterraneo-/`.

## Le mappe: perche' OpenStreetMap e non Google

La mappa incorporata di Google, quella gratis e senza account, sa centrare
un posto solo: mostrerebbe l'ostello e nient'altro, e la sezione «cosa c'e'
intorno» non avrebbe piu' senso. Per metterci i nostri dodici pallini
Google vuole una chiave API, che vuole un account Google Cloud con una
carta di credito sopra.

Leaflet con le mappe di OpenStreetMap fa la stessa cosa — strade vere, si
trascina, si zooma — e ci lascia disegnare sopra i nostri pallini, con i
nostri simboli e le distanze. Gratis e senza account.
Chi vuole Google ce l'ha lo stesso: ogni posto nell'elenco ha il suo link.
