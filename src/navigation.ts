import { useEffect, useRef } from "react";

/** Keep an off-screen mobile navigation out of the tab order; trap focus while it is open. */
export function useNavigationDrawer(open: boolean, close: () => void) {
  const sidebar = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      if (sidebar.current) sidebar.current.inert = media.matches && !open;
      if (workspace.current) workspace.current.inert = media.matches && open;
      if (!media.matches && open) closeRef.current();
    };
    update();
    media.addEventListener("change", update);
    const previousOverflow = document.body.style.overflow;
    if (open && media.matches) {
      document.body.style.overflow = "hidden";
      sidebar.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    }
    const keydown = (event: KeyboardEvent) => {
      if (!open || !media.matches) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = [
          ...(sidebar.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), [tabindex="0"]',
          ) || []),
        ].filter((e) => e.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      if (workspace.current) workspace.current.inert = false;
      if (open && media.matches) trigger.current?.focus();
    };
  }, [open]);
  return { sidebar, workspace, trigger };
}
