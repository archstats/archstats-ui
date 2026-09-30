// Where the legacy tools' answers on real snapshots are kept (see golden.test.ts).

import { join } from "node:path"

export const goldenDir = join(__dirname, "golden")

export const goldenPath = (snap: string) => join(goldenDir, `${snap.split("/").pop()!.replace(/\.db$/, "")}.json`)
