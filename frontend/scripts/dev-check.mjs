// Checks that `wails dev` is up and that the given source modules compile.
// Usage: node scripts/dev-check.mjs [files...]
// With no files it checks every changed/untracked file under src/ (vs HEAD).
// Exit 0 = all good, 1 = dev server down or a module fails to compile.
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { existsSync } from "node:fs";

const NUXT = "http://localhost:3000";
const WAILS = "http://localhost:34115";
const frontendDir = resolve(new URL("..", import.meta.url).pathname);

async function up(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(3000) }); return r.status < 500; } catch { return false; }
}

const nuxtUp = await up(NUXT);
const wailsUp = await up(WAILS);
console.log(`nuxt dev  :3000  ${nuxtUp ? "up" : "DOWN"}`);
console.log(`wails dev :34115 ${wailsUp ? "up" : "DOWN"}`);
if (!nuxtUp) {
  console.log("\nStart it yourself from the repo root: `wails dev` (do not run `nuxi build` while it runs).");
  console.log("If the app serves a stale production manifest: `npm run dev:reset` in frontend/.");
  process.exit(1);
}
// A real production build leaves .output/public/index.html; a dev restart only leaves an empty .output.
if (existsSync(resolve(frontendDir, ".output/public/index.html"))) {
  console.log("\nWARNING a production build ran while dev was up; the dev server may serve a stale manifest. Run `npm run dev:reset`.");
}

let files = process.argv.slice(2);
if (!files.length) {
  const top = execSync("git rev-parse --show-toplevel", { cwd: frontendDir, encoding: "utf8" }).trim();
  const out = execSync("git status --porcelain -uall -- src", { cwd: frontendDir, encoding: "utf8" });
  files = out.split("\n").filter(Boolean)
    .map((l) => l.slice(3).trim().split(" -> ").pop())
    .filter((f) => /\.(vue|ts|js|mjs|css)$/.test(f))
    .map((f) => resolve(top, f));
} else {
  files = files.map((f) => resolve(process.cwd(), f));
}
files = files.map((f) => relative(frontendDir, f)).filter((f) => existsSync(resolve(frontendDir, f)));
if (!files.length) { console.log("\nNo changed modules to check."); process.exit(0); }

let failed = 0;
for (const f of files) {
  const url = `${NUXT}/_nuxt/${f}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.ok) { console.log(`ok    ${f}`); continue; }
    failed++;
    let msg = `${r.status}`;
    try { const j = await r.json(); msg = j.message ?? j.stack ?? msg; } catch { msg += " " + (await r.text()).slice(0, 300); }
    console.log(`FAIL  ${f}\n      ${String(msg).split("\n").slice(0, 6).join("\n      ")}`);
  } catch (e) { failed++; console.log(`FAIL  ${f}\n      ${e.message}`); }
}
console.log(`\n${files.length - failed}/${files.length} modules compile.`);
process.exit(failed ? 1 : 0);
