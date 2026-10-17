import { useEffect, useRef, useState } from "react";

export function useDraftSync(
  active: boolean,
  code: string,
  language: string,
  connection: string,
  save: (code: string, language: string) => Promise<void>,
) {
  const [status, setStatus] = useState("");
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (!active) return;
    setStatus("Saving…");
    let current = true,
      inFlight = false,
      retries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (!current || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      void latest
        .current(code, language)
        .then(() => {
          if (current) setStatus("Saved · shared with interviewer");
        })
        .catch(() => {
          if (!current) return;
          setStatus("Waiting to sync · your code is kept in this tab");
          timer = setTimeout(attempt, Math.min(15000, 2000 * 2 ** retries++));
        })
        .finally(() => {
          inFlight = false;
        });
    };
    timer = setTimeout(attempt, 500);
    window.addEventListener("online", attempt);
    return () => {
      current = false;
      clearTimeout(timer);
      window.removeEventListener("online", attempt);
    };
  }, [active, code, language, connection]);
  return status;
}
