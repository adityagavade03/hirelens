import { randomUUID } from "node:crypto";
import { ResourceLockModel } from "./models.js";
import { ApiError } from "./security.js";

// Shared Mongo leases serialize calendars and media quotas across API instances.
export async function withResources<T>(
  keys: string[],
  work: () => Promise<T>,
): Promise<T> {
  const token = randomUUID(),
    held: string[] = [];
  try {
    for (const key of [...new Set(keys)].sort()) {
      try {
        await ResourceLockModel.updateOne(
          { key },
          { $setOnInsert: { key } },
          { upsert: true },
        );
      } catch (e: any) {
        if (e.code !== 11000) throw e;
      }
      const lock = await ResourceLockModel.findOneAndUpdate(
        {
          key,
          $or: [{ until: { $exists: false } }, { until: { $lte: new Date() } }],
        },
        { $set: { token, until: new Date(Date.now() + 120000) } },
      );
      if (!lock)
        throw new ApiError(
          409,
          "Another update is in progress. Please retry shortly.",
        );
      held.push(key);
    }
    return await work();
  } finally {
    await ResourceLockModel.updateMany(
      { key: { $in: held }, token },
      { $unset: { token: 1, until: 1 } },
    );
  }
}
