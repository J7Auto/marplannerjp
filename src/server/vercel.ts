/**
 * Fork (casa): Vercel Function entry point for a try-it demo.
 *
 * Runs the same boot sequence as `main()` in index.ts (migrations, seed-on-empty, credential
 * reconcile, buildApp) once per function instance, then hands every request to Fastify.
 *
 * Vercel functions have no persistent disk: the SQLite database lives in /tmp, so each new
 * instance starts from the seed profile again and anything changed is eventually lost. The
 * background scheduler (briefings, backups, calendar polling) does not run here. For real use,
 * run the Docker image on a server (see CASA.md).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

let appPromise: Promise<FastifyInstance> | null = null;
let ownsStorage = false;

async function boot(): Promise<FastifyInstance> {
  process.env.DATA_DIR ??= "/tmp/marplanner";
  process.env.MP_SEED_ON_EMPTY ??= "true";
  process.env.SCHEDULER_DISABLED ??= "1";
  // Every instance has its own database, so a device provisioned on one would be unknown to the
  // next. Use one fixed device key, derived from the bootstrap key, and register it (and the
  // admin PIN) on every instance at boot.
  const bootstrapKey = process.env.MP_BOOTSTRAP_KEY ?? "";
  process.env.MP_DEMO_DEVICE_KEY ??=
    "mpk-demo-" + createHash("sha256").update(`marplanner-demo:${bootstrapKey}`).digest("hex");
  fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

  const { acquireStorageOwnership } = await import("./db/runtime-storage");
  const { resolveDbPath } = await import("./db/client");
  // Once per instance: the ownership lock is held for the process lifetime, so a retried boot
  // after a later failure must not try to take it again.
  if (!ownsStorage) {
    acquireStorageOwnership(resolveDbPath());
    ownsStorage = true;
  }

  const { runMigrations } = await import("./db/migrate");
  runMigrations();
  const { assertWeekdayIntegrity } = await import("./db/weekday-integrity");
  assertWeekdayIntegrity();

  const { seedOnEmpty } = await import("./db/seeds/seed-on-empty");
  await seedOnEmpty();

  const { reconcileBootstrap, reconcileManagement } = await import("./auth/reconcile");
  reconcileBootstrap();
  reconcileManagement();

  await registerDemoDevice();

  const { wireNetworkDevicesCache } = await import("./modules/network-devices/cache");
  wireNetworkDevicesCache();

  const { buildApp } = await import("./app");
  const app = await buildApp();
  await app.ready();
  return app;
}

async function registerDemoDevice(): Promise<void> {
  const db = (await import("./db/client")).getDb();
  const { hashKey } = await import("./auth/credentials");
  const { resolveAdminPin } = await import("./auth/default-credentials");
  const argon2 = (await import("argon2")).default;
  const now = Date.now();
  db.prepare(
    "INSERT OR IGNORE INTO api_keys (id, key_hash, scope, kind, label, created_at, expires_at, revoked_at) VALUES ('demo-device', ?, '*', 'device', 'Demo', ?, NULL, NULL)"
  ).run(hashKey(process.env.MP_DEMO_DEVICE_KEY ?? ""), now);
  const pinHash = await argon2.hash(resolveAdminPin());
  db.prepare(
    "INSERT INTO admin_config (id, pin_hash, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING"
  ).run(pinHash, now);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  appPromise ??= boot().catch((err: unknown) => {
    appPromise = null;
    throw err;
  });
  const app = await appPromise;
  app.server.emit("request", req, res);
}
