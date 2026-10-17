import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectDatabase } from "./models.js";
import { attachRealtime } from "./realtime.js";
import { startDeliveryWorker } from "./delivery.js";
import { connectScaling, redis } from "./scaling.js";
import mongoose from "mongoose";
import { startScreeningWorker } from "./screening.js";
import { privatePreviewEnabled } from "./private-preview.js";
try {
  await connectDatabase(config.mongo);
  await connectScaling();
  const server = createServer(createApp());
  const io = attachRealtime(server);
  // A private preview shares local data; the normal instance owns background jobs.
  const stopDelivery = privatePreviewEnabled() ? () => {} : startDeliveryWorker();
  const stopScreening = privatePreviewEnabled() ? () => {} : startScreeningWorker();
  server.listen(config.port, config.host, () =>
    console.log(`HireLens API ready at http://localhost:${config.port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, async () => {
      stopDelivery();
      stopScreening();
      io.close();
      server.close();
      if (redis?.isOpen) await redis.quit();
      await mongoose.disconnect();
      process.exit(0);
    });
} catch (error) {
  console.error(
    "HireLens could not start. Check MONGODB_URI and run npm run db:local or docker compose up -d mongo.",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
