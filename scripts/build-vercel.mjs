/** Fork (casa): assemble a Vercel Build Output API v3 tree (.vercel/output) after `npm run build`.
 *
 * One Node.js function (`index`) receives every path: Fastify serves the API and the built SPA
 * exactly as it does in Docker. The function bundle carries dist/ plus the production
 * node_modules the server keeps external (native argon2 / better-sqlite3 and resvg).
 * See src/server/vercel.ts for what a Vercel demo can and cannot do.
 */
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { resolveBuildInfo } from "./build-info.mjs";
import { seedBundlePlugin } from "./seed-bundle-plugin.mjs";

const SEED_SETS = { casa: "seeds-casa", simpsons: "seeds" };
const seedSet = process.env.MP_SEED_SET?.trim() || "casa";
const NATIVE_EXTERNALS = [
  "argon2",
  "better-sqlite3",
  "@resvg/resvg-js",
  "@resvg/resvg-wasm",
  "harfbuzzjs",
];

await build({
  entryPoints: ["src/server/vercel.ts"],
  outfile: "dist/server/vercel.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: NATIVE_EXTERNALS,
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  define: { __MP_BUILD__: JSON.stringify(resolveBuildInfo()) },
  plugins: [seedBundlePlugin({ seedsDirectory: resolve(SEED_SETS[seedSet]) })],
});

const out = ".vercel/output";
const func = `${out}/functions/index.func`;
rmSync(out, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

cpSync("dist", `${func}/dist`, { recursive: true });
// runMigrations reads the SQL migrations from <cwd>/drizzle at boot.
cpSync("drizzle", `${func}/drizzle`, { recursive: true });
cpSync("package.json", `${func}/package.json`);

// Only the externals and what they depend on: everything else is inlined in the bundle.
// (Copying every production package exceeds Vercel's 250 MB function limit.)
function findPackageDir(name, fromDir) {
  let dir = resolve(fromDir);
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const prodDirs = new Set();
const queue = NATIVE_EXTERNALS.map((name) => findPackageDir(name, process.cwd())).filter(Boolean);
while (queue.length > 0) {
  const dir = queue.pop();
  if (prodDirs.has(dir)) continue;
  prodDirs.add(dir);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(deps)) {
    const found = findPackageDir(name, dir);
    if (found) queue.push(found);
  }
}
for (const dir of prodDirs) {
  const rel = relative(process.cwd(), dir);
  cpSync(rel, `${func}/${rel}`, { recursive: true, dereference: true });
}

writeFileSync(
  `${func}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "nodejs24.x",
      handler: "dist/server/vercel.js",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 60,
    },
    null,
    2
  )
);
writeFileSync(
  `${out}/config.json`,
  JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }] }, null, 2)
);
console.log(`vercel output → ${out} (${prodDirs.size} runtime packages)`);
