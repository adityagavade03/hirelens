import { useCallback, useEffect, useState } from "react";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(!(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Cannot reach HireLens. Check that the API and database are running.",
      0,
    );
  }
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The server is unavailable. Start the API and database, then retry.",
      response.status,
    );
  }
  if (response.status === 401 && !path.startsWith("/auth/"))
    window.dispatchEvent(new Event("hirelens:session-expired"));
  if (!response.ok)
    throw new ApiError(
      typeof data?.error?.message === "string"
        ? data.error.message
        : "Request failed.",
      response.status,
      typeof data?.error?.code === "string" ? data.error.code : undefined,
    );
  return data;
}
export const send = <T>(path: string, body: unknown = {}, method = "POST") =>
  api<T>(path, { method, body: JSON.stringify(body) });
export function useResource<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setError("");
      setData(await api<T>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);
  return { data, setData, loading, error, reload };
}
export const csv = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  ),
];
export const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) => new Intl.DateTimeFormat("en-IN", options).format(new Date(value));
