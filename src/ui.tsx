import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useId,
  useState,
  type ReactNode,
  type FormEvent,
  type HTMLAttributes,
} from "react";
import {
  X,
  LoaderCircle,
  ArrowUpRight,
  Inbox,
  Check,
  AlertCircle,
} from "lucide-react";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        [
          "Selected",
          "published",
          "completed",
          "Shortlisted",
          "accepted",
          "live",
        ].includes(value)
          ? "green"
          : ["Rejected", "cancelled", "closed"].includes(value)
            ? "red"
            : ["Interview Scheduled", "scheduled", "Under Review"].includes(
                  value,
                )
              ? "amber"
              : "neutral"
      }
    >
      {value}
    </Badge>
  );
}
export function Avatar({
  name,
  size = "normal",
}: {
  name: string;
  size?: string;
}) {
  return (
    <span className={`avatar ${size} avatar-tone-${name.length % 4}`}>
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function ErrorBox({ message }: { message?: string }) {
  return message ? (
    <div role="alert" className="notice error">
      <AlertCircle size={18} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <AlertCircle size={18} />
      <span>{children}</span>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={24} /> Loading your workspace…
    </div>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const controls = Children.map(children, (child) => {
    if (
      !isValidElement<HTMLAttributes<HTMLElement>>(child) ||
      typeof child.type !== "string" ||
      !["input", "select", "textarea"].includes(child.type)
    )
      return child;
    const props = child.props;
    return cloneElement(child, {
      "aria-labelledby":
        props["aria-labelledby"] || (props["aria-label"] ? undefined : labelId),
      "aria-describedby":
        [props["aria-describedby"], hint ? hintId : undefined]
          .filter(Boolean)
          .join(" ") || undefined,
    });
  });
  return (
    <label className="field">
      <span id={labelId}>{label}</span>
      {controls}
      {hint && <small id={hintId}>{hint}</small>}
    </label>
  );
}
export function Submit({
  busy,
  children,
}: {
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className="btn primary"
      type="submit"
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{" "}
      {children}
    </button>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [closing, setClosing] = useState(false);
  function dismiss() {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    timer.current = setTimeout(onClose, 140);
  }
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    ref.current?.showModal();
    const dialog = ref.current;
    return () => {
      clearTimeout(timer.current);
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""} ${closing ? "closing" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={dismiss}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function LinkArrow() {
  return <ArrowUpRight size={17} />;
}
export const formObject = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget));
