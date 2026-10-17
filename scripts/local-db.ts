import { MongoMemoryServer } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
// This starts a real mongod process with a persistent WiredTiger directory.
const dbPath = path.resolve(".data/mongodb");
const downloadDir = path.resolve(".data/mongodb-binaries");
await mkdir(dbPath, { recursive: true });
await mkdir(downloadDir, { recursive: true });
const db = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    dbName: "hirelens",
    launchTimeout: 60000,
    dbPath,
    storageEngine: "wiredTiger",
  },
  binary: { version: "7.0.24", downloadDir },
});
console.log(`Persistent local MongoDB ready: ${db.getUri("hirelens")}`);
console.log(
  "Development only. Keep this terminal open. Data is in .data/mongodb.",
);
// mongodb-memory-server unrefs its child processes. Keep this persistent local
// service alive until explicitly stopped, so its child cleanup does not run early.
const keepAlive = setInterval(() => {}, 60000);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    clearInterval(keepAlive);
    await db.stop({ doCleanup: false, force: false });
    process.exit(0);
  });
