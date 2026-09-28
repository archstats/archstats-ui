// The report QA copy of tasks/ui-dogfood/harness/serve-ui.mjs. Same sandbox,
// with two changes so a test can end in a PDF:
// - RenderPDF runs for real: it only lays the report out and returns bytes;
// - a native save (FilesService.SaveFile / SaveBundle) writes into --out
//   instead of opening a dialog, and returns the path it wrote, as the real
//   one does. Nothing else leaves the page.
// usage: node serve-qa.mjs <generated site dir> <port> --scan <scan id> --out <dir>
//
// The original's notes:
// Serve a generated build of the Archstats app against the running Wails dev
// backend, sandboxed for a dogfood run:
// - every snapshot read goes to one pinned scan (--scan), so the owner's open
//   snapshot never moves and no other workspace's data leaks in;
// - the SQL console is switched off (QueryService.Console / QueryLimited throw);
// - nothing is written: scans, workspace edits, saved state and evidence stay
//   in memory for the life of the page.
// usage: node serve-ui.mjs <generated site dir> <port> --scan <scan id> [--sql on]
//   --sql on keeps the SQL console working (for runs that allow it).
import { readdirSync as __ls } from "node:fs"; import http from "node:http"; import net from "node:net"; import { mkdir, readFile, writeFile } from "node:fs/promises"; import path from "node:path";
const [dir, port] = [process.argv[2], Number(process.argv[3])];
const flag = (k) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
if (!flag("scan")) { console.error("--scan <scan id> is required"); process.exit(1); }
const SQL_ON = flag("sql") === "on";
const BACK = { host: "127.0.0.1", port: 34115 };
const SCAN = flag("scan");
// The workspace whose remembered snapshot is set to --scan, so the app opens the pinned snapshot.
// Without it the app opens its newest-by-commit snapshot, and report cells (QueryIn/Console on
// the open snapshot) read a different snapshot from the views (Query, pinned).
const WSID = flag("workspace-id");
const OUT = flag("out"); if (!OUT) { console.error("--out <dir> is required"); process.exit(1); }
// Number after what is already there, so a restarted server never overwrites an earlier PDF.
let saves = 0; try { for (const f of __ls(OUT)) { const n = Number(f.slice(0, 2)); if (n > saves) saves = n; } } catch {}
const STUB = `<script>(() => {
  const SCAN = ${JSON.stringify(SCAN)};
  const WSID = ${JSON.stringify(WSID ?? "")};
  if (WSID) try { localStorage.setItem("archstats.shell.openScan." + WSID, SCAN); } catch {}
  const tag = (f) => (f.__stub = true, f);
  const off = (what) => tag(async () => { throw new Error(what + " is switched off for this run."); });
  const mem = { reports: [], figs: {}, n: 0 };
  const patch = (go) => {
    const app = go && go.app; if (!app) return;
    const q = app.QueryService;
    if (q) {
      if (q.Open && !q.Open.__stub) q.Open = tag(async () => {});
      if (q.CurrentScan && !q.CurrentScan.__stub) q.CurrentScan = tag(async () => SCAN);
      if (q.Query && q.QueryIn && !q.Query.__stub) { const rin = q.QueryIn; q.Query = tag((sql) => rin(SCAN, sql)); }
      if (!${SQL_ON}) {
        if (q.Console && !q.Console.__stub) q.Console = off("The SQL console");
        if (q.ReportConsole && !q.ReportConsole.__stub) q.ReportConsole = off("The SQL console");
        if (q.QueryLimited && !q.QueryLimited.__stub) q.QueryLimited = off("The SQL console");
      }
    }
    const s = app.ScanService; if (s) for (const k of ["Start", "StartAt", "Enqueue", "ClearFinished", "StopAfterCurrent"]) if (s[k] && !s[k].__stub) s[k] = off("Scanning");
    const w = app.WorkspaceService; if (w) for (const k of ["Create", "Delete", "DeleteScan", "DeleteScans", "Rename", "SelectFolder", "ImportSnapshot", "PickSnapshot", "SaveSnapshotCopy", "LabelScan", "SetBaseline", "OpenInEditor", "RevealSnapshot", "RevealWorkspaceFile"]) if (w[k] && !w[k].__stub) w[k] = off("Changing workspaces");
    // Reports run on the newest-by-commit snapshot, not the open one (a product finding of this run).
    // Hide snapshots of newer commits than the pinned one so the report cells and the views read the same data.
    if (w && w.ListScans && !w.ListScans.__stub) {
      const realList = w.ListScans;
      const t = (x) => new Date(x.headTime || x.startedAt || 0).getTime();
      w.ListScans = tag(async (id) => { const all = await realList(id); const pin = all.find(x => x.id === SCAN); return pin ? all.filter(x => x.id === SCAN || t(x) <= t(pin)) : all; });
    }
    const st = app.StateService; if (st) for (const k of ["PutMany", "PutSetting", "Put", "Delete"]) if (st[k] && !st[k].__stub) st[k] = tag(async () => {});
    const c = app.ChangesService; if (c && c.ForgetScan && !c.ForgetScan.__stub) c.ForgetScan = off("Forgetting scans");
    const a = app.AppService; if (a && a.QueueSnapshots && !a.QueueSnapshots.__stub) a.QueueSnapshots = off("Queueing snapshots");
    const fs = app.FilesService;
    if (fs && !fs.__qa) {
      fs.__qa = true;
      const post = (body) => fetch("/qa-save", { method: "POST", body: JSON.stringify(body) }).then(r => r.json()).then(r => r.path);
      fs.SaveFile = tag(async (req) => post({ name: req.defaultName || "export", text: req.text || "", base64: req.base64 || "" }));
      if (fs.SaveBundle) fs.SaveBundle = tag(async (title, files) => { let dir = ""; for (const f of files) dir = await post({ name: f.name, text: f.text || "", base64: f.base64 || "", bundle: title || "bundle" }); return dir.slice(0, dir.lastIndexOf("/")); });
    }
    const e = app.EvidenceService;
    if (e && !e.__mem) {
      e.__mem = true;
      const realFigure = e.Figure;
      e.Reports = tag(async (ws) => mem.reports.filter(r => r.workspaceId === ws));
      e.SaveReport = tag(async (r) => { const now = new Date().toISOString(); if (!r.id) { r = { ...r, id: "mem" + (++mem.n), createdAt: now }; mem.reports.push(r); } else { const i = mem.reports.findIndex(x => x.id === r.id); if (i >= 0) mem.reports[i] = r; else mem.reports.push(r); } r.updatedAt = now; return r; });
      e.DeleteReport = tag(async (id) => { mem.reports = mem.reports.filter(r => r.id !== id); });
      e.ReorderReports = tag(async () => {});
      e.List = tag(async () => []);
      e.Upsert = tag(async (p) => ({ ...p, id: p.id || "pin" + (++mem.n) }));
      e.Delete = tag(async () => {}); e.Reorder = tag(async () => {});
      e.OpenPDF = off("Opening a PDF in another app");
      e.SaveFigure = tag(async (ws, id, b64) => { const p = "mem/" + id + ".png"; mem.figs[p] = b64; return p; });
      e.Figure = tag(async (p) => (p in mem.figs ? mem.figs[p] : realFigure(p)));
    }
  };
  let real = window.go;
  Object.defineProperty(window, "go", { configurable: true, get() { try { patch(real); } catch {} return real; }, set(v) { real = v; } });
  const iv = setInterval(() => patch(real), 1); setTimeout(() => clearInterval(iv), 120000);
})();</script>`;
// A stub that does not parse leaves the app unsandboxed, writing to the owner's app.db. Refuse to start.
try { new Function(STUB.replace(/^<script>/, "").replace(/<\/script>$/, "")); } catch (err) { console.error("The injected stub does not parse:", err.message); process.exit(1); }
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".wasm": "application/wasm" };
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/qa-save" && req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", async () => {
      const f = JSON.parse(body);
      // Shortened names keep their extension, so a long report title still saves as a .pdf.
      const safe = (s) => { const t = String(s).replace(/[^\w.\- ]+/g, "_"); const ext = /\.[a-z0-9]{1,5}$/i.exec(t)?.[0] ?? ""; return t.length <= 120 ? t : t.slice(0, 120 - ext.length) + ext; };
      const dir = f.bundle ? path.join(OUT, safe(f.bundle)) : OUT;
      await mkdir(dir, { recursive: true });
      const name = f.bundle ? safe(f.name) : `${String(++saves).padStart(2, "0")}-${safe(f.name)}`;
      const p = path.join(dir, name);
      await writeFile(p, f.base64 ? Buffer.from(f.base64, "base64") : f.text);
      console.log("saved", p);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ path: p }));
    });
    return;
  }
  if (url.startsWith("/wails/")) {
    const p = http.request({ ...BACK, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    req.pipe(p); return;
  }
  const file = path.join(dir, url === "/" ? "index.html" : url);
  try {
    let body = await readFile(file);
    if (file.endsWith(".html")) body = Buffer.from(String(body).replace("<head>", `<head><script src="/wails/ipc.js"></script><script src="/wails/runtime.js"></script>${STUB}`));
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
server.on("upgrade", (req, sock, head) => {
  const up = net.connect(BACK.port, BACK.host, () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\n");
    up.write(head); sock.pipe(up); up.pipe(sock);
  });
  up.on("error", () => sock.destroy()); sock.on("error", () => up.destroy());
});
server.listen(port, () => console.log("serving", dir, "on", port, "pinned to scan", SCAN, SQL_ON ? "(SQL console on)" : "(SQL console off)", "saving to", OUT));
