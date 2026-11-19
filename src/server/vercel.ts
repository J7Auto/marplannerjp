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
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

let appPromise: Promise<FastifyInstance> | null = null;
let ownsStorage = false;

async function boot(): Promise<FastifyInstance> {
  process.env.DATA_DIR ??= "/tmp/marplanner";
  process.env.MP_SEED_ON_EMPTY ??= "true";
  process.env.SCHEDULER_DISABLED ??= "1";
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

  const { wireNetworkDevicesCache } = await import("./modules/network-devices/cache");
  wireNetworkDevicesCache();

  const { buildApp } = await import("./app");
  const app = await buildApp();
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  appPromise ??= boot().catch((err: unknown) => {
    appPromise = null;
    throw err;
  });
  const app = await appPromise;
  app.server.emit("request", req, res);
}
