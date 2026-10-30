export interface CloudAiAttempt {
  attempt: number;
  providerStatus: number | null;
  category: "passed" | "json_validate_failed" | "other";
  passed: boolean;
}
export function strictCloudAiProbe(options: {
  strict: boolean;
  call: (timeoutMilliseconds: number) => Promise<unknown>;
  latestFailure: () => { status?: number | null; code?: unknown };
  onAttempt?: (entry: CloudAiAttempt) => void;
  pause?: (milliseconds: number) => Promise<unknown>;
}): Promise<{ status: "ok"; attempts: CloudAiAttempt[] }>;
