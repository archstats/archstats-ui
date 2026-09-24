// Serve a generated build of the Archstats app against the running Wails dev
// backend, sandboxed for a dogfood run:
// - every snapshot read goes to one pinned scan (--scan), so the owner's open
//   snapshot never moves and no other workspace's data leaks in;
// - the SQL console is switched off (QueryService.Console / QueryLimited throw);
// - nothing is written: scans, workspace edits, saved state and evidence stay
//   in memory for the life of the page.
// usage: node serve-ui.mjs <generated site dir> <port> --scan <scan id> [--sql on]
//   --sql on keeps the SQL console working (for runs that allow it).
import http from "node:http"; import net from "node:net"; import { readFile } from "node:fs/promises"; import path from "node:path";
const [dir, port] = [process.argv[2], Number(process.argv[3])];
const flag = (k) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : undefined; };
if (!flag("scan")) { console.error("--scan <scan id> is required"); process.exit(1); }
const SQL_ON = flag("sql") === "on";
const BACK = { host: "127.0.0.1", port: 34115 };
const SCAN = flag("scan");
const STUB = `<script>(() => {
  const SCAN = ${JSON.stringify(SCAN)};
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
        if (q.QueryLimited && !q.QueryLimited.__stub) q.QueryLimited = off("The SQL console");
      }
    }
    const s = app.ScanService; if (s) for (const k of ["Start", "StartAt", "Enqueue", "ClearFinished", "StopAfterCurrent"]) if (s[k] && !s[k].__stub) s[k] = off("Scanning");
    const w = app.WorkspaceService; if (w) for (const k of ["Create", "Delete", "DeleteScan", "DeleteScans", "Rename", "SelectFolder", "ImportSnapshot", "PickSnapshot", "SaveSnapshotCopy", "LabelScan", "SetBaseline", "OpenInEditor", "RevealSnapshot", "RevealWorkspaceFile"]) if (w[k] && !w[k].__stub) w[k] = off("Changing workspaces");
    const st = app.StateService; if (st) for (const k of ["PutMany", "PutSetting", "Put", "Delete"]) if (st[k] && !st[k].__stub) st[k] = tag(async () => {});
    const c = app.ChangesService; if (c && c.ForgetScan && !c.ForgetScan.__stub) c.ForgetScan = off("Forgetting scans");
    const a = app.AppService; if (a && a.QueueSnapshots && !a.QueueSnapshots.__stub) a.QueueSnapshots = off("Queueing snapshots");
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
      e.RenderPDF = off("PDF export"); e.OpenPDF = off("PDF export");
      e.SaveFigure = tag(async (ws, id, b64) => { const p = "mem/" + id + ".png"; mem.figs[p] = b64; return p; });
      e.Figure = tag(async (p) => (p in mem.figs ? mem.figs[p] : realFigure(p)));
    }
  };
  let real = window.go;
  Object.defineProperty(window, "go", { configurable: true, get() { try { patch(real); } catch {} return real; }, set(v) { real = v; } });
  const iv = setInterval(() => patch(real), 1); setTimeout(() => clearInterval(iv), 120000);
})();</script>`;
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".wasm": "application/wasm" };
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
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
server.listen(port, () => console.log("serving", dir, "on", port, "pinned to scan", SCAN, SQL_ON ? "(SQL console on)" : "(SQL console off)"));
