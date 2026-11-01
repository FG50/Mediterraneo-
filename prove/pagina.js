const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const RADICE = path.resolve(__dirname, '..');
const server = http.createServer((q, r) => {
  const f = path.join(RADICE, q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': f.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
  r.end(fs.readFileSync(f));
});

const CORS = { 'Access-Control-Allow-Origin': '*' };   // come lo script di Google
const iso = d => d.toISOString().slice(0, 10);
const hoy = new Date(Date.now() - 3 * 3600000);
const giorno = n => iso(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + n)));

function disponibilidad(generato) {
  const mk = (tot, f) => ({ totale: tot, liberi: Array.from({ length: 40 }, (_, i) => f(i)) });
  return { generato: generato || new Date().toISOString(), desde: giorno(0), giorni: 40, camere: {
    mixed: mk(8, i => (i === 0 ? 6 : i === 2 ? 3 : 8)), female: mk(6, () => 6), male: mk(8, i => (i === 1 ? 0 : 7)),
    triple: mk(3, () => 3), twin: mk(1, () => 1), ensuite: mk(1, i => (i === 0 ? 0 : 1)), private: mk(1, () => 1) } };
}

let falle = 0;
const cheque = (cond, msg) => { console.log((cond ? 'ok   - ' : 'MALE - ') + msg); if (!cond) falle++; };

async function apri(browser, { config, disp, postRisposta, ora, zona }) {
  const ctx = await browser.newContext(zona ? { timezoneId: zona } : {});
  if (ora) await ctx.addInitScript(t => {            // l'orologio del browser fermo a quell'ora
    const Vera = Date, f = Vera.parse(t);
    window.Date = class extends Vera { constructor(...a) { a.length ? super(...a) : super(f); } static now() { return f; } };
  }, ora);
  const page = await ctx.newPage();
  const visti = { posts: [], richieste: [] };
  await page.route('https://fg50.github.io/Mediterraneo-/config.json', r =>
    config ? r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(config) }) : r.fulfill({ status: 404, headers: CORS, body: '' }));
  await page.route('https://script.example/**', r => {
    const q = r.request(); visti.richieste.push(q.method() + ' ' + q.url());
    if (q.method() === 'POST') { visti.posts.push(JSON.parse(q.postData())); return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(postRisposta || { ok: true }) }); }
    return r.fulfill({ contentType: 'application/json', headers: CORS, body: JSON.stringify(disp ? { ok: true, datos: disp } : { ok: false, error: 'sin datos' }) });
  });
  // fuori dalla rete: tutto il resto (mappe, meteo, font) non serve a questa prova
  await page.route(/^https?:\/\/(?!localhost|fg50\.github\.io|script\.example)/, r => r.abort());
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('[data-book="mixed"]', { timeout: 30000 });
  return { page, visti, ctx };
}

(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await chromium.launch();

  // 1) senza configurazione: la pagina e' quella di prima
  {
    const { page, ctx } = await apri(browser, { config: null });
    await page.waitForTimeout(500);
    cheque(await page.locator('#medi-free-mixed').isHidden(), 'senza config.json nessun cartellino');
    await page.click('[data-book="mixed"]');
    cheque((await page.inputValue('#medi-checkin')) === giorno(0) && (await page.inputValue('#medi-checkout')) === giorno(1), 'all\'apertura: check-in oggi, check-out domani');
    cheque((await page.getAttribute('#medi-checkin', 'min')) === giorno(0), 'il minimo del check-in e\' oggi');
    await page.fill('#medi-checkin', giorno(-3)); await page.dispatchEvent('#medi-checkin', 'change');
    cheque((await page.inputValue('#medi-checkin')) === giorno(0), 'una data passata scritta a mano torna a oggi');
    cheque((await page.inputValue('#medi-checkout')) === giorno(1), 'e il check-out resta dopo il check-in');
    cheque(await page.locator('#medi-send-req').isEnabled(), 'senza config.json il tasto Invia resta acceso');
    await ctx.close();
  }

  // «oggi» e' quello di Asunción (UTC-3), non quello dell'orologio di chi guarda
  for (const [ora, zona, oggi, domani, perche] of [
    ['2026-11-01T20:00:00Z', 'Asia/Tokyo', '2026-11-01', '2026-11-02', 'a Tokyo è già il 2, ad Asunción è ancora il 1'],
    ['2026-11-02T02:30:00Z', 'Europe/Rome', '2026-11-01', '2026-11-02', '23:30 ad Asunción: ancora il 1'],
    ['2026-11-02T03:30:00Z', 'America/Los_Angeles', '2026-11-02', '2026-11-03', '00:30 ad Asunción: già il 2'],
  ]) {
    const { page, ctx } = await apri(browser, { config: null, ora, zona });
    await page.click('[data-book="mixed"]');
    cheque((await page.inputValue('#medi-checkin')) === oggi && (await page.inputValue('#medi-checkout')) === domani && (await page.getAttribute('#medi-checkin', 'min')) === oggi,
      `check-in ${oggi}, check-out ${domani}, minimo ${oggi} (${perche})`);
    await ctx.close();
  }

  // 2) con l'indirizzo: cartellini e riga nel riquadro
  {
    const { page, visti, ctx } = await apri(browser, { config: { endpoint: 'https://script.example/exec', whatsapp: '', email: '' }, disp: disponibilidad() });
    await page.waitForFunction(() => document.querySelector('#medi-free-mixed')?.textContent);
    cheque((await page.locator('#medi-free-mixed').textContent()) === '6 of 8 beds free tonight', 'cartellino camerata mista: 6 of 8 beds free tonight');
    cheque((await page.locator('#medi-free-ensuite').textContent()) === 'Taken tonight', 'cartellino doppia: Taken tonight');
    cheque((await page.locator('#medi-free-twin').textContent()) === 'Free tonight', 'cartellino twin: Free tonight');
    cheque(visti.richieste.some(x => x.startsWith('GET https://script.example/exec?accion=disponibilidad')), 'la pagina chiede le camere libere al foglio');

    await page.click('[data-book="mixed"]');
    cheque((await page.inputValue('#medi-checkin')) === giorno(0), 'con il foglio collegato: check-in gia\' oggi all\'apertura');
    await page.fill('#medi-checkin', giorno(1)); await page.fill('#medi-checkout', giorno(4));     // notti 1, 2, 3 → minimo 3 (la notte 2)
    await page.selectOption('#medi-guests', '2');
    await page.dispatchEvent('#medi-checkout', 'change');
    let riquadro = await page.locator('#medi-dlg-summary').textContent();
    cheque(riquadro.includes('3 beds free on every night'), 'due ospiti, tre letti liberi: "3 beds free on every night"');
    cheque(await page.locator('#medi-send-req').isEnabled(), 'e il tasto Invia e\' acceso');

    await page.selectOption('#medi-guests', '4');
    await page.dispatchEvent('#medi-guests', 'change');
    riquadro = await page.locator('#medi-dlg-summary').textContent();
    cheque(riquadro.includes('Only 3 beds free') && riquadro.includes('first night short'), 'quattro ospiti: "Only 3 beds free ... first night short"');
    cheque(await page.locator('#medi-send-req').isDisabled(), 'e il tasto Invia si spegne');

    await page.selectOption('#medi-guests', '1');
    await page.fill('#medi-checkin', giorno(1)); await page.fill('#medi-checkout', giorno(2));
    await page.dispatchEvent('#medi-checkout', 'change');
    cheque(await page.locator('#medi-send-req').isEnabled(), 'un ospite, una notte con posti: acceso');

    // una notte senza posti: la maschile e' piena la notte 1
    await page.click('#medi-close-dlg');
    await page.click('[data-book="male"]');
    await page.fill('#medi-checkin', giorno(1)); await page.fill('#medi-checkout', giorno(2));
    await page.dispatchEvent('#medi-checkout', 'change');
    riquadro = await page.locator('#medi-dlg-summary').textContent();
    cheque(riquadro.includes('Not available on these dates') && await page.locator('#medi-send-req').isDisabled(), 'camerata maschile piena: "Not available" e Invia spento');

    // fuori dai giorni che conosciamo: nessuna riga, nessun blocco
    await page.fill('#medi-checkin', giorno(60)); await page.fill('#medi-checkout', giorno(61));
    await page.dispatchEvent('#medi-checkout', 'change');
    riquadro = await page.locator('#medi-dlg-summary').textContent();
    cheque(!riquadro.includes('free on every night') && !riquadro.includes('Not available') && await page.locator('#medi-send-req').isEnabled(), 'date oltre i giorni noti: niente riga, niente blocco');

    // date future scelte restano quando si apre un'altra camera
    await page.fill('#medi-checkin', giorno(9)); await page.fill('#medi-checkout', giorno(11));
    await page.dispatchEvent('#medi-checkout', 'change');
    await page.click('#medi-close-dlg'); await page.click('[data-book="female"]');
    cheque((await page.inputValue('#medi-checkin')) === giorno(9) && (await page.inputValue('#medi-checkout')) === giorno(11), 'date future già scelte restano aprendo un\'altra camera');

    // la richiesta parte e arriva al foglio
    await page.click('#medi-close-dlg');
    await page.click('[data-book="female"]');
    await page.fill('#medi-checkin', giorno(5)); await page.fill('#medi-checkout', giorno(7));
    await page.dispatchEvent('#medi-checkout', 'change');
    await page.fill('#medi-g-name', 'Ana Perez'); await page.fill('#medi-g-email', 'ana@example.com');
    await page.click('#medi-send-req');
    await page.waitForFunction(() => /Request received/.test(document.querySelector('#medi-dlg-title')?.textContent || ''));
    const p = visti.posts[0]; 
    cheque(visti.posts.length === 1 && p.roomId === 'female' && p.checkin === giorno(5) && p.checkout === giorno(7) && p.nights === 2 && p.guestName === 'Ana Perez' && p.total === 120000,
      'la richiesta arriva al foglio con stanza, date, notti, nome e totale');
    await page.click('#medi-send-req');   // dopo il grazie il tasto e' «Close»
    await page.waitForTimeout(300);
    cheque(visti.posts.length === 1 && !(await page.locator('#medi-dlg-title').isVisible()), 'dopo il grazie «Close» chiude e non rimanda niente');
    await ctx.close();
  }

  // 3) il foglio dice di no: la pagina non ringrazia
  {
    const { page, ctx } = await apri(browser, { config: { endpoint: 'https://script.example/exec' }, disp: disponibilidad(), postRisposta: { ok: false, error: 'email' } });
    await page.click('[data-book="twin"]');
    await page.fill('#medi-checkin', giorno(5)); await page.fill('#medi-checkout', giorno(6));
    await page.dispatchEvent('#medi-checkout', 'change');
    await page.fill('#medi-g-name', 'Bo'); await page.fill('#medi-g-email', 'bo@example.com');
    await page.click('#medi-send-req');
    await page.waitForTimeout(800);
    cheque(!/Request received/.test(await page.locator('#medi-dlg-title').textContent()), 'se il foglio rifiuta, la pagina non dice «Request received»');
    await ctx.close();
  }

  // 4) numeri vecchi di due giorni: non ci si fida
  {
    const vecchio = new Date(Date.now() - 48 * 3600000).toISOString();
    const { page, ctx } = await apri(browser, { config: { endpoint: 'https://script.example/exec' }, disp: disponibilidad(vecchio) });
    await page.waitForTimeout(800);
    cheque(await page.locator('#medi-free-mixed').isHidden(), 'numeri di 48 ore fa: nessun cartellino, nessun blocco');
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(falle ? `\n${falle} prove fallite` : '\ntutte le prove passate');
  process.exit(falle ? 1 : 0);
})();
