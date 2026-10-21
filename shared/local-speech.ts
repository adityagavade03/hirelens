/** Selects only the installed local adapter; never exposes credentials. */
export function localSpeechSettings(baseUrl: string, requestedModel: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl || "http://127.0.0.1:8765/v1");
  } catch {
    throw new Error("The speech service URL is invalid.");
  }
  const local =
    endpoint.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (!local) return { local: false } as const;
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !/^\/v1\/?$/.test(endpoint.pathname)
  )
    throw new Error(
      "The local speech URL must end in /v1 without credentials or query parameters.",
    );
  const port = Number(endpoint.port || 80);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("The local speech port must be between 1024 and 65535.");
  const model = requestedModel || "base.en";
  if (!["base.en", "small"].includes(model))
    throw new Error(
      "The launcher supports installed base.en or small speech models. Start other configured adapters separately.",
    );
  return { local: true, port, model, language: "auto" } as const;
}
