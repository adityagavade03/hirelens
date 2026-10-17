/** Browser permission prompts cannot be aborted; late streams must still be stopped. */
export function requestMedia(
  pending: Promise<MediaStream>,
  signal: AbortSignal,
  timeoutMs = 30000,
): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    };
    const fail = (name: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Media request did not complete", name));
    };
    const cancel = () => fail("AbortError");
    timer = setTimeout(() => fail("TimeoutError"), timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    pending.then(
      (stream) => {
        if (settled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        settled = true;
        cleanup();
        resolve(stream);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}
