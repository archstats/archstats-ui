// What the running app costs, measured in the running app.
//
// The third of the three benches. `engine.bench.ts` measures the work before
// the pixels and needs no browser; this one drives the real view in headless
// Chrome, turns on the stopwatch the app already carries (src/utils/perf.ts),
// and reports where a frame goes.
//
// Usage: node bench/frames.mjs [--workspace NAME] [--route /views/connections]
//        [--settle 12000] [--size 1600x1000] [--label before]
// Requires `wails dev` to be running.
//
// What it reports, and why each number is here:
//   nodes / links        the size of the problem, so a faster run cannot be
//                        a smaller one without saying so
//   graph.tick           the layout frame: called for seconds, so its mean is
//                        the frame budget and its max is the visible stutter
//   graph.drawHulls      hulls redrawn per frame
//   graph.suggestionLabels  group labels repositioned per frame
//   graph.rebuild        one-off, on every data change
//   graph.restyle        every hover and every selection
//   hover p50/p95        the interaction the architect does most

import { spawn } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"] : []).filter(Boolean));
const workspace = args.workspace ?? null;
const route = args.route ?? "/views/connections";
const settle = Number(args.settle ?? 12000);
const label = args.label ?? "";
const [W, H] = (args.size ?? "1600x1000").split("x").map(Number);

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const port = 9500 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
  `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
  `--user-data-dir=/tmp/archstats-frames-${port}-${Date.now()}`, "about:blank",
], { stdio: "ignore" });

let target;
for (let i = 0; i < 40 && !target; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find(t => t.type === "page"); } catch { /* not up yet */ }
  if (!target) await sleep(250);
}
if (!target) { chrome.kill(); throw new Error("headless Chrome did not start"); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = m => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
// The stopwatch reads this before the app boots, so it is on for the first frame.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("archstats:perf", "1") } catch {}` });
await send("Page.navigate", { url: "http://localhost:34115/" });

// A bench that silently measured the wrong workspace would be worse than no
// bench, so the name it settled on is reported with the numbers.
let ready = false;
for (let i = 0; i < 80 && !ready; i++) {
  ready = await evaluate(`(() => {
    const n = document.getElementById('__nuxt'); if (!n || !n.__vue_app__) return false;
    const p = n.__vue_app__.config.globalProperties.$pinia; const ws = p._s.get('workspaces'); const d = p._s.get('data');
    if (!ws || !ws.workspaces.length) return false;
    const want = ${JSON.stringify(args.workspace ?? null)};
    const target = want ? ws.workspaces.find(x => x.name === want) : (ws.active ?? ws.workspaces[0]);
    if (!target) return "missing";
    if (ws.active?.id !== target.id) { ws.select(target.id); return false; }
    return !!(ws.loaded && d.hasData);
  })()`).catch(() => false);
  if (ready === "missing") {
    const names = await evaluate(`JSON.stringify(document.getElementById('__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('workspaces').workspaces.map(w => w.name))`);
    ws.close(); chrome.kill();
    throw new Error(`no workspace named "${args.workspace}". Available: ${names}`);
  }
  if (!ready) await sleep(500);
}
if (!ready) { ws.close(); chrome.kill(); throw new Error("the app did not finish loading — is `wails dev` running?"); }
const loaded = await evaluate(`document.getElementById('__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('workspaces').active?.name ?? "?"`);
await sleep(800);

// ── The measured run ─────────────────────────────────────────────────────
//
// The frame sampler starts with the view, not after it. Sampling once the
// layout has settled measures an idle page, and whether it caught a settled
// one or a moving one varied by seconds between runs — which made the same
// build look twice as fast as itself. These are the first 150 frames after
// the view opens: the seconds the architect actually waits through.
await evaluate(`(() => {
  window.__perf?.on(); window.__perf?.reset();
  window.__gaps = []; 
  let last = performance.now(); let n = 0;
  const step = () => { const t = performance.now(); window.__gaps.push(t - last); last = t;
    if (++n < 150) requestAnimationFrame(step); };
  location.hash = '#${route}';
  requestAnimationFrame(step);
  return true;
})()`);
await sleep(settle);
const frames = (await evaluate(`JSON.stringify(window.__gaps ?? [])`).then(s => JSON.parse(s || "[]"))).slice(1);

// The interaction that happens most: moving the pointer over the graph.
const hover = await evaluate(`(async () => {
  const svg = document.querySelector('svg');
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  const times = [];
  for (let i = 0; i < 24; i++) {
    const x = box.left + box.width * (0.2 + 0.6 * (i / 24));
    const y = box.top + box.height * (0.3 + 0.4 * Math.abs(Math.sin(i)));
    const el = document.elementFromPoint(x, y);
    const t = performance.now();
    el?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
    el?.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    await new Promise(r => requestAnimationFrame(r));
    times.push(performance.now() - t);
  }
  return times;
})()`);

const stats = await evaluate(`JSON.stringify(window.__perf?.read() ?? [])`);
ws.close(); chrome.kill();

// ── Report ───────────────────────────────────────────────────────────────
const rows = JSON.parse(stats || "[]");
const pick = name => rows.find(r => r.name === name);
const quantile = (xs, q) => { if (!xs?.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const ms = n => `${n.toFixed(1)}ms`;

const sizes = rows.filter(r => r.total === 0);
const timed = rows.filter(r => r.total > 0);

console.log(`
frames${label ? ` · ${label}` : ""}   ${route}   ${loaded}   ${W}x${H}   settled ${settle}ms
${sizes.map(r => `  ${r.name.padEnd(26)} ${r.max}`).join("\n") || "  (no sizes reported)"}

  routine                      calls        total         mean          max
${timed.map(r => `  ${r.name.padEnd(26)} ${String(r.count).padStart(6)} ${ms(r.total).padStart(12)} ${ms(r.mean).padStart(12)} ${ms(r.max).padStart(12)}`).join("\n")}

  frame gap (first 150, from open)  p50 ${ms(quantile(frames, 0.5))}   p95 ${ms(quantile(frames, 0.95))}   worst ${ms(Math.max(...(frames ?? [0])))}
  hover→frame                      p50 ${ms(quantile(hover, 0.5))}   p95 ${ms(quantile(hover, 0.95))}   worst ${ms(Math.max(...(hover ?? [0])))}
`);

// A tick is one frame's share of a 60Hz budget; the rest of the frame still
// has to paint. Said out loud so the reader does not have to do the division.
const tick = pick("graph.tick");
if (tick) {
  const share = (tick.mean / 16.7) * 100;
  console.log(`  graph.tick is ${share.toFixed(0)}% of a 60Hz frame budget before the browser paints anything.\n`);
}
