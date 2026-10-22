import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../server/config";
import {
  parseStorageBudget,
  parseStorageScope,
} from "../server/storage-budget-configuration";
import { withUploadStorage } from "../server/storage-budget";
import { withResources } from "../server/locks";

vi.mock("../server/locks", () => ({
  withResources: vi.fn(async (_keys, work) => work()),
}));

const original = { ...config };
const originalDatabase = mongoose.connection.db;
afterEach(() => {
  Object.assign(config, original);
  (mongoose.connection as any).db = originalDatabase;
  vi.clearAllMocks();
});

function statistics(result: Record<string, unknown>) {
  const command = vi.fn().mockResolvedValue(result);
  (mongoose.connection as any).db = { command };
  config.storageBudgetBytes = 2 * 1024 * 1024;
  config.storageBudgetScope = "database";
  return command;
}

describe("optional upload storage budget", () => {
  it("keeps the guard inactive unless explicitly configured and rejects malformed limits", () => {
    expect(parseStorageBudget(undefined)).toBeUndefined();
    expect(parseStorageBudget("")).toBeUndefined();
    expect(parseStorageBudget("400")).toBe(400 * 1024 * 1024);
    for (const value of [
      "0",
      "-1",
      "1.5",
      "400 MB",
      " 400",
      "NaN",
      "999999999999999999",
    ])
      expect(() => parseStorageBudget(value)).toThrow("STORAGE_BUDGET_MB");
    expect(parseStorageScope(undefined)).toBe("database");
    expect(parseStorageScope("atlas-cluster")).toBe("atlas-cluster");
    expect(() => parseStorageScope("cluster")).toThrow("STORAGE_BUDGET_SCOPE");
  });

  it("preserves local uploads without performing storage checks when disabled", async () => {
    const command = statistics({ ok: 1, dataSize: 99999999, indexSize: 0 });
    config.storageBudgetBytes = undefined;
    const write = vi.fn().mockResolvedValue("saved");
    expect(await withUploadStorage({ data: Buffer.alloc(32) }, write)).toBe(
      "saved",
    );
    expect(command).not.toHaveBeenCalled();
    expect(withResources).not.toHaveBeenCalled();
  });

  it("counts indexes and BSON text as well as the uploaded buffer before saving", async () => {
    statistics({
      ok: 1,
      dataSize: 0.75 * 1024 * 1024,
      indexSize: 0.75 * 1024 * 1024,
    });
    const write = vi.fn();
    await expect(
      withUploadStorage(
        { data: Buffer.alloc(100), text: "x".repeat(512 * 1024) },
        write,
      ),
    ).rejects.toMatchObject({ status: 507, code: "STORAGE_BUDGET_EXCEEDED" });
    expect(write).not.toHaveBeenCalled();
  });

  it("reads Atlas cluster-wide usage and never falls back to one database", async () => {
    const command = statistics({
      ok: 1,
      atlasSize: mongoose.mongo.Long.fromNumber(2 * 1024 * 1024),
    });
    config.storageBudgetScope = "atlas-cluster";
    const write = vi.fn();
    await expect(
      withUploadStorage({ data: Buffer.alloc(32) }, write),
    ).rejects.toMatchObject({
      code: "STORAGE_BUDGET_EXCEEDED",
    });
    expect(command).toHaveBeenCalledExactlyOnceWith(
      { atlasSize: 1 },
      { timeoutMS: 5000 },
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("uses one shared lease for the capacity check and the completed write", async () => {
    const command = statistics({ ok: 1, dataSize: 1000, indexSize: 1000 });
    const write = vi.fn().mockResolvedValue({ id: "saved" });
    expect(await withUploadStorage({ data: Buffer.alloc(32) }, write)).toEqual({
      id: "saved",
    });
    expect(withResources).toHaveBeenCalledWith(
      ["storage:uploads"],
      expect.any(Function),
    );
    expect(command).toHaveBeenCalledBefore(write);
  });

  it("fails safely on unavailable or malformed statistics without leaking database errors", async () => {
    const command = statistics({ ok: 1 });
    config.storageBudgetScope = "atlas-cluster";
    const write = vi.fn();
    for (const response of [
      { ok: 1 },
      { ok: 1, atlasSize: -1 },
      { ok: 1, atlasSize: "123" },
      { ok: 0, atlasSize: 0 },
    ]) {
      command.mockResolvedValueOnce(response);
      await expect(
        withUploadStorage({ data: Buffer.alloc(32) }, write),
      ).rejects.toMatchObject({
        status: 503,
        code: "STORAGE_CHECK_UNAVAILABLE",
      });
    }
    command.mockRejectedValueOnce(new Error("private-database-hostname"));
    await expect(withUploadStorage({}, write)).rejects.toThrow(
      "Storage capacity could not be checked. This upload was not saved.",
    );
    expect(command).toHaveBeenCalledTimes(5);
    expect(write).not.toHaveBeenCalled();
  });
});
