// Every figure the app can put in a report, rendered the way a report takes
// it: each view that draws a chart is opened on a real snapshot, and every
// figure it registers is exported as PNG in both appearances through
// utils/figure.ts, whose own checks refuse a figure with no size, nothing
// drawn, a blank image or a dark light rendering. Tables must have rows or
// say why not. Exits 1 when anything fails, so it can gate a release.
//
// Usage: node scripts/figure-check.mjs [--workspace NAME] [--routes name=/path,...] [--scheme dark|light]
// Requires `wails dev` to be running (see scripts/dev-check.mjs). Read-only: nothing is saved.
import { spawn } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"] : []).filter(Boolean));
const scheme = args.scheme === "light" ? "light" : "dark";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The views that draw figures. A route that registers none fails: a chart view that stops
// handing over its figure is what this guards against.
const DEFAULT_ROUTES = [
  ["connections graph", "/views/connections?level=components"],
  ["connections chord", "/views/connections?rep=chord"],
  ["hotspots", "/views/components/hotspots"],
  ["cycles", "/views/components/cycles"],
  ["plotter", "/views/components/plotter"],
  ["activity", "/views/git/activity"],
  ["effort", "/views/git/activity?tab=effort"],
];
const routes = args.routes ? args.routes.split(",").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }) : DEFAULT_ROUTES;

const port = 9500 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${port}`, "--window-size=1500,950", `--user-data-dir=/tmp/archstats-figcheck-${port}-${Date.now()}`, "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
  if (!target) await sleep(250);
}
if (!target) { chrome.kill(); console.error("headless Chrome did not start"); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "evaluation failed");
  return r.result?.result?.value;
};

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
await send("Page.navigate", { url: "http://localhost:34115/" });

// The app, then the workspace (the one asked for, else the first), then its data.
let chosen = null;
for (let i = 0; i < 120 && !chosen; i++) {
  chosen = await evaluate(`(() => {
    const n = document.getElementById('__nuxt'); if (!n || !n.__vue_app__) return null;
    const p = n.__vue_app__.config.globalProperties.$pinia; const w = p._s.get('workspaces'); const d = p._s.get('data');
    if (!w || !w.workspaces.length) return null;
    const want = ${JSON.stringify(args.workspace ?? "")};
    const t = (want && w.workspaces.find(x => x.name === want)) || w.active || w.workspaces[0];
    if (w.active?.id !== t.id) { if (!window.__sel) { window.__sel = true; w.select(t.id).finally(() => { window.__sel = false; }); } return null; }
    return d.hasData ? t.name : null;
  })()`).catch(() => null);
  if (!chosen) await sleep(500);
}
if (!chosen) { console.error("no workspace with data loaded"); ws.close(); chrome.kill(); process.exit(2); }
console.log(`Workspace ${chosen}, ${scheme} appearance\n`);

const CHECK = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const list = window.__archstatsExportables, fig = window.__archstatsFigure;
  if (!list || !fig) throw new Error("the app exposes no figure hooks: is this a dev build?");
  // Drawn and settled: every figure ready, then a moment for layouts that keep moving.
  for (let i = 0; i < 60; i++) { const f = list().filter(x => x.kind === "figure"); if (f.length && f.every(x => x.ready())) break; await sleep(250); }
  await sleep(1500);
  const out = [];
  for (const item of list()) {
    if (item.kind === "figure") {
      for (const light of [true, false]) {
        const row = { kind: "figure", title: item.title, light };
        try {
          const f = await item.render({ light });
          if (!f) throw new Error("render returned nothing");
          const png = await fig.pngBase64(f, "figure check", { light });
          const img = new Image(); img.src = "data:image/png;base64," + png; await img.decode();
          row.size = img.width + "x" + img.height;
          if (f.kind === "svg") fig.svgDocument(f, "figure check", { light });
        } catch (e) { row.error = e && e.message ? e.message : String(e); }
        out.push(row);
      }
    } else if (item.kind === "table") {
      const why = item.disabledReason ? item.disabledReason() : null;
      const rows = why ? 0 : item.rows().length;
      out.push({ kind: "table", title: item.title, rows, why, error: !why && rows === 0 ? "no rows and no reason given" : undefined });
    }
  }
  return out;
})()`;

let failures = 0;
for (const [name, route] of routes) {
  await evaluate(`(() => { location.hash = ${JSON.stringify("#" + route)}; return true; })()`);
  await sleep(1200);
  let rows;
  try { rows = await evaluate(CHECK); } catch (e) { rows = [{ kind: "page", title: name, error: e.message }]; }
  const figures = rows.filter((r) => r.kind === "figure");
  if (!figures.length && !rows.some((r) => r.kind === "page")) rows.push({ kind: "figure", title: "(none registered)", error: "this view draws a chart but hands over no figure" });
  console.log(`${name}  ${route}`);
  for (const r of rows) {
    const bad = !!r.error;
    if (bad) failures++;
    const what = r.kind === "figure" ? `${r.light ? "light" : "as shown"}${r.size ? `  ${r.size}` : ""}` : r.kind === "table" ? (r.why ? `none: ${r.why}` : `${r.rows} rows`) : "";
    console.log(`  ${bad ? "FAIL" : "ok  "}  ${r.kind.padEnd(6)} ${r.title}  ${what}${bad ? `\n          ${r.error}` : ""}`);
  }
}
ws.close(); chrome.kill();
console.log(failures ? `\n${failures} failed.` : "\nEvery figure and table can go into a report.");
process.exit(failures ? 1 : 0);
