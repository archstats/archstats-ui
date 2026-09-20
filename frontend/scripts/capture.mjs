// Screenshots hash routes of the running app through headless Chrome (CDP, no deps).
// Usage: node scripts/capture.mjs --out DIR [--routes name=/path,name2=/path2] [--scheme light|dark|both]
//        [--workspace NAME] [--size 1440x900] [--wait MS]
// Defaults: the 12 primary views, both schemes, workspace eai-3540597-qp-common.
// Requires `wails dev` to be running (see scripts/dev-check.mjs).
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith("--") ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : "true"] : []).filter(Boolean));
const out = args.out ?? ".impeccable/review/captures";
const [W, H] = (args.size ?? "1440x900").split("x").map(Number);
const workspace = args.workspace ?? "eai-3540597-qp-common";
const waitMs = Number(args.wait ?? 2500);
const schemes = args.scheme === "both" || !args.scheme ? ["light", "dark"] : [args.scheme];
const DEFAULT_ROUTES = [
  ["dashboard", "/"],
  ["metrics", "/views/metrics"],
  ["hotspots", "/views/components/hotspots"],
  ["cycles", "/views/components/cycles"],
  ["matrix", "/views/components/matrix"],
  ["chord", "/views/components/chord"],
  ["clustering", "/views/components/clustering"],
  ["git-coupling", "/views/git/coupling"],
  ["authors", "/views/git/authors"],
  ["activity", "/views/git/activity"],
  ["files-dependencies", "/views/files/dependencies"],
  ["java-classes", "/views/java/classes"],
];
const routes = args.routes ? args.routes.split(",").map((p) => { const i = p.indexOf("="); return [p.slice(0, i), p.slice(i + 1)]; }) : DEFAULT_ROUTES;
mkdirSync(out, { recursive: true });

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(scheme) {
  const port = 9400 + Math.floor(Math.random() * 100);
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${port}`, `--window-size=${W},${H}`,
    `--user-data-dir=/tmp/archstats-capture-${port}-${Date.now()}`, "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); target = l.find((t) => t.type === "page"); } catch {}
    if (!target) await sleep(250);
  }
  if (!target) { chrome.kill(); throw new Error("headless Chrome did not start"); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

  await send("Page.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await send("Page.navigate", { url: "http://localhost:34115/" });

  // Wait for the app, select the workspace, wait for its data.
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    ready = await evaluate(`(() => {
      const n = document.getElementById('__nuxt'); if (!n || !n.__vue_app__) return false;
      const p = n.__vue_app__.config.globalProperties.$pinia; const ws = p._s.get('workspaces'); const d = p._s.get('data');
      if (ws && ws.workspaces.length && ws.active?.name !== ${JSON.stringify(workspace)}) {
        const t = ws.workspaces.find(x => x.name === ${JSON.stringify(workspace)}); if (t) ws.select(t.id); return false; }
      return !!(ws && ws.loaded && d.hasData);
    })()`).catch(() => false);
    if (!ready) await sleep(500);
  }
  if (!ready) console.warn(`warning: workspace "${workspace}" did not load; capturing anyway`);
  await sleep(1000);

  for (const [name, route] of routes) {
    await evaluate(`(() => { location.hash = '#${route}'; return true; })()`);
    await sleep(/chord|clustering|dependencies|classes/.test(route) ? waitMs + 1500 : waitMs);
    const r = await send("Page.captureScreenshot", { format: "png" });
    const file = join(out, `${name}${scheme === "dark" ? "-dark" : ""}.png`);
    writeFileSync(file, Buffer.from(r.result.data, "base64"));
    console.log("wrote", file);
  }
  ws.close(); chrome.kill();
}

for (const scheme of schemes) await session(scheme);
