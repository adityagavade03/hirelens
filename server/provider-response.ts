// Provider responses are untrusted. Bound memory use before parsing JSON, and
// never include a response body in user-visible errors or application logs.
export async function readProviderJson(
  response: Response,
  maxBytes = 65536,
): Promise<unknown> {
  if (!response.body) throw new Error("Provider response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("Provider response is too large");
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
