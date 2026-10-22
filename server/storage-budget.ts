import mongoose from "mongoose";
import { config } from "./config.js";
import { withResources } from "./locks.js";
import { ApiError } from "./security.js";

// Reserve space for Mongoose metadata, index entries and allocation growth.
// The configured upload ceiling must also leave room for ordinary records.
const uploadOverheadBytes = 64 * 1024;

function size(value: unknown) {
  const number = mongoose.mongo.Long.isLong(value) ? value.toNumber() : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0)
    throw new Error("Invalid database storage statistics.");
  return number;
}

async function storageBytes() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database connection is unavailable.");
  if (config.storageBudgetScope === "atlas-cluster") {
    // Atlas Free limits all databases together, including uncompressed BSON
    // and indexes. Do not silently fall back to a narrower database statistic.
    const stats = await db.command({ atlasSize: 1 }, { timeoutMS: 5000 });
    if (stats.ok !== 1) throw new Error("Storage statistics are unavailable.");
    return size(stats.atlasSize);
  }
  const stats = await db.command({ dbStats: 1, scale: 1 }, { timeoutMS: 5000 });
  if (stats.ok !== 1) throw new Error("Storage statistics are unavailable.");
  return size(stats.dataSize) + size(stats.indexSize);
}

export async function withUploadStorage<T>(
  document: Record<string, unknown>,
  write: () => Promise<T>,
): Promise<T> {
  const budget = config.storageBudgetBytes;
  if (budget === undefined) return write();
  const incoming =
    mongoose.mongo.BSON.calculateObjectSize(document) + uploadOverheadBytes;
  // One shared lease covers recordings, all resume entry points and logos,
  // so simultaneous uploads cannot each spend the same available space.
  return withResources(["storage:uploads"], async () => {
    let used: number;
    try {
      used = await storageBytes();
    } catch {
      throw new ApiError(
        503,
        "Storage capacity could not be checked. This upload was not saved. Please retry shortly or contact the platform administrator.",
        "STORAGE_CHECK_UNAVAILABLE",
      );
    }
    if (!Number.isSafeInteger(used) || incoming > budget - used)
      throw new ApiError(
        507,
        "The platform's shared upload storage limit has been reached. This upload was not saved. Contact the platform administrator to review storage; existing files remain available.",
        "STORAGE_BUDGET_EXCEEDED",
      );
    return write();
  });
}
