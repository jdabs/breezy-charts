// Checks that run inside the app. browser.test.js pastes this file into the end of the app's own
// script, so everything the app defines (chart, bars, scripts, $, sleep, ...) is in scope here.
// The page is opened at #demo/ACME/5m, so the data is the offline Demo source.
// Each result is reported as a console line: "TESTRESULT pass|FAIL name [details] END".

window.onerror = m => console.log('TESTRESULT FAIL uncaught error ' + m + ' END');
window.confirm = () => true; // "Delete script" asks for confirmation

const T = (name, cond, extra) => console.log('TESTRESULT ' + (cond ? 'pass' : 'FAIL') + ' ' + name + (extra === undefined ? '' : ' ' + JSON.stringify(extra)) + ' END');
const type = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles:true })); };
const seriesOf = key => (indSeries.find(x => x.key === key) || {}).series;
const lastOf = key => seriesOf(key).data().slice(-1)[0];
const sorted = () => bars.every((b, i) => !i || b.time > bars[i-1].time);

(async () => {
  try {
    await sleep(1500);

    /* ---- chart links ---- */
    T('link opens the chart it names', state.provider === 'demo' && sym() === 'ACME' && state.tf === '5m' && bars.length > 100);
    location.hash = '#demo/%3Cimg%20src%3Dx%3E/1h'; await sleep(1500);
    T('link with a bad symbol keeps the current one', sym() === 'ACME' && state.tf === '1h' && document.querySelectorAll('img').length === 0);
    location.hash = '#demo/GLOBX/5M'; await sleep(1500);
    T('link change switches symbol, timeframe is case-insensitive', sym() === 'GLOBX' && state.tf === '5m');
    location.hash = '#demo/ACME/5m'; await sleep(1500);
    T('address bar tracks the chart', location.hash === '#demo/ACME/5m' && sym() === 'ACME');

    /* ---- VWAP sessions ---- */
    const utc = (d, h, m) => Date.UTC(2026, 10, d, h, m) / 1000, bar = (time, p) => ({ time, high:p, low:p, close:p, volume:1 });
    const ny = vwapSession([bar(utc(10, 20, 55), 10), bar(utc(11, 14, 30), 20), bar(utc(11, 14, 35), 30)], 'America/New_York');
    T('VWAP restarts at the New York open', ny.join() === '10,20,25', ny);
    const ut = vwapSession([bar(utc(10, 23, 55), 10), bar(utc(11, 0, 0), 20), bar(utc(11, 0, 5), 30)]);
    T('VWAP restarts at UTC midnight by default', ut.join() === '10,20,25', ut);

    /* ---- older history ---- */
    const n0 = bars.length, first0 = bars[0].time;
    await loadOlder();
    T('older bars are added in front', bars.length === n0 + 300 && bars[0].time < first0 && sorted(), { before:n0, after:bars.length });
    T('main series holds the older bars', mainSeries.data().length === bars.length);
    await sleep(5000);
    T('refresh keeps the older bars', bars.length >= n0 + 300 && bars[0].time < first0 && sorted());

    /* ---- refresh only touches the last bar ---- */
    Object.keys(state.ind).forEach(k => { state.ind[k] = true; }); buildIndicators();
    let adds = 0; const realAdd = chart.addSeries.bind(chart); chart.addSeries = (...a) => { adds++; return realAdd(...a); };
    await sleep(9000);
    const lb = bars[bars.length - 1], ml = mainSeries.data().slice(-1)[0], sm = sma(bars.map(b => b.close), 20);
    T('refresh creates no new series', adds === 0, { adds });
    T('main series follows the last bar', ml.time === lb.time && ml.close === lb.close);
    T('every indicator follows the last bar', indSeries.every(x => { const d = x.series.data(); return d.length && d[d.length-1].time === lb.time; }));
    T('SMA stays correct after refreshes', Math.abs(lastOf('sma20').value - sm[sm.length - 1]) < 1e-9);
    T('RSI and MACD get their own panes', chart.panes().length === 3, chart.panes().length);
    ['ema200', 'bb', 'vwap', 'rsi', 'macd'].forEach(k => { state.ind[k] = false; }); buildIndicators();

    /* ---- scripts: menu ---- */
    T('formula language loaded with the examples', !!FX && scripts.length === 5, scripts.map(x => x.name));
    T('examples are off by default', scripts.every(x => !x.on) && indSeries.every(x => !x.key.startsWith('s:')));
    $('indBtn').click();
    T('menu lists scripts', document.querySelectorAll('#indDrop [data-script]').length === 5 && !!$('newScript'));
    document.querySelectorAll('#indDrop [data-script]').forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles:true })); });
    await sleep(200);
    const errs = scripts.filter(x => scriptInfo[x.id] && scriptInfo[x.id].err).map(x => x.name + ': ' + scriptInfo[x.id].err);
    T('every example runs', errs.length === 0, errs);
    T('examples create their series', indSeries.filter(x => x.key.startsWith('s:')).length === 3 + 3 + 3 + 1 + 4, indSeries.map(x => x.key));
    T('MACD and Stochastic get one pane each', chart.panes().length === 3, chart.panes().length);

    /* ---- scripts: output ---- */
    const closes = bars.map(b => b.close), f = ema(closes, 12), sl = ema(closes, 26), md = lastOf('s:ex0:1');
    T('MACD script matches the built-in maths', Math.abs(md.value - (f[f.length-1] - sl[sl.length-1])) < 1e-9 && md.time === bars[bars.length-1].time);
    T('histogram is coloured bar by bar', seriesOf('s:ex0:0').data().some(d => d.color === '#22ab94') && seriesOf('s:ex0:0').data().some(d => d.color === '#f23645'));
    T('SuperTrend is coloured bar by bar', seriesOf('s:ex3:0').data().some(d => d.color === '#22ab94') && seriesOf('s:ex3:0').data().some(d => d.color === '#f23645'));
    adds = 0; await sleep(9000);
    const c2 = bars.map(b => b.close), f2 = ema(c2, 12), s2 = ema(c2, 26);
    T('refresh with scripts creates no new series', adds === 0, { adds });
    T('script output follows the last bar', Math.abs(lastOf('s:ex0:1').value - (f2[f2.length-1] - s2[s2.length-1])) < 1e-9);

    /* ---- scripts: editor ---- */
    $('indBtn').click(); document.querySelector('[data-edit="ex1"]').click();
    T('editor opens on the script', $('editor').classList.contains('show') && $('edName').value === 'Donchian channel' && /highest\(high/.test($('edSrc').value) && !$('indMenu').classList.contains('open'));
    T('input() makes a number box', document.querySelectorAll('#edInputs input').length === 1 && document.querySelector('#edInputs input').value === '20', $('edInputs').innerHTML);
    T('status says OK', /^OK · drawing 3 series/.test($('edMsg').textContent), $('edMsg').textContent);
    const box = document.querySelector('#edInputs input'); box.value = '5'; box.dispatchEvent(new Event('input', { bubbles:true }));
    await sleep(100);
    T('changing an input redraws the plot', lastOf('s:ex1:0').value === Math.max(...bars.slice(-5).map(b => b.high)) && scripts[1].inputs.Length === 5 && document.querySelector('#edInputs input') === box);
    type($('edSrc'), 'plot(smaa(close, 5))'); await sleep(600);
    T('a mistake shows an error with its line', /Line 1: unknown function "smaa"/.test($('edMsg').textContent) && $('edMsg').classList.contains('err') && !seriesOf('s:ex1:0'), $('edMsg').textContent);
    $('indBtn').click(); T('menu flags the broken script', !!document.querySelector('#indDrop .warn')); $('indBtn').click();
    type($('edSrc'), 'x = close > open ? close : na\nplot(x, "<img src=x onerror=alert(1)>", color=pink)\nhline(240)'); type($('edName'), '<img src=x onerror=alert(2)>'); await sleep(600);
    T('fixing it draws again', /^OK · drawing 2 series/.test($('edMsg').textContent) && !!seriesOf('s:ex1:0') && !!seriesOf('s:ex1:1'), $('edMsg').textContent);
    const gd = seriesOf('s:ex1:0').data();
    T('na leaves points out and breaks the line', gd.length < bars.length && gd.length > 20 && gd.some(d => d.color === 'rgba(0,0,0,0)'), gd.length);
    $('indBtn').click(); updateLegend({ logical: bars.length - 1, seriesData: new Map(indSeries.map(x => [x.series, x.series.data().slice(-1)[0]])) });
    T('names and titles are shown as text, not HTML', document.querySelectorAll('img').length === 0 && $('indDrop').textContent.includes('<img') && $('legend').textContent.includes('<img'));
    $('indBtn').click();
    $('edSrc').focus(); $('edSrc').dispatchEvent(new KeyboardEvent('keydown', { key:'a', bubbles:true }));
    T('typing in the editor does not jump to the symbol box', document.activeElement === $('edSrc'));
    $('edOn').checked = false; $('edOn').onchange({ target:$('edOn') });
    T('Show off hides the script', !seriesOf('s:ex1:0') && /hidden/.test($('edMsg').textContent), $('edMsg').textContent);
    $('edDelete').click();
    T('delete removes the script', scripts.length === 4 && !$('editor').classList.contains('show') && !scripts.some(x => x.id === 'ex1'));
    $('indBtn').click(); $('newScript').click(); await sleep(100);
    const ns = scripts[scripts.length - 1];
    T('new script opens, is on and draws', scripts.length === 5 && ns.on && $('editor').classList.contains('show') && $('edName').value === 'My script' && !!seriesOf('s:' + ns.id + ':0') && /^OK · drawing 1 series/.test($('edMsg').textContent), $('edMsg').textContent);
    T('scripts are saved', JSON.parse(localStorage.getItem('chartdesk.scripts')).length === 5);

    /* ---- scripts: gaps and dots survive refreshes ---- */
    type($('edSrc'), ['avg = sma(close, 20)', 'plot(close > avg ? high : na, "Above", color=pink, width=3)', 'plot(crossover(close, avg) ? low : na, "Buy", color=green, style=dots)', 'plot(crossunder(close, avg) ? high : na, "Sell", color=red, style=dots)'].join('\n'));
    await sleep(600);
    T('gap and dots script runs', !scriptInfo[ns.id].err && scriptInfo[ns.id].plots === 3, scriptInfo[ns.id]);
    adds = 0; await sleep(9000);
    T('gap script rebuilds the chart rarely during refreshes', adds <= 3 * indSeries.length, { adds });

    /* ---- a source that needs a key, with no key ---- */
    $('edClose').click();
    $('providerSel').value = 'twelvedata'; $('providerSel').onchange({ target:$('providerSel') }); await sleep(300);
    T('stocks without a key ask for one', bars.length === 0 && indSeries.length === 0 && $('overlay').classList.contains('show') && /key/i.test($('overlayMsg').textContent));
    $('providerSel').value = 'demo'; $('providerSel').onchange({ target:$('providerSel') }); await sleep(1500);
    T('switching back restores the chart and scripts', bars.length > 100 && indSeries.some(x => x.key.startsWith('s:ex0')) && !$('overlay').classList.contains('show'));

    /* ---- Twelve Data credit budget ---- */
    tdSave([]); tdDayMem = null; store.set('tdDay', null);
    const c1 = await tdAcquire('user'), w1 = await tdAcquire('quotes', 6);
    T('watchlist takes only what the chart has not used or reserved', c1 === 1 && w1 === 5, { c1, w1 });
    let wlWaited = true; tdAcquire('quotes', 6).then(() => { wlWaited = false; });
    await sleep(500);
    T('watchlist waits instead of using the chart reserve', wlWaited);
    await tdAcquire('user'); await tdAcquire('user');
    T('chart can still spend its reserved credits', tdSpent(Date.now()).length === 8);
    tdMem = []; // as after a reload: only the saved log is left
    let chartWaited = true; tdAcquire('user').then(() => { chartWaited = false; });
    await sleep(500);
    T('spent credits survive a reload', JSON.parse(localStorage.getItem('chartdesk.tdLog')).length === 8 && chartWaited);
    tdQueue.length = 0; // forget the requests left waiting above

    /* ---- Twelve Data daily allowance ---- */
    T('credits are counted for the day', tdDayUsed() === 8 && JSON.parse(localStorage.getItem('chartdesk.tdDay')).n === 8 && /^8 \/ 800/.test($('tdDay').textContent), $('tdDay').textContent);
    tdDaySet(640);
    T('warns from 80% of the daily allowance', /640 of 800/.test($('tdDay').textContent) && $('tdDay').style.color.includes('--warn'), $('tdDay').textContent);
    let dayErr = ''; try { tdDayRefused({ code:429, message:'You have run out of API credits for the day. 801 API credits were used, with the current limit being 800.' }); } catch (e) { dayErr = e.message; }
    T('a refusal for the day is reported as the daily limit', /daily limit/.test(dayErr) && tdDayUsed() === 800 && /limit of 800 credits reached/.test($('tdDay').textContent) && $('tdDay').style.color.includes('--down'), dayErr);
    let minErr = ''; try { tdDayRefused({ code:429, message:'You have run out of API credits for the current minute. 15 API credits were used, with the current limit being 8.' }); } catch (e) { minErr = e.message; }
    T('a refusal for the minute is not', minErr === '');
    T('the daily count is hidden for other sources', $('tdDay').style.display === 'none');
    store.set('tdDay', { d:'2000-01-01', n:500 }); tdDayMem = null;
    T('the count starts again on a new day', tdDayUsed() === 0);

    /* ---- Twelve Data credit queue: who goes first ---- */
    const t0 = Date.now(), order = [];
    tdSave([t0 - 60000].concat(Array(7).fill(t0))); // full; one credit comes free in about a second
    tdAcquire('quotes', 3).then(n => order.push('quotes:' + n));
    tdAcquire('refresh').then(() => order.push('refresh'));
    tdAcquire('user').then(() => order.push('user'));
    await sleep(100);
    T('a waiting chart load says so', order.length === 0 && /rate limit/.test($('statusText').textContent), $('statusText').textContent);
    await sleep(1400);
    T('the user gets the first free credit, though asked last', order.join() === 'user', order);
    tdSave(Array(6).fill(Date.now())); tdPump(); await sleep(0);
    T('the background refresh goes next and leaves one credit for the user', order.join() === 'user,refresh' && tdSpent(Date.now()).length === 7, order);
    tdSave(Array(4).fill(Date.now())); tdPump(); await sleep(0);
    T('the watchlist gets what is left over', order.join() === 'user,refresh,quotes:2' && tdQueue.length === 0, order);
    tdSave(Array(8).fill(Date.now()));
    let live = true, gone = ''; tdAcquire('user', 1, () => live).then(() => { gone = 'spent'; }, e => { gone = e.message; });
    live = false; tdPump(); await sleep(0);
    T('a request the user moved on from is dropped unspent', gone === 'CANCELLED' && tdQueue.length === 0 && tdSpent(Date.now()).length === 8, gone);

    /* ---- the app's own requests go through the queue (Twelve Data is faked here) ---- */
    const realFetch = window.fetch, calls = [];
    window.fetch = async u => {
      calls.push(String(u));
      const body = /time_series/.test(u)
        ? { values: Array.from({ length:300 }, (_, i) => ({ datetime: new Date(Date.UTC(2026, 10, 10, 14, 30) + i * 300000).toISOString().slice(0, 19).replace('T', ' '), open:'10', high:'11', low:'9', close:String(10 + i % 5), volume:'100' })) }
        : Object.fromEntries(watch.twelvedata.map(s => [s, { close:'10', percent_change:'1' }]));
      return { ok:true, status:200, json: async () => body };
    };
    settings.tdKey = 'test-key';
    $('providerSel').value = 'twelvedata'; $('providerSel').onchange({ target:$('providerSel') });
    setSymbol('MSFT'); setSymbol('NVDA'); load(false); refreshQuotes();
    await sleep(300);
    const kinds = tdQueue.map(x => x.pri).join();
    T('with no credits free nothing is sent, and only the latest chart and one watchlist round wait', calls.length === 0 && kinds === '0,2', { calls:calls.length, kinds });
    tdSave([]); tdPump(); await sleep(100);
    const ts = calls.filter(u => /time_series/.test(u)), qs = calls.filter(u => /\/quote\?/.test(u));
    T('the chart the user ended on is loaded, the ones skipped past are not', ts.length >= 1 && ts.every(u => /symbol=NVDA&/.test(u)) && sym() === 'NVDA' && bars.length === 300, ts.map(u => u.split('&')[0]));
    T('one watchlist round of three symbols is sent', qs.length === 1 && qs[0].split('symbol=')[1].split('&')[0].split(',').length === 3, qs);
    window.fetch = realFetch; settings.tdKey = ''; tdQueue.length = 0;
    $('providerSel').value = 'demo'; $('providerSel').onchange({ target:$('providerSel') }); await sleep(1500);

    T('done', true);
  } catch (e) { console.log('TESTRESULT FAIL exception ' + String(e && e.stack || e).replace(/\s+/g, ' ') + ' END'); }
})();
