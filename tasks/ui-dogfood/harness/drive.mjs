// Drive the Archstats app like a person: one persistent headless browser per
// session, real mouse and keyboard input, screenshots, and a numbered list of
// what is on screen. There is deliberately no way to run JavaScript in the
// page or query the snapshot: the UI is the only way in.
//
//   node drive.mjs <session> start              open the app in the scenario's workspace
//   (env DRIVE_URL, default http://localhost:4103/; DRIVE_WORKSPACE, the workspace name to select)
//   node drive.mjs <session> look               visible text + numbered controls (with their hover tooltips)
//   node drive.mjs <session> text [maxChars]    all text of the main area (scrolled content too)
//   node drive.mjs <session> click <n|"label">  click control n from the last look, or by its label
//   node drive.mjs <session> dblclick <n|"label">
//   node drive.mjs <session> clickxy <x> <y>    click a point (use a screenshot to find it)
//   node drive.mjs <session> hover <n|"label">|<x> <y>
//   node drive.mjs <session> type "text"        type into the focused field (append; use clear first to replace)
//   node drive.mjs <session> clear              empty the focused field
//   node drive.mjs <session> key <Enter|Escape|Tab|ArrowDown|Backspace|...> [Meta|Shift|Control]
//   node drive.mjs <session> scroll <dy> [x y]  mouse wheel (positive = down)
//   node drive.mjs <session> shot <file.png>    screenshot of the window (1500x950)
//   node drive.mjs <session> back               browser back
//   node drive.mjs <session> goto <#/route>     jump to a route, like a bookmark (prefer clicking)
//   node drive.mjs <session> stop
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Session state (browser port, action log) lives outside the repo.
const DIR = process.env.DRIVE_SESSIONS ?? join(tmpdir(), "archstats-drive-sessions"); mkdirSync(DIR, { recursive: true });
const [name, cmd, ...rest] = process.argv.slice(2);
if (!name || !cmd) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 20).join("\n")); process.exit(1); }
const file = join(DIR, name + ".json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1500, H = 950;
appendFileSync(join(DIR, name + ".log"), `${new Date().toISOString()} ${cmd} ${rest.join(" ")}\n`);

if (cmd === "start") {
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${port}`, `--window-size=${W},${H}`, `--user-data-dir=/tmp/archstats-drive-${name}-${Date.now()}`, "about:blank"], { stdio: "ignore", detached: true });
  chrome.unref();
  writeFileSync(file, JSON.stringify({ port, pid: chrome.pid }));
}
if (!existsSync(file)) { console.log(`No session "${name}". Run: node drive.mjs ${name} start`); process.exit(1); }
const { port, pid } = JSON.parse(readFileSync(file, "utf8"));
if (cmd === "stop") { try { process.kill(pid); } catch {} writeFileSync(file + ".stopped", ""); console.log("stopped"); process.exit(0); }

let tgt;
for (let i = 0; i < 60 && !tgt; i++) { try { tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} if (!tgt) await sleep(250); }
if (!tgt) { console.log("browser not reachable; run start again"); process.exit(1); }
const ws = new WebSocket(tgt.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const done = (out) => { if (out !== undefined) console.log(out); ws.close(); process.exit(0); };

// Visible controls, numbered, with their centres. Stored on the page for click <n>.
const LIST = `(() => {
  const sel = 'a[href], button, input, textarea, select, summary, [role=button], [role=tab], [role=link], [role=menuitem], [role=option], [role=checkbox], [role=switch], [role=treeitem], [tabindex]:not([tabindex="-1"]), label[for], th[class*=sort], [onclick]';
  const seen = new Set(); const out = [];
  const els = [...document.querySelectorAll(sel)];
  // Anything else a person would see as clickable: a pointer cursor its parent does not share.
  for (const el of document.querySelectorAll('body *')) {
    if (els.includes(el)) continue;
    const c = getComputedStyle(el).cursor; if (c !== 'pointer') continue;
    const p = el.parentElement; if (p && getComputedStyle(p).cursor === 'pointer') continue;
    if (els.some(e => e.contains(el) || el.contains(e))) continue;
    els.push(el);
  }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') continue;
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const top = document.elementFromPoint(x, y); if (top && !el.contains(top) && !top.contains(el)) continue;
    let label = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
    if (!label && el.querySelector('svg')) label = '[icon' + (el.getAttribute('title') ? ': ' + el.getAttribute('title') : '') + ']';
    const key = label + '@' + x + ',' + y; if (seen.has(key)) continue; seen.add(key);
    const kind = el.tagName === 'INPUT' ? 'input:' + (el.type || 'text') : (el.getAttribute('role') || el.tagName.toLowerCase());
    const state = [el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') ? 'on' : '', el.disabled ? 'disabled' : '', el.checked ? 'checked' : ''].filter(Boolean).join(',');
    const tip = (el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim();
    out.push({ x, y, kind, label: label.slice(0, 90), state, tip: tip && tip !== label ? tip.slice(0, 160) : '' });
  }
  window.__driveList = out;
  return out.map((c, i) => '[' + (i + 1) + '] ' + c.kind + (c.state ? '(' + c.state + ')' : '') + ' "' + c.label + '"' + (c.tip ? '  (tooltip: ' + c.tip + ')' : '')).join('\\n');
})()`;
const VISIBLE_TEXT = `(() => {
  const main = document.querySelector('main') || document.body;
  const lines = []; const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walk.nextNode())) {
    const t = n.textContent.replace(/\\s+/g, ' ').trim(); if (!t) continue;
    const el = n.parentElement; if (el.closest('title, desc, script, style')) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.width === 0) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none') continue;
    lines.push(t);
  }
  const out = []; for (const l of lines) if (out[out.length - 1] !== l) out.push(l);
  return out.join(' | ').slice(0, 6000);
})()`;

async function centre(target) {
  if (/^\d+$/.test(target)) {
    const c = await run(`(window.__driveList || [])[${Number(target) - 1}] || null`);
    if (!c) return null; return c;
  }
  const t = JSON.stringify(target.toLowerCase());
  await run(LIST);
  return await run(`(() => { const L = window.__driveList || []; return L.find(c => c.label.toLowerCase() === ${t}) || L.find(c => c.label.toLowerCase().startsWith(${t})) || L.find(c => c.label.toLowerCase().includes(${t})) || null; })()`);
}
async function mouse(x, y, count = 1) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  for (let i = 1; i <= count; i++) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: i });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: i });
  }
}
const settle = () => sleep(Number(process.env.DRIVE_WAIT ?? 1200));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

switch (cmd) {
  case "start": {
    await send("Page.navigate", { url: process.env.DRIVE_URL ?? "http://localhost:4103/" });
    for (let i = 0; i < 60; i++) { const ok = await run(`!!document.querySelector('#__nuxt') && document.body.innerText.length > 50`); if (ok) break; await sleep(500); }
    await sleep(2000);
    // Put the session in the scenario's workspace, the way a person would.
    const WS = process.env.DRIVE_WORKSPACE ?? "archstats-ui";
    const sw = await centre("Workspace:"); if (sw) { await mouse(sw.x, sw.y); await sleep(600); }
    for (let i = 0; i < 8; i++) {
      await run(LIST);
      const it = await run(`(window.__driveList || []).find(c => c.label.startsWith(${JSON.stringify(WS + " /")})) || null`);
      if (it) { await mouse(it.x, it.y); break; }
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 150, y: 400, deltaX: 0, deltaY: 400 }); await sleep(300);
    }
    await sleep(3000);
    done("started. " + (await run(VISIBLE_TEXT)).slice(0, 1200));
  }
  case "look": {
    const text = await run(VISIBLE_TEXT); const list = await run(LIST);
    const sugg = await run(`(() => { const el = document.activeElement; if (!el || !el.list) return ''; const q = (el.value || '').toLowerCase(); const o = [...el.list.options].map(x => x.value).filter(v => v.toLowerCase().includes(q)).slice(0, 15); return o.length ? 'Suggestions for the focused field (' + (el.getAttribute('aria-label') || el.placeholder) + '): ' + o.join(' | ') : ''; })()`);
    done(`URL ${await run("location.hash")}\n--- visible text ---\n${text}\n--- controls ---\n${list}${sugg ? "\n--- " + sugg : ""}`);
  }
  case "text": {
    const max = Number(rest[0] ?? 12000);
    done((await run(`((document.querySelector('main') || document.body).innerText || '')`)).slice(0, max));
  }
  case "click": case "dblclick": case "hover": {
    if (cmd === "hover" && rest.length === 2 && /^\d+$/.test(rest[0]) && /^\d+$/.test(rest[1])) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Number(rest[0]), y: Number(rest[1]) }); await settle(); done("hovered"); }
    const c = await centre(rest.join(" "));
    if (!c) done(`nothing matches "${rest.join(" ")}" on screen; run look`);
    if (cmd === "hover") await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c.x, y: c.y });
    else await mouse(c.x, c.y, cmd === "dblclick" ? 2 : 1);
    await settle();
    done(`${cmd} ${c.kind} "${c.label}" at ${c.x},${c.y}. URL now ${await run("location.hash")}`);
  }
  case "clickxy": { await mouse(Number(rest[0]), Number(rest[1])); await settle(); done(`clicked ${rest[0]},${rest[1]}. URL now ${await run("location.hash")}`); }
  case "clear": {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 4, commands: ["selectAll"] });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 4 });
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await settle(); done("cleared the focused field");
  }
  case "type": { await send("Input.insertText", { text: rest.join(" ") }); await settle(); done("typed"); }
  case "key": {
    const k = rest[0]; const mods = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }; const modifiers = rest.slice(1).reduce((m, x) => m | (mods[x] ?? 0), 0);
    const codes = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Delete: 46, Space: 32 };
    const vk = codes[k] ?? k.toUpperCase().charCodeAt(0);
    const text = k === "Enter" ? "\r" : k.length === 1 && !modifiers ? k : undefined;
    const commands = (modifiers & 4 || modifiers & 2) && k.toLowerCase() === "a" ? ["selectAll"] : undefined;
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k.length === 1 ? "Key" + k.toUpperCase() : k, windowsVirtualKeyCode: vk, modifiers, text, commands });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k.length === 1 ? "Key" + k.toUpperCase() : k, windowsVirtualKeyCode: vk, modifiers });
    await settle(); done(`key ${rest.join("+")}. URL now ${await run("location.hash")}`);
  }
  case "scroll": {
    const [dy, x = W / 2, y = H / 2] = rest.map(Number);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy });
    await settle(); done("scrolled");
  }
  case "shot": {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(rest[0], Buffer.from(r.result.data, "base64")); done("saved " + rest[0]);
  }
  case "back": { await run("history.back()"); await settle(); done("URL now " + (await run("location.hash"))); }
  case "goto": { const h = rest[0].replace(/^#?/, "#"); await run(`location.hash = ${JSON.stringify(h)}`); await settle(); await sleep(800); done("URL now " + (await run("location.hash"))); }
  default: done("unknown command " + cmd);
}
