import initSqlJs, { Database } from 'sql.js';

let db: Database | null = null;

self.onmessage = async (event: MessageEvent) => {
    const { type, id, data, sql } = event.data;

    try {
        switch (type) {
            case 'init': {
                const SQL = await initSqlJs({
                    locateFile: (file: string) => `/${file}`
                });
                db = new SQL.Database(data);
                self.postMessage({ type: 'init-done' });
                break;
            }
            case 'query': {
                if (!db) {
                    self.postMessage({ type: 'error', id, error: 'Database not initialized' });
                    return;
                }
                const rows: any[] = [];
                const stmt = db.prepare(sql);
                while (stmt.step()) {
                    rows.push(stmt.getAsObject());
                }
                stmt.free();
                self.postMessage({ type: 'query-result', id, rows });
                break;
            }
            default:
                self.postMessage({ type: 'error', id, error: `Unknown message type: ${type}` });
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', id, error: err?.message || String(err) });
    }
};
