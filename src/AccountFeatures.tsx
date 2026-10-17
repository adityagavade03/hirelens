import { ThemeToggle } from "./theme";
import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Brand } from "./App";
import { useAuth } from "./auth-context";
import { send, useResource } from "./api";
import { Panel, Field, Submit, ErrorBox, Notice, formObject } from "./ui";

export function AccountAccess() {
  const location = useLocation();
  const mode = location.pathname.split("/").pop();
  const [token] = useState(() => {
    const value =
      new URLSearchParams(location.hash.slice(1)).get("token") || "";
    window.history.replaceState(null, "", location.pathname);
    return value;
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const reset = mode === "reset-password",
    verify = mode === "verify-contact";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await send<{ message: string }>(`/auth/${mode}`, {
        ...formObject(e),
        ...(reset || verify ? { token } : {}),
      });
      setMessage(result.message);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Brand />
        <div className="auth-message">
          <h1>
            Your account.
            <br />
            <em>In your hands.</em>
          </h1>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-appearance">
          <ThemeToggle />
        </div>
        <div className="auth-form">
          <h1>
            {reset
              ? "Choose a new password"
              : verify
                ? "Verify your contact"
                : mode === "forgot-password"
                  ? "Reset your password"
                  : "Verify your email"}
          </h1>
          <ErrorBox message={error} />
          {message ? (
            <Notice>{message}</Notice>
          ) : (
            <form onSubmit={submit}>
              {(reset || verify) && !token && (
                <Notice>
                  This link is missing its token. Request a fresh link.
                </Notice>
              )}
              {!reset && !verify && (
                <Field label="Account email">
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </Field>
              )}
              {reset && (
                <>
                  <Field
                    label="New password"
                    hint="At least 10 characters; maximum 72 UTF-8 bytes."
                  >
                    <input
                      name="password"
                      type="password"
                      minLength={10}
                      maxLength={72}
                      required
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Confirm password">
                    <input
                      name="confirmPassword"
                      type="password"
                      required
                      autoComplete="new-password"
                    />
                  </Field>
                </>
              )}
              <Submit busy={busy}>
                {reset
                  ? "Save new password"
                  : verify
                    ? "Confirm verification"
                    : "Send link"}
              </Submit>
            </form>
          )}
          <Link className="text-link" to="/">
            Return to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}

export function AccountSecurityPanel() {
  const { user, refresh } = useAuth();
  const services = useResource<{ messagePreview?: boolean }>("/services", {});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function run(path: string, body?: object, method = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await send<{ message?: string }>(path, body, method);
      await refresh();
      setMessage(result.message || "Notification preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      title="Account security & notifications"
      description="Choose how you receive future recruitment updates."
    >
      <div className="panel-form">
        <ErrorBox message={error} />
        {message && <Notice>{message}</Notice>}
        {services.data.messagePreview && (
          <Notice>
            Local preview mode: messages are saved in the project’s
            .data/messages folder. No email or SMS is sent.
          </Notice>
        )}
        <p>
          {user.email} · {user.emailVerifiedAt ? "Verified" : "Not verified"}
        </p>
        {!user.emailVerifiedAt && (
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void run("/account/verify-email")}
          >
            Send email verification
          </button>
        )}
        <p>
          <Link className="text-link" to="/auth/forgot-password">
            Request password reset
          </Link>
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run("/account/verify-phone", formObject(e));
          }}
        >
          <Field
            label="SMS phone number"
            hint={
              user.phoneVerifiedAt
                ? `Verified number: ${user.notificationPhone}`
                : "Verify a number before enabling SMS."
            }
          >
            <input
              name="phone"
              type="tel"
              placeholder="+919876543210"
              defaultValue={user.notificationPhone}
              pattern="\+[1-9][0-9]{7,14}"
              required
            />
          </Field>
          <Submit busy={busy}>Send phone verification</Submit>
        </form>
        <form
          key={`${user.notificationEmail}-${user.notificationSms}-${user.emailVerifiedAt}-${user.phoneVerifiedAt}`}
          onSubmit={(e) => {
            e.preventDefault();
            const values = formObject(e);
            void run(
              "/account/notifications",
              { email: values.email === "on", sms: values.sms === "on" },
              "PATCH",
            );
          }}
        >
          <label className="checkbox-field">
            <input
              name="email"
              type="checkbox"
              disabled={!user.emailVerifiedAt}
              defaultChecked={user.notificationEmail}
            />{" "}
            Email recruitment updates
          </label>
          <label className="checkbox-field">
            <input
              name="sms"
              type="checkbox"
              disabled={!user.phoneVerifiedAt}
              defaultChecked={user.notificationSms}
            />{" "}
            SMS recruitment updates
          </label>
          <Submit busy={busy}>Save notification preferences</Submit>
        </form>
      </div>
    </Panel>
  );
}
