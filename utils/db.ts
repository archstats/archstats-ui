type PendingQuery = {
    resolve: (rows: any[]) => void;
    reject: (err: Error) => void;
};

export class DbWorker {
    private worker: Worker;
    private nextId = 0;
    private pending = new Map<number, PendingQuery>();

    constructor() {
        this.worker = new Worker(
            new URL('../workers/db.worker.ts', import.meta.url),
            { type: 'module' }
        );

        this.worker.onmessage = (event: MessageEvent) => {
            const { type, id, rows, error } = event.data;

            if (type === 'init-done') {
                const entry = this.pending.get(-1);
                if (entry) {
                    this.pending.delete(-1);
                    entry.resolve([]);
                }
                return;
            }

            if (type === 'query-result') {
                const entry = this.pending.get(id);
                if (entry) {
                    this.pending.delete(id);
                    entry.resolve(rows);
                }
                return;
            }

            if (type === 'error') {
                // init errors use id === undefined
                const resolveId = id ?? -1;
                const entry = this.pending.get(resolveId);
                if (entry) {
                    this.pending.delete(resolveId);
                    entry.reject(new Error(error));
                }
                return;
            }
        };

        this.worker.onerror = (err) => {
            console.error('[DbWorker] Worker error:', err);
        };
    }

    init(data: Uint8Array): Promise<void> {
        return new Promise((resolve, reject) => {
            this.pending.set(-1, {
                resolve: () => resolve(),
                reject
            });
            this.worker.postMessage({ type: 'init', data }, [data.buffer]);
        });
    }

    query<T = any>(sql: string): Promise<T[]> {
        const id = this.nextId++;
        return new Promise<T[]>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ type: 'query', id, sql });
        });
    }

    terminate(): void {
        this.worker.terminate();
        for (const entry of this.pending.values()) {
            entry.reject(new Error('Worker terminated'));
        }
        this.pending.clear();
    }
}
