// Runs tests/browser-checks.js inside the real app in headless Chrome.
//
//   node tests/browser.test.js
//
// Needs Chrome, Chromium or Edge, and an internet connection (the app loads its charting library
// from a CDN). Set CHROME=/path/to/browser if it is not found. Prices come from the app's offline
// Demo source, so no API key is used. The app itself is not modified: a copy with the checks
// pasted into the end of its script is written to a temporary folder and opened from there.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process'), { pathToFileURL } = require('url');

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

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const checks = fs.readFileSync(path.join(__dirname, 'browser-checks.js'), 'utf8');
const end = html.lastIndexOf('})();'); // the close of the app's script, so the checks share its scope
if (end < 0) { console.error('Could not find the end of the app script in index.html.'); process.exit(2); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'breezycharts-test-'));
let out = '';
try {
  fs.writeFileSync(path.join(tmp, 'index.html'), html.slice(0, end) + '\n' + checks + '\n' + html.slice(end));
  const r = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + path.join(tmp, 'profile'), '--window-size=1280,800',
    '--enable-logging=stderr', '--virtual-time-budget=120000', // page timers run on a fast virtual clock
    '--screenshot=' + path.join(tmp, 'shot.png'),
    pathToFileURL(path.join(tmp, 'index.html')).href + '#demo/ACME/5m',
  ], { encoding:'utf8', timeout:300000 });
  out = (r.stderr || '') + (r.stdout || '');
  if (r.error) console.error('Browser did not run: ' + r.error.message);
} finally {
  try { fs.rmSync(tmp, { recursive:true, force:true, maxRetries:5, retryDelay:200 }); } catch { /* the browser may still hold the profile briefly */ }
}

let pass = 0, fail = 0, done = false;
for (const m of out.matchAll(/TESTRESULT (pass|FAIL) (.*?) END/g)) {
  const text = m[2].replace(/\\"/g, '"');
  if (m[1] === 'pass') { pass++; if (text === 'done') { done = true; pass--; } }
  else { fail++; console.log('FAIL ' + text); }
}
if (!done) { fail++; console.log('FAIL the checks did not run to the end' + (pass + fail === 1 ? ' (did the page load? is there an internet connection?)' : '')); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
