// Tests for the formula language. No dependencies:
//
//   node tests/formula.test.js
//
// Averages, RSI, MACD and Bollinger are checked against the reference implementations below,
// which are the ones the app uses for its built-in indicators.
'use strict';
// The language is the <script id="formula"> block of index.html. It has no dependencies, so it is
// taken out of the page and run here on its own; given a `module`, it exports itself to it.
const F = (() => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const m = /<script id="formula">([^]*?)<[/]script>/.exec(html);
  if (!m) { console.error('Could not find <script id="formula"> in index.html.'); process.exit(2); }
  const mod = { exports:{} };
  new Function('module', m[1])(mod);
  return mod.exports;
})();
let pass = 0, failn = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { failn++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } };
const close2 = (a, b) => a.length === b.length && a.every((x, i) => (x !== x && (b[i] == null || b[i] !== b[i])) || Math.abs(x - b[i]) < 1e-9);

// deterministic bars
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const bars = []; let p = 100;
for (let i = 0; i < 400; i++) { const o = p, c = Math.max(1, o * (1 + (rnd() - 0.5) * 0.04)), h = Math.max(o, c) * (1 + rnd() * 0.01), l = Math.min(o, c) * (1 - rnd() * 0.01); bars.push({ time: 1700000000 + i * 3600, open: o, high: h, low: l, close: c, volume: Math.round(1000 + rnd() * 5000) }); p = c; }
const closes = bars.map(b => b.close);

// reference implementations copied from the app
function sma(vals, n){ const out = new Array(vals.length).fill(null); let s = 0; for (let i=0;i<vals.length;i++){ s += vals[i]; if (i>=n) s -= vals[i-n]; if (i>=n-1) out[i] = s/n; } return out; }
function ema(vals, n){ const out = new Array(vals.length).fill(null), k = 2/(n+1); let e = null, s = 0;
  for (let i=0;i<vals.length;i++){ if (i < n) { s += vals[i]; if (i === n-1) { e = s/n; out[i] = e; } } else { e = vals[i]*k + e*(1-k); out[i] = e; } } return out; }
function rsi(vals, n=14){ const out = new Array(vals.length).fill(null); let g=0,l=0;
  for (let i=1;i<vals.length;i++){ const d = vals[i]-vals[i-1], up = Math.max(d,0), dn = Math.max(-d,0);
    if (i <= n) { g += up; l += dn; if (i === n) { g/=n; l/=n; out[i] = l === 0 ? 100 : 100 - 100/(1+g/l); } }
    else { g = (g*(n-1)+up)/n; l = (l*(n-1)+dn)/n; out[i] = l === 0 ? 100 : 100 - 100/(1+g/l); } } return out; }

const run = (src, inputs, b) => F.compile(src).run(b || bars, inputs || {});
const val = (src, b) => run(`plot(${src})`, null, b).plots[0].values;
const err = src => { try { run(src); return null; } catch (e) { return e instanceof F.FormulaError ? e.message : 'NOT FormulaError: ' + e; } };

ok('sma', close2(val('sma(close, 20)'), sma(closes, 20)));
ok('ema', close2(val('ema(close, 26)'), ema(closes, 26)));
ok('rsi', close2(val('rsi(close, 14)'), rsi(closes, 14)));
// MACD matches the app's
{ const f = ema(closes,12), s = ema(closes,26), m = f.map((v,i)=> v==null||s[i]==null?NaN:v-s[i]); ok('macd', close2(val('ema(close,12) - ema(close,26)'), m)); }
// bollinger upper
{ const m = sma(closes,20); const sd = closes.map((_, i) => { if (m[i] == null) return NaN; let s = 0; for (let j=i-19;j<=i;j++) s += (closes[j]-m[i])**2; return Math.sqrt(s/20); });
  ok('bb upper', close2(val('sma(close,20) + 2*stdev(close,20)'), m.map((v,i)=> v==null?NaN:v+2*sd[i]))); }
ok('arith precedence', val('1 + 2 * 3 - 4 / 2')[0] === 5);
ok('unary/paren', val('-(2 + 3) * 2')[5] === -10);
ok('mod', val('7 % 4')[0] === 3);
ok('div zero is na', Number.isNaN(val('1 / 0')[0]));
ok('history', (() => { const v = val('close[1]'); return Number.isNaN(v[0]) && v[5] === closes[4]; })());
ok('change', Math.abs(val('change(close)')[7] - (closes[7] - closes[6])) < 1e-12);
ok('highest', val('highest(high, 5)')[10] === Math.max(...bars.slice(6, 11).map(b => b.high)));
ok('lowest', val('lowest(low, 5)')[10] === Math.min(...bars.slice(6, 11).map(b => b.low)));
ok('compare', (() => { const v = val('close > open'); return v.every((x, i) => x === +(bars[i].close > bars[i].open)); })());
ok('and/or/not', val('not (1 > 2) and (3 > 2 or 0)')[0] === 1 && val('!(1 > 2) && (0 || 0)')[0] === 0);
ok('ternary series', (() => { const v = val('close > open ? high : low'); return v.every((x, i) => x === (bars[i].close > bars[i].open ? bars[i].high : bars[i].low)); })());
ok('ternary na false', val('na ? 1 : 2')[0] === 2);
ok('crossover', (() => { const v = val('crossover(close, sma(close, 10))'), m = sma(closes, 10); let n = 0; for (let i = 10; i < 400; i++) { const e = +(closes[i] > m[i] && closes[i-1] <= m[i-1]); if (v[i] !== e) return false; n += e; } return n > 3; })());
ok('max/min/avg', val('max(1, 5, 3)')[0] === 5 && val('min(4, 2, 9)')[0] === 2 && val('avg(2, 4)')[0] === 3);
ok('nz/na', val('nz(sma(close, 5))')[0] === 0 && val('na(sma(close, 5))')[0] === 1 && val('na(sma(close, 5))')[10] === 0);
ok('hl2', Math.abs(val('hl2')[3] - (bars[3].high + bars[3].low) / 2) < 1e-12);
ok('atr positive', val('atr(14)').slice(20).every(x => x > 0));
ok('tr', Math.abs(val('tr')[5] - Math.max(bars[5].high - bars[5].low, Math.abs(bars[5].high - bars[4].close), Math.abs(bars[5].low - bars[4].close))) < 1e-12);
ok('supertrend sides', (() => { const v = val('supertrend(3, 10)'); let above = 0, below = 0; for (let i = 20; i < 400; i++) { if (!(v[i] === v[i])) return false; if (v[i] > closes[i]) above++; else below++; } return above > 10 && below > 10; })());
ok('sar sides', (() => { const v = val('sar()'); let above = 0, below = 0; for (let i = 2; i < 400; i++) { if (!(v[i] === v[i])) return false; if (v[i] >= bars[i].high) above++; else if (v[i] <= bars[i].low) below++; else return false; } return above > 10 && below > 10; })(), 'sar must never sit inside the bar');
ok('stoch range', val('stoch(close, high, low, 14)').slice(14).every(x => x >= 0 && x <= 100));
ok('linreg of line', Math.abs(val('linreg(bar_index * 2 + 1, 10)')[50] - 101) < 1e-9);
ok('wma', Math.abs(val('wma(close, 3)')[10] - (closes[8] + 2 * closes[9] + 3 * closes[10]) / 6) < 1e-9);
ok('cum', Math.abs(val('cum(volume)')[2] - (bars[0].volume + bars[1].volume + bars[2].volume)) < 1e-9);
ok('barssince/valuewhen', (() => { const a = val('barssince(close > open)'), b = val('valuewhen(close > open, close)'); let k = NaN, v = NaN; return bars.every((x, i) => { if (x.close > x.open) { k = 0; v = x.close; } else k = k + 1; return (a[i] === k || (a[i] !== a[i] && k !== k)) && (b[i] === v || (b[i] !== b[i] && v !== v)); }); })());
ok('vwap utc', (() => { const v = val('vwap'); return v.every(x => x > 0); })());
ok('vwap session', (() => { const r = F.compile('plot(vwap)').run(bars, {}, { sessionKey: () => 'same' }); const tp = b => (b.high + b.low + b.close) / 3; let pv = 0, vv = 0; bars.forEach(b => { pv += tp(b) * b.volume; vv += b.volume; }); return Math.abs(r.plots[0].values[399] - pv / vv) < 1e-9; })());

// outputs
{ const r = run(`len = input(14, "Length", min=2, max=50)
r = rsi(close, len)
plot(r, "RSI", color=purple, pane=below)
hline(70)
hline(30, color="#0f0")
plot(close, style=area, width=9)`);
  ok('plots count', r.plots.length === 4, r.plots.map(q => q.title));
  ok('plot fields', r.plots[0].title === 'RSI' && r.plots[0].color === '#b07cff' && r.plots[0].pane === 'below' && r.plots[0].style === 'line');
  ok('hline follows pane', r.plots[1].hline && r.plots[1].pane === 'below' && r.plots[1].values[0] === 70 && r.plots[1].style === 'dashed');
  ok('hex colour', r.plots[2].color === '#00ff00');
  ok('defaults', r.plots[3].pane === 'main' && r.plots[3].style === 'area' && r.plots[3].width === 4 && /^#/.test(r.plots[3].color));
  ok('input', r.inputs.length === 1 && r.inputs[0].key === 'Length' && r.inputs[0].value === 14 && r.inputs[0].min === 2);
  const r2 = run('len = input(14, "Length", min=2, max=50)\nplot(sma(close, len))', { Length: 5 });
  ok('input override', close2(r2.plots[0].values, sma(closes, 5)));
  const r3 = run('len = input(14, "Length", min=2, max=50)\nplot(sma(close, len))', { Length: 500 });
  ok('input clamp', r3.inputs[0].value === 50);
  const r4 = run('len = input(14, "Length")\nplot(sma(close, len))', { Length: 'x', __proto__: { evil: 1 } });
  ok('input bad value', r4.inputs[0].value === 14);
}
{ const r = run('h = close - open\nplot(h, color = h >= 0 ? green : red, style=histogram, pane=below)'); const c = r.plots[0].color;
  ok('colour series', Array.isArray(c) && c.every((x, i) => x === (bars[i].close - bars[i].open >= 0 ? '#22ab94' : '#f23645'))); }
{ const r = run('plot(close, color = close > open ? green : na)'); ok('colour with na', r.plots[0].color.some(x => x === null) && r.plots[0].color.some(x => x === '#22ab94')); }
ok('multi-line call', run('plot(\n  sma(close,\n      10),\n  "A"\n)').plots[0].title === 'A');
ok('comments', run('// hi\nx = 1 // one\nplot(x)').plots[0].values[0] === 1);
ok('shadow word', run('line = sma(close, 5)\nplot(line)').plots.length === 1);
ok('empty', run('').plots.length === 0 && run('\n\n// nothing\n').plots.length === 0);
ok('zero bars', run('plot(rsi(close, 14))\nplot(sar())\nplot(supertrend(3,10))', null, []).plots.length === 3);
ok('one bar', run('plot(rsi(close, 14))\nplot(sar())\nplot(supertrend(3,10))\nplot(sma(close,20))', null, bars.slice(0, 1)).plots.length === 4);

// errors: must all be FormulaError with a line number and readable text
const E = [
  ['plot(smaa(close, 5))', /Line 1: unknown function "smaa"/],
  ['x = 1\ny = foo + 1', /Line 2: unknown name "foo"/],
  ['plot(sma)', /"sma" is a function/],
  ['plot(sma(close))', /sma\(\) needs length/],
  ['plot(sma(close, close))', /must be a single whole number, not a series/],
  ['plot(sma(close, 0))', /between 1 and 5000/],
  ['plot(sma(close, 99999))', /between 1 and 5000/],
  ['plot(close, color=banana)', /unknown name "banana"/],
  ['plot(close, color="banana")', /is not a colour/],
  ['plot(close, colour=red)', /no setting called "colour"/],
  ['plot(close, style=main)', /must be one of: line, dashed/],
  ['plot(red + 1)', /needs numbers/],
  ['plot(close > open ? red : 5)', /same kind of value/],
  ['x = (1 + 2', /expected "\)"/],
  ['x = 1 +', /unexpected the end of the line/],
  ['x = 1 2', /unexpected 2/],
  ['close = 5', /built in and cannot be reassigned/],
  ['x = "abc', /closing quote/],
  ['x = 1 $ 2', /unexpected character "\$"/],
  ['plot(close[-1])', /whole number of bars back/],
  ['plot(close[1.5])', /whole number of bars back/],
  ['plot(close[open])', /whole number of bars back/],
  ['a = input(5, "A")\nb = input(6, "A")', /Line 2: two inputs are both called "A"/],
  ['plot(close, "t", red, 1, line, main, 7)', /takes at most 6 values/],
  ['plot(close, "a", title="b")', /"title" is given twice/],
  ['plot(max(1))', /at least two values/],
  ['plot(constructor)', /unknown name "constructor"/],
  ['plot(toString(1))', /unknown function "toString"/],
  ['plot(__proto__)', /unknown name "__proto__"/],
  ['x = hasOwnProperty', /unknown name/],
  ['plot(close(1))', /"close" is a value, not a function/],
  ['hline(close)', /must be a single number, not a series/],
  ['input(close)', /single number/],
];
E.forEach(([src, re]) => { const m = err(src); ok('error: ' + src.replace(/\n/g, ' / '), m && re.test(m), m); });

// limits
ok('deep nesting', /nested/.test(err('x = ' + '('.repeat(5000) + '1' + ')'.repeat(5000)) || ''), err('x = ' + '('.repeat(200) + '1' + ')'.repeat(200)));
ok('deep unary', /nested/.test(err('x = ' + '-'.repeat(5000) + '1') || ''));
ok('long chain', /too long/.test(err('x = 1' + ' + 1'.repeat(4500)) || ''));
ok('too long source', /too long/.test(err('// ' + 'a'.repeat(20001)) || ''));
ok('too many plots', /at most 32/.test(err(new Array(34).fill('plot(close)').join('\n')) || ''));
{ const big = []; for (let i = 0; i < 20000; i++) big.push(bars[i % 400]); const t = Date.now(); let m = null;
  try { F.compile(new Array(300).fill('x = sma(close, 5000)').join('\n')).run(big); } catch (e) { m = e.message; }
  ok('work budget', /too much work/.test(m || ''), m); ok('work budget fast', Date.now() - t < 5000, Date.now() - t); }
ok('1000 bars speed', (() => { const big = []; for (let i = 0; i < 3000; i++) big.push(bars[i % 400]); const t = Date.now(); F.compile('plot(ema(close,12)-ema(close,26))\nplot(sma(close,200))\nplot(rsi(close,14))\nplot(supertrend(3,10))\nplot(stdev(close,20))').run(big); return Date.now() - t < 1000; })());
ok('reference', F.reference.length > 30 && F.reference.every(r => r.group && r.sig && r.doc));
ok('bars not mutated', bars[0].close === closes[0] && bars.length === 400);

console.log(`${pass} passed, ${failn} failed`);
process.exit(failn ? 1 : 0);
