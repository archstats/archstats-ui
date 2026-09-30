// Runs a code-mode script in a Web Worker: no DOM, no network (fetch,
// XMLHttpRequest, WebSocket and importScripts are removed before the script
// runs), a time limit, and the API reached only by message.

export interface CodeResult { value: unknown; logs: string[]; error?: string }

const WORKER = `
const pending = new Map(); let seq = 0;
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === "result") { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.value); return; }
  if (m.type !== "run") return;
  const call = (name) => (...args) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); self.postMessage({ type: "call", id, name, args }); });
  const api = {}; for (const n of m.names) api[n] = call(n);
  const logs = [];
  const console = { log: (...a) => logs.push(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ")) };
  self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.importScripts = undefined; self.EventSource = undefined;
  try {
    const fn = new Function(...m.names, "console", '"use strict"; return (async () => {' + m.code + '\\n})()');
    const value = await fn(...m.names.map(n => api[n]), console);
    self.postMessage({ type: "done", value: JSON.parse(JSON.stringify(value ?? null)), logs });
  } catch (e) { self.postMessage({ type: "done", error: String(e && e.message || e), logs }); }
};`

export function runInWorker(code: string, api: Record<string, (...a: any[]) => Promise<unknown>>, timeoutMs = 20000): Promise<CodeResult> {
    return new Promise(resolve => {
        const url = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }))
        const w = new Worker(url)
        const finish = (r: CodeResult) => { clearTimeout(timer); w.terminate(); URL.revokeObjectURL(url); resolve(r) }
        const timer = setTimeout(() => finish({ value: null, logs: [], error: `the script ran longer than ${timeoutMs / 1000} s` }), timeoutMs)
        w.onmessage = async ev => {
            const m = ev.data
            if (m.type === "call") {
                try { w.postMessage({ type: "result", id: m.id, value: JSON.parse(JSON.stringify(await api[m.name](...m.args))) }) } catch (e: any) { w.postMessage({ type: "result", id: m.id, error: String(e?.message ?? e) }) }
            } else if (m.type === "done") finish({ value: m.value, logs: m.logs ?? [], error: m.error })
        }
        w.onerror = e => finish({ value: null, logs: [], error: e.message })
        w.postMessage({ type: "run", code, names: Object.keys(api) })
    })
}
