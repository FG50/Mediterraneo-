# Il sito di Mediterraneo

Una pagina sola, `index.html`, senza niente da compilare. GitHub Pages la
pubblica ogni volta che cambia: si spinge il file, e dopo un minuto e'
online. Non c'e' nessuna Action di mezzo.

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

### 1 e 2. Il foglio delle prenotazioni, e l'indirizzo nel sito

Le prenotazioni non vanno per email: finiscono in un foglio Google, e da li'
esce l'Excel. GitHub Pages non ha un server, quindi il pezzo che scrive sta
dentro il foglio. Lo stesso foglio tiene anche le **camere libere**, che il
foglio dei conti dell'ostello gli manda (vedi sotto), e le da' al sito.

1. Vai su [sheets.new](https://sheets.new) e chiama il foglio
   *Prenotazioni sito*.
2. **Estensioni → Apps Script**. Cancella quello che c'e' e incolla tutto
   `apps-script/Codice.gs`. Salva.
3. Nella barra in alto scegli la funzione **prepara** e premi **Esegui**:
   Google chiede il permesso la prima volta (e' normale: lo script scrive nel
   tuo foglio). Crea le schede vuote, cosi' le vedi subito.
4. **Impostazioni progetto → Proprieta' dello script → Aggiungi**:
   nome `CLAVE`, valore una parola lunga a caso. E' la chiave con cui il
   foglio dei conti aggiorna le camere libere; senza, nessuno puo'.
5. **Esegui il deployment → Nuovo deployment**, tipo **App web**, con
   *Esegui come*: **Me**, e *Chi ha accesso*: **Chiunque**.
6. Copia l'indirizzo che ti da (finisce per `/exec`) e mettilo in
   `config.json`, accanto a `index.html`:

```json
{ "endpoint": "https://script.google.com/macros/s/..../exec",
  "whatsapp": "595981XXXXXX", "email": "..." }
```

Il numero WhatsApp col prefisso internazionale, senza spazi e senza `+`.
Il file e' pubblico, come il sito: ci vanno solo cose che il sito mostra
comunque. **La chiave `CLAVE` non ci va mai.**

Finche' `endpoint` resta vuoto la pagina e' quella di prima: il tasto
Prenota non fa finta di niente, copia la richiesta e apre WhatsApp gia'
scritta. Se il foglio risponde «no», la pagina non dice «Request received».

Nel foglio compaiono tre schede, create da sole:

* **Pedidos** — una riga per richiesta (i campi che manda la pagina). A destra
  due colonne che si calcolano da sole: `free_every_night`, i posti che restano
  liberi in *tutte* le notti chieste, e `availability`: **free** (verde),
  **not enough** (rosso) o **outside the table** (grigio, date oltre i 45
  giorni noti).
* **Disponibilidad** — le camere libere notte per notte, per 45 giorni,
  colorate (verde tutto libero, giallo qualcuno occupato, rosso pieno), con
  l'ora dell'ultimo aggiornamento dal foglio dei conti.
* **Datos** — gli stessi numeri come testo, per la pagina. Nascosta.

## Far vedere il foglio agli altri

Il foglio Google si apre dal browser come un Excel. Per farlo vedere:
**Condividi → Chiunque abbia il link → Visualizzatore** (nessuno puo'
cambiarlo). Chi lo scarica come Excel (**File → Scarica → .xlsx**) ha una
foto di quel momento, non il foglio vivo.

Per la dimostrazione:

1. Dal sito, scegli una camera e invia una richiesta di prova.
2. Nel foglio, in *Pedidos*, dopo pochi secondi c'e' la riga. A destra la
   colonna `availability` dice se quelle notti sono libere.
3. In *Disponibilidad* si vede la griglia dell'ostello e l'ora
   dell'ultimo aggiornamento: ogni 30 minuti arriva dall'Excel di gestione.

**Attenzione ai dati veri.** In *Pedidos* ci sono nomi e email degli ospiti.
Per una dimostrazione usa richieste di prova, e se ci sono prenotazioni vere
condividi solo con persone indicate per nome, non con il link aperto a tutti.

## Le camere libere, dall'Excel dell'ostello al sito

L'Excel dell'ostello e' privato e non si tocca. Il passaggio e' questo:

```
Excel dell'ostello  →  (ogni 30 minuti, sola lettura)  →  foglio Google  →  sito
 repository Hostel        workflow «Camere libere per il sito»        Apps Script       cartellini
```

1. Nel repository privato `Hostel`, il workflow `disponibilita.yml` legge
   l'Excel, conta i letti liberi per ogni camera e per ogni notte dei prossimi
   120 giorni (un letto e' occupato se il suo codice, per esempio `G2`, sta
   in UBICACION di una prenotazione), e li manda allo script con la chiave.
2. Lo script li scrive nella scheda *Disponibilidad* (a vista) e in *Datos*
   (per la pagina), e li da' al sito (`?accion=disponibilidad`).
3. Il sito mostra su ogni camera «6 of 8 beds free tonight», e nel riquadro
   delle date «3 beds free on every night of your stay» oppure «Not
   available on these dates»; in quel caso il tasto Invia si spegne.

Nel repository `Hostel` servono due segreti: `SITO_ENDPOINT` (l'indirizzo
`/exec`) e `SITO_CLAVE` (la stessa parola di `CLAVE`).

Cose da sapere:

* I numeri vengono **solo dall'Excel**. Una richiesta arrivata dal sito non
  toglie posti finche' una persona non la mette in `REGISTRO RESERVAS`.
* Numeri piu' vecchi di un giorno e mezzo la pagina li ignora: meglio nessun
  numero che uno sbagliato. Se qualcosa non va, il sito funziona come prima e
  nessuno viene bloccato.
* Una prenotazione senza posti assegnati toglie un letto per categoria
  (maschile, femminile, mista) invece che dai codici.

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

Si spinge su `main`, e basta. Pages e' impostato cosi':

**Settings → Pages → Build and deployment → Source: Deploy from a branch,
ramo `main`, cartella `/ (root)`.**

L'indirizzo e' `https://fg50.github.io/Mediterraneo-/`. Il primo giro dopo
il Save ci mette un paio di minuti; i successivi, meno di uno.

`.nojekyll` c'e' apposta: dice a GitHub di servire i file come stanno,
senza passarli da Jekyll.

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

## Le prove

Due, senza installare niente nel sito:

```
node apps-script/prueba.js      # lo script del foglio, con un foglio finto
node prove/pagina.js            # la pagina vera in un browser (serve Playwright)
```

La seconda apre la pagina, le dice che il foglio esiste e risponde, e guarda
che i cartellini, il riquadro delle date, il tasto Invia e la richiesta che
parte siano quelli giusti. Controlla anche che ogni richiesta parta **una
volta sola**.
