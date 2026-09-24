export namespace app {
	
	export class FolderPick {
	    path: string;
	    suggestedName: string;
	    existing?: store.Workspace;
	
	    static createFrom(source: any = {}) {
	        return new FolderPick(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.suggestedName = source["suggestedName"];
	        this.existing = this.convertValues(source["existing"], store.Workspace);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MenuState {
	    hasWorkspace: boolean;
	    hasSnapshot: boolean;
	    scanning: boolean;
	    canExport: boolean;
	
	    static createFrom(source: any = {}) {
	        return new MenuState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasWorkspace = source["hasWorkspace"];
	        this.hasSnapshot = source["hasSnapshot"];
	        this.scanning = source["scanning"];
	        this.canExport = source["canExport"];
	    }
	}

}

export namespace query {
	
	export class Limited {
	    columns: string[];
	    rows: any[][];
	    truncated: boolean;
	    elapsedMs: number;
	
	    static createFrom(source: any = {}) {
	        return new Limited(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.truncated = source["truncated"];
	        this.elapsedMs = source["elapsedMs"];
	    }
	}

}

export namespace store {
	
	export class Scan {
	    id: string;
	    workspaceId: string;
	    status: string;
	    // Go type: time
	    startedAt: any;
	    // Go type: time
	    finishedAt?: any;
	    error: string;
	    snapshotPath: string;
	    label: string;
	    origin: string;
	    headCommit: string;
	    branch: string;
	    // Go type: time
	    headTime?: any;
	    headTimeSource: string;
	    dirtyFiles?: number;
	    analysisRevision: number;
	    extensions: string;
	    ignoreGlobs: string;
	    revisionRef: string;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new Scan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.workspaceId = source["workspaceId"];
	        this.status = source["status"];
	        this.startedAt = this.convertValues(source["startedAt"], null);
	        this.finishedAt = this.convertValues(source["finishedAt"], null);
	        this.error = source["error"];
	        this.snapshotPath = source["snapshotPath"];
	        this.label = source["label"];
	        this.origin = source["origin"];
	        this.headCommit = source["headCommit"];
	        this.branch = source["branch"];
	        this.headTime = this.convertValues(source["headTime"], null);
	        this.headTimeSource = source["headTimeSource"];
	        this.dirtyFiles = source["dirtyFiles"];
	        this.analysisRevision = source["analysisRevision"];
	        this.extensions = source["extensions"];
	        this.ignoreGlobs = source["ignoreGlobs"];
	        this.revisionRef = source["revisionRef"];
	        this.sizeBytes = source["sizeBytes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Workspace {
	    id: string;
	    name: string;
	    folderPath: string;
	    // Go type: time
	    createdAt: any;
	    baselineScanId?: string;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.folderPath = source["folderPath"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.baselineScanId = source["baselineScanId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

