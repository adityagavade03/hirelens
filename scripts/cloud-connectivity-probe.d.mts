export interface CloudAiAttempt {
  attempt: number;
  providerStatus: number | null;
  category: "passed" | "json_validate_failed" | "other";
  passed: boolean;
}
export function publicPracticeCloudProbe(options: {
  enabled: boolean;
  publicDemo: boolean;
  configured: boolean;
  call: (
    language: string,
    source: string,
    tests: { input: string; output: string; hidden: boolean }[],
    context: "diagnostic",
  ) => Promise<unknown>;
}): Promise<{
  status: "not-requested" | "executed";
  language?: string;
  syntheticOnly?: boolean;
}>;
export function strictCloudAiProbe(options: {
  strict: boolean;
  call: (timeoutMilliseconds: number) => Promise<unknown>;
  latestFailure: () => { status?: number | null; code?: unknown };
  onAttempt?: (entry: CloudAiAttempt) => void;
  pause?: (milliseconds: number) => Promise<unknown>;
}): Promise<{ status: "ok"; attempts: CloudAiAttempt[] }>;
