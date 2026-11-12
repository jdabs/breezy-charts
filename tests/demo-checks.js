// Checks that run inside demo/index.html, the hosted copy. browser.test.js pastes this file into the
// end of the demo's own script, the same way it does with browser-checks.js for the full app.
// The page is opened at #coinbase/BTC-USD/1h, a link to a source the demo does not have.
// Each result is reported as a console line: "TESTRESULT pass|FAIL name [details] END".

window.onerror = m => console.log('TESTRESULT FAIL uncaught error ' + m + ' END');

const T = (name, cond, extra) => console.log('TESTRESULT ' + (cond ? 'pass' : 'FAIL') + ' ' + name + (extra === undefined ? '' : ' ' + JSON.stringify(extra)) + ' END');

// count every request the page makes from here on; the demo should make none
const sent = [], realFetch = window.fetch;
window.fetch = (...a) => { sent.push(String(a[0])); return realFetch(...a); };

(async () => {
  try {
    await sleep(1500);
    T('demo has only the simulated source', Object.keys(providers).join() === 'demo', Object.keys(providers));
    T('a link to a live source opens the demo instead', state.provider === 'demo' && bars.length > 100 && !$('overlay').classList.contains('show'), { provider:state.provider, bars:bars.length });
    T('the source picker is hidden', $('providerSel').hidden && $('providerSel').offsetParent === null);
    T('the header says it is a demo and links to the full app', /Demo/.test(document.querySelector('.demo-tag').textContent) && /github\.com\/jdabs\/breezy-charts/.test(document.querySelector('.get-app').href));
    T('settings has no API key field', $('tdKey').type === 'hidden' && !/key/i.test($('settings').textContent), $('settings').textContent.trim().replace(/\s+/g, ' '));

    location.hash = '#twelvedata/AAPL/1D'; await sleep(1000);
    T('a Twelve Data link is ignored', state.provider === 'demo' && sym() !== 'AAPL');

    setSymbol('ACME'); await sleep(500);
    $('tfGroup').querySelector('[data-tf="5m"]').click(); await sleep(500);
    await loadOlder(); await sleep(6000); // let refreshes and watchlist rounds run
    T('switching symbol and timeframe works', sym() === 'ACME' && state.tf === '5m' && bars.length > 300, { sym:sym(), tf:state.tf, bars:bars.length });
    T('the watchlist shows simulated prices', document.querySelectorAll('#wl .row').length === 4 && [...document.querySelectorAll('#wl .p')].every(p => /\d/.test(p.textContent)));
    T('no network requests are made', sent.length === 0, sent);

    T('done', true);
  } catch (e) { console.log('TESTRESULT FAIL exception ' + String(e && e.stack || e).replace(/\s+/g, ' ') + ' END'); }
})();
