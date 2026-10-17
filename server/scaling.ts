import { createClient } from "redis";
import { RedisStore } from "rate-limit-redis";
import { config } from "./config.js";
export const redis = config.redisUrl
  ? createClient({ url: config.redisUrl, socket: { connectTimeout: 5000 } })
  : undefined;
redis?.on("error", () =>
  console.error("Redis unavailable; distributed services are reconnecting."),
);
export async function connectScaling() {
  if (redis) await redis.connect();
}
export function rateStore(prefix: string) {
  return redis
    ? new RedisStore({
        prefix: `hirelens:limit:${prefix}:`,
        sendCommand: (...args: string[]) => redis.sendCommand(args),
      })
    : undefined;
}
