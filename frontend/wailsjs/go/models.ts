export namespace app {
	
	export class BundleFile {
	    name: string;
	    text: string;
	    base64: string;
	
	    static createFrom(source: any = {}) {
	        return new BundleFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.text = source["text"];
	        this.base64 = source["base64"];
	    }
	}
	export class EditorOpened {
	    status: string;
	    changedSinceScan: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EditorOpened(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.changedSinceScan = source["changedSinceScan"];
	    }
	}
	export class FileFilter {
	    name: string;
	    patterns: string;
	
	    static createFrom(source: any = {}) {
	        return new FileFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.patterns = source["patterns"];
	    }
	}
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
	export class HeadDrift {
	    status: string;
	    ahead: number;
	    headSha: string;
	    branch: string;
	    branchChanged: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HeadDrift(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.ahead = source["ahead"];
	        this.headSha = source["headSha"];
	        this.branch = source["branch"];
	        this.branchChanged = source["branchChanged"];
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
	export class SaveRequest {
	    defaultName: string;
	    title: string;
	    filters: FileFilter[];
	    text: string;
	    base64: string;
	
	    static createFrom(source: any = {}) {
	        return new SaveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultName = source["defaultName"];
	        this.title = source["title"];
	        this.filters = this.convertValues(source["filters"], FileFilter);
	        this.text = source["text"];
	        this.base64 = source["base64"];
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
	export class StorageWorkspace {
	    id: string;
	    name: string;
	    baselineScanId: string;
	    scans: store.Scan[];
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new StorageWorkspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.baselineScanId = source["baselineScanId"];
	        this.scans = this.convertValues(source["scans"], store.Scan);
	        this.bytes = source["bytes"];
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
	export class float64 {
	
	
	    static createFrom(source: any = {}) {
	        return new float64(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}
	export class TrendPoint {
	    scanId: string;
	    label: string;
	    startedAt: time.Time;
	    headTime?: time.Time;
	    headCommit: string;
	    analysisRevision: number;
	    ignoreGlobs: string;
	    extensions: string;
	    readings: Record<string, number>;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new TrendPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scanId = source["scanId"];
	        this.label = source["label"];
	        this.startedAt = this.convertValues(source["startedAt"], time.Time);
	        this.headTime = this.convertValues(source["headTime"], time.Time);
	        this.headCommit = source["headCommit"];
	        this.analysisRevision = source["analysisRevision"];
	        this.ignoreGlobs = source["ignoreGlobs"];
	        this.extensions = source["extensions"];
	        this.readings = source["readings"];
	        this.error = source["error"];
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

export namespace changes {
	
	export class Move {
	    component: string;
	    metric: string;
	    before: number;
	    after: number;
	
	    static createFrom(source: any = {}) {
	        return new Move(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.component = source["component"];
	        this.metric = source["metric"];
	        this.before = source["before"];
	        this.after = source["after"];
	    }
	}
	export class Finding {
	    rule: string;
	    from: string;
	    to: string;
	    file: string;
	    line: number;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new Finding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rule = source["rule"];
	        this.from = source["from"];
	        this.to = source["to"];
	        this.file = source["file"];
	        this.line = source["line"];
	        this.kind = source["kind"];
	    }
	}
	export class TangleChange {
	    kind: string;
	    before: string[];
	    after: string[];
	    joined: string[];
	    left: string[];
	
	    static createFrom(source: any = {}) {
	        return new TangleChange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.before = source["before"];
	        this.after = source["after"];
	        this.joined = source["joined"];
	        this.left = source["left"];
	    }
	}
	export class EdgeDelta {
	    from: string;
	    to: string;
	    before: number;
	    after: number;
	
	    static createFrom(source: any = {}) {
	        return new EdgeDelta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.from = source["from"];
	        this.to = source["to"];
	        this.before = source["before"];
	        this.after = source["after"];
	    }
	}
	export class Edge {
	    from: string;
	    to: string;
	    refs: number;
	    files: string[];
	    dynamic: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Edge(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.from = source["from"];
	        this.to = source["to"];
	        this.refs = source["refs"];
	        this.files = source["files"];
	        this.dynamic = source["dynamic"];
	    }
	}
	export class ChangeSet {
	    baseId: string;
	    headId: string;
	    componentsAdded: string[];
	    componentsRemoved: string[];
	    edgesAdded: Edge[];
	    edgesRemoved: Edge[];
	    edgesChanged: EdgeDelta[];
	    tangles: TangleChange[];
	    rulesNew: Finding[];
	    rulesGone: Finding[];
	    rulesChecked: Record<string, boolean>;
	    moves: Move[];
	
	    static createFrom(source: any = {}) {
	        return new ChangeSet(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseId = source["baseId"];
	        this.headId = source["headId"];
	        this.componentsAdded = source["componentsAdded"];
	        this.componentsRemoved = source["componentsRemoved"];
	        this.edgesAdded = this.convertValues(source["edgesAdded"], Edge);
	        this.edgesRemoved = this.convertValues(source["edgesRemoved"], Edge);
	        this.edgesChanged = this.convertValues(source["edgesChanged"], EdgeDelta);
	        this.tangles = this.convertValues(source["tangles"], TangleChange);
	        this.rulesNew = this.convertValues(source["rulesNew"], Finding);
	        this.rulesGone = this.convertValues(source["rulesGone"], Finding);
	        this.rulesChecked = source["rulesChecked"];
	        this.moves = this.convertValues(source["moves"], Move);
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

export namespace scan {
	
	export class CommitInfo {
	    sha: string;
	    time: time.Time;
	    subject: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sha = source["sha"];
	        this.time = this.convertValues(source["time"], time.Time);
	        this.subject = source["subject"];
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

export namespace store {
	
	export class Scan {
	    id: string;
	    workspaceId: string;
	    status: string;
	    startedAt: time.Time;
	    finishedAt?: time.Time;
	    error: string;
	    snapshotPath: string;
	    label: string;
	    origin: string;
	    headCommit: string;
	    branch: string;
	    headTime?: time.Time;
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
	        this.startedAt = this.convertValues(source["startedAt"], time.Time);
	        this.finishedAt = this.convertValues(source["finishedAt"], time.Time);
	        this.error = source["error"];
	        this.snapshotPath = source["snapshotPath"];
	        this.label = source["label"];
	        this.origin = source["origin"];
	        this.headCommit = source["headCommit"];
	        this.branch = source["branch"];
	        this.headTime = this.convertValues(source["headTime"], time.Time);
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
	    createdAt: time.Time;
	    baselineScanId?: string;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.folderPath = source["folderPath"];
	        this.createdAt = this.convertValues(source["createdAt"], time.Time);
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

export namespace time {
	
	export class Time {
	
	
	    static createFrom(source: any = {}) {
	        return new Time(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	
	    }
	}

}

