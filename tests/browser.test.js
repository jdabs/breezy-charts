// Runs checks inside the real app in headless Chrome:
//   tests/browser-checks.js inside index.html, the full app, on its offline Demo source;
//   tests/demo-checks.js inside demo/index.html, the hosted demo copy.
// It also checks that demo/index.html is up to date with index.html.
//
//   node tests/browser.test.js
//
// Needs Chrome, Chromium or Edge, and an internet connection (the app loads its charting library
// from a CDN). Set CHROME=/path/to/browser if it is not found. No API key is used. The pages
// themselves are not modified: a copy with the checks pasted into the end of the app's script is
// written to a temporary folder and opened from there.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process'), { pathToFileURL } = require('url');
const { build } = require('../tools/build-demo.js');

const root = path.join(__dirname, '..');
const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
].filter(Boolean);
const browser = candidates.find(p => fs.existsSync(p));
if (!browser) { console.error('No Chrome, Chromium or Edge found. Set CHROME to the browser executable.'); process.exit(2); }

let pass = 0, fail = 0;
const result = (ok, text) => { if (ok) pass++; else { fail++; console.log('FAIL ' + text); } };

// Opens `page` with `checksFile` pasted into the end of its app script, and records the results.
function run(label, page, checksFile, hash){
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const checks = fs.readFileSync(path.join(__dirname, checksFile), 'utf8');
  const end = html.lastIndexOf('})();'); // the close of the app's script, so the checks share its scope
  if (end < 0) { result(false, `${label}: could not find the end of the app script in ${page}`); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'breezycharts-test-'));
  let out = '';
  try {
    fs.writeFileSync(path.join(tmp, 'index.html'), html.slice(0, end) + '\n' + checks + '\n' + html.slice(end));
    const r = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + path.join(tmp, 'profile'), '--window-size=1280,800',
      '--enable-logging=stderr', '--virtual-time-budget=120000', // page timers run on a fast virtual clock
      '--screenshot=' + path.join(tmp, 'shot.png'),
      pathToFileURL(path.join(tmp, 'index.html')).href + hash,
    ], { encoding:'utf8', timeout:300000 });
    out = (r.stderr || '') + (r.stdout || '');
    if (r.error) console.error('Browser did not run: ' + r.error.message);
  } finally {
    try { fs.rmSync(tmp, { recursive:true, force:true, maxRetries:5, retryDelay:200 }); } catch { /* the browser may still hold the profile briefly */ }
  }
  let done = false, seen = 0;
  for (const m of out.matchAll(/TESTRESULT (pass|FAIL) (.*?) END/g)) {
    const text = m[2].replace(/\\"/g, '"'); seen++;
    if (m[1] === 'pass' && text === 'done') { done = true; continue; }
    result(m[1] === 'pass', label + ': ' + text);
  }
  if (!done) result(false, `${label}: the checks did not run to the end` + (seen <= 1 ? ' (did the page load? is there an internet connection?)' : ''));
}

let demoBuilt = '';
try { demoBuilt = build(fs.readFileSync(path.join(root, 'index.html'), 'utf8')); } catch (e) { result(false, 'demo build: ' + e.message); }
let demoFile = ''; try { demoFile = fs.readFileSync(path.join(root, 'demo', 'index.html'), 'utf8'); } catch { /* reported below */ }
const sameText = (a, b) => a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
result(!!demoBuilt && sameText(demoBuilt, demoFile), 'demo/index.html is out of date with index.html; run: node tools/build-demo.js');

run('app', 'index.html', 'browser-checks.js', '#demo/ACME/5m');
run('demo', 'demo/index.html', 'demo-checks.js', '#coinbase/BTC-USD/1h');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
