import { ThemeToggle } from "./theme";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Users,
  UserRound,
  ShieldCheck,
  Check,
  BriefcaseBusiness,
  Video,
  LockKeyhole,
} from "lucide-react";
import type { Company, Role, User } from "../shared/types";
import { Brand } from "./App";
import { send, useResource } from "./api";
import { Badge, Field, Submit, ErrorBox, Notice, formObject } from "./ui";
import { CompanyIdentityFields } from "./company-fields";

const entries = [
  {
    role: "company" as Role,
    title: "Company",
    icon: Building2,
    text: "Build your hiring team.",
    detail: "Create jobs, review candidates, and manage recruitment.",
    action: "Company workspace",
  },
  {
    role: "hr" as Role,
    title: "HR / Interviewer",
    icon: Users,
    text: "Bring great interviews to life.",
    detail: "Manage assigned roles, meet candidates, and share feedback.",
    action: "Interviewer workspace",
  },
  {
    role: "candidate" as Role,
    title: "Candidate",
    icon: UserRound,
    text: "Find your next opportunity.",
    detail: "Apply for jobs, track interviews, and practice your skills.",
    action: "Candidate workspace",
  },
];
type Otp = { challengeToken: string; expiresAt: string; destination: string };
type CompanyDetails = {
  companyName: string;
  officialEmail: string;
  registrationNumber: string;
  country: string;
  website: string;
  industry: string;
  companyType: string;
  address: string;
  phone: string;
  location: string;
};
export default function AuthPage({
  onLogin,
}: {
  onLogin: (user: User) => void;
}) {
  const navigate = useNavigate(),
    location = useLocation();
  const role = entries.find(
    (r) => location.pathname === `/auth/${r.role}`,
  )?.role;
  const entry = entries.find((r) => r.role === role);
  const options = useResource<{
    demo: boolean;
    companyVerification: boolean;
    companyOtp: boolean;
    email: boolean;
    localCompanyRegistration: boolean;
    messagePreview: boolean;
  } | null>("/auth/options", null);
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState("");
  const [verified, setVerified] = useState<{
    verificationToken: string;
    legalName: string;
    email: string;
  } | null>(null);
  const [otp, setOtp] = useState<Otp | null>(null);
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(
    null,
  );
  const [localCompany, setLocalCompany] = useState(false);
  const companyReady = !!verified || localCompany;
  const identityDefaults: Partial<Company> | undefined = companyDetails
    ? { ...companyDetails, name: companyDetails.companyName }
    : undefined;
  function reset() {
    setError("");
    setSuccess("");
    setVerified(null);
    setCompanyDetails(null);
    setLocalCompany(false);
    setOtp(null);
    setPassword("");
  }
  function select(role?: Role) {
    reset();
    setRegister(false);
    setIdentifier("");
    navigate(role ? `/auth/${role}` : "/");
  }
  async function verifyCompany(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e);
    const details = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, String(value).trim()]),
    ) as CompanyDetails;
    details.country = details.country.toUpperCase();
    details.officialEmail = details.officialEmail.toLowerCase();
    setCompanyDetails(details);
    const local =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
        "local" ||
      (!options.data?.companyVerification &&
        options.data?.localCompanyRegistration);
    setError("");
    setSuccess("");
    if (local && options.data?.localCompanyRegistration) {
      setVerified(null);
      setLocalCompany(true);
      setIdentifier(details.officialEmail);
      return;
    }
    if (!options.data?.companyVerification) return;
    setBusy(true);
    try {
      const result = await send<{
        verificationToken: string;
        legalName: string;
      }>("/auth/company/verify", details);
      setVerified({
        ...result,
        email: details.officialEmail,
      });
      setLocalCompany(false);
      setIdentifier(details.officialEmail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = formObject(e);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await send<
        {
          user?: User;
          registered?: boolean;
          otpRequired?: boolean;
          message?: string;
        } & Otp
      >(
        otp ? "/auth/otp/verify" : `/auth/${register ? "register" : "login"}`,
        otp
          ? { ...values, challengeToken: otp.challengeToken }
          : {
              ...values,
              identifier,
              email: register ? identifier : undefined,
              password,
              role,
              verificationToken: verified?.verificationToken,
              localCompanyDetails: localCompany ? companyDetails : undefined,
            },
      );
      if (result.otpRequired) {
        setOtp(result);
        setPassword("");
      } else if (result.registered) {
        setRegister(false);
        setVerified(null);
        setCompanyDetails(null);
        setLocalCompany(false);
        setPassword("");
        setSuccess(
          result.message || "Account registered. Sign in to continue.",
        );
      } else if (result.user) {
        onLogin(result.user);
        navigate(
          result.user.role === "company"
            ? "/company"
            : result.user.role === "hr"
              ? "/hr"
              : "/candidate",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`auth-page role-entry ${!role ? "entry-landing" : ""}`}>
      <aside className="auth-story">
        <Brand />
        <div className="auth-message">
          <div className="eyebrow light">
            <span className="tiny-dot" /> A CLEARER VIEW OF TALENT
          </div>
          <h1>
            Great people.
            <br />
            Meaningful interviews.
            <br />
            <em>Better possibilities.</em>
          </h1>
          <p>
            A connected workspace for the people hiring, the people
            interviewing, and the people taking their next step.
          </p>
          <div className="entry-proof">
            <span>
              <BriefcaseBusiness size={20} /> Recruitment, from start to finish
            </span>
            <span>
              <Video size={20} /> Conversations backed by evidence
            </span>
            <span>
              <ShieldCheck size={20} /> Clear roles. Human decisions.
            </span>
          </div>
        </div>
        <div className="auth-bottom">
          <span>Built around people.</span>
          <span>HireLens © 2026</span>
        </div>
        <div className="orb orb-one" />
        <div className="orb orb-two" />
      </aside>
      <main className="auth-main">
        <div className="auth-appearance">
          <ThemeToggle />
        </div>
        {!role ? (
          <div className="entry-content">
            <Badge tone="green">WELCOME TO HIRELENS</Badge>
            <h1>
              Your role.
              <br />
              Your next step.
            </h1>
            <p>Choose how you’ll use HireLens to open the right workspace.</p>
            <div className="entry-cards">
              {entries.map((e) => (
                <button
                  key={e.role}
                  className="entry-card"
                  onClick={() => select(e.role)}
                >
                  <span className="entry-icon">
                    <e.icon size={25} />
                  </span>
                  <span>
                    <strong>{e.title}</strong>
                    <b>{e.text}</b>
                    <small>{e.detail}</small>
                    <span className="entry-action">
                      {e.action} <ArrowRight size={16} />
                    </span>
                  </span>
                  <ArrowUpRight size={20} />
                </button>
              ))}
            </div>
            <p className="auth-footnote">
              <LockKeyhole size={14} /> Each role has its own secure workspace.
            </p>
          </div>
        ) : (
          <>
            <div className="auth-top">
              <button disabled={busy} onClick={() => select()}>
                <ArrowLeft size={15} /> All roles
              </button>
              <Badge tone="green">{entry?.title}</Badge>
            </div>
            <div
              className={`auth-form ${register && role === "company" && !companyReady ? "company-onboarding" : ""}`}
            >
              <div className="eyebrow">{entry?.action.toUpperCase()}</div>
              <h1>
                {otp
                  ? options.data?.messagePreview
                    ? "Check your local email preview."
                    : "Check your email."
                  : register
                    ? `${entry?.title} sign up`
                    : `${entry?.title} sign in`}
              </h1>
              <p>
                {otp
                  ? options.data?.messagePreview
                    ? `Enter the six-digit code in the local email preview for ${otp.destination}. It expires in 10 minutes.`
                    : `Enter the six-digit code sent to ${otp.destination}. It expires in 10 minutes.`
                  : register
                    ? role === "company"
                      ? options.data?.localCompanyRegistration
                        ? "Enter your company details, then create your administrator account. Local setup is available for testing."
                        : "Verify your company, then create your administrator account."
                      : "Create your account and take the next step."
                    : entry?.detail}
              </p>
              {!otp && (
                <div className="auth-tabs" role="group" aria-label="Account access">
                  <button
                    type="button"
                    disabled={busy}
                    className={!register ? "active" : ""}
                    aria-pressed={!register}
                    onClick={() => {
                      reset();
                      setRegister(false);
                    }}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={register ? "active" : ""}
                    aria-pressed={register}
                    onClick={() => {
                      reset();
                      setRegister(true);
                    }}
                  >
                    Sign up
                  </button>
                </div>
              )}
              {!register && !otp && (
                <div className="form-actions">
                  <Link className="text-link" to="/auth/forgot-password">
                    Forgot password?
                  </Link>
                  <Link className="text-link" to="/auth/resend-verification">
                    Resend verification
                  </Link>
                </div>
              )}
              <ErrorBox message={error || options.error} />
              {success && (
                <div role="status" className="notice success">
                  <Check size={18} />
                  {success}
                </div>
              )}
              {register && role === "company" && !companyReady ? (
                <form key="company-identity" onSubmit={verifyCompany}>
                  <div className="onboarding-steps">
                    <strong>01 · Company details</strong>
                    <span>02 · Create account</span>
                  </div>
                  {options.data?.localCompanyRegistration ? (
                    <Notice>
                      Local setup creates an unverified company for testing on
                      this computer. You can test job publishing and
                      recruitment. Official verification is required before
                      public use.
                    </Notice>
                  ) : (
                    options.data &&
                    !options.data.companyVerification && (
                      <Notice>
                        New company registration will be available when the
                        administrator connects the company verification service.
                      </Notice>
                    )
                  )}
                  <CompanyIdentityFields company={identityDefaults} />
                  <div className="form-actions">
                    {options.data?.companyVerification && (
                      <Submit busy={busy}>Verify company & continue</Submit>
                    )}
                    {options.data?.localCompanyRegistration && (
                      <button
                        type="submit"
                        value="local"
                        className={`btn ${options.data.companyVerification ? "secondary" : "primary"}`}
                        disabled={busy}
                      >
                        Continue with local setup <ArrowRight size={17} />
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <form key={otp ? "otp" : "account"} onSubmit={submit}>
                  {otp ? (
                    <>
                      {options.data?.messagePreview && (
                        <Notice>
                          Email delivery is in local preview mode. Open the
                          newest email file in the project’s{" "}
                          <code>.data/messages</code> folder and use its sign-in
                          code. No email was sent to your inbox.
                        </Notice>
                      )}
                      <Field
                        label="Verification code"
                        hint="Five attempts maximum. Never share your sign-in code."
                      >
                        <input
                          name="code"
                          required
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          minLength={6}
                          maxLength={6}
                          autoComplete="one-time-code"
                          className="otp-input"
                          autoFocus
                        />
                      </Field>
                      <Submit busy={busy}>Verify & sign in</Submit>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="text-link"
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              setOtp(
                                await send<Otp>("/auth/otp/resend", {
                                  challengeToken: otp.challengeToken,
                                }),
                              );
                              setSuccess(
                                options.data?.messagePreview
                                  ? "A new local email preview was saved in .data/messages. The previous code is no longer valid."
                                  : "A new code has been sent. The previous code is no longer valid.",
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Resend code
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            reset();
                          }}
                        >
                          Back to sign in
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {verified && (
                        <div className="notice success">
                          <ShieldCheck size={18} />
                          <span>
                            <strong>{verified.legalName}</strong>
                            <br />
                            Company verified. Complete your account within 15
                            minutes.
                          </span>
                        </div>
                      )}
                      {register && localCompany && (
                        <Notice>
                          <strong>{companyDetails?.companyName}</strong>
                          <br />
                          Local development company · unverified. Create your
                          account to test recruitment on this computer.
                        </Notice>
                      )}
                      {register && role === "company" && companyReady && (
                        <div className="form-actions">
                          <button
                            type="button"
                            className="text-link"
                            disabled={busy}
                            onClick={() => {
                              setVerified(null);
                              setLocalCompany(false);
                              setError("");
                              setPassword("");
                            }}
                          >
                            <ArrowLeft size={15} /> Edit company details
                          </button>
                        </div>
                      )}
                      {register && (
                        <>
                          <Field
                            label={
                              role === "company"
                                ? "Authorized recruiter / administrator name"
                                : "Full name"
                            }
                          >
                            <input
                              name="name"
                              required
                              minLength={2}
                              maxLength={100}
                              autoComplete="name"
                            />
                          </Field>
                          {role === "company" && (
                            <Field
                              label="Username"
                              hint="3–40 letters, numbers, dots, underscores or hyphens."
                            >
                              <input
                                name="username"
                                required
                                minLength={3}
                                maxLength={40}
                                pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,39}"
                                autoComplete="username"
                              />
                            </Field>
                          )}
                        </>
                      )}
                      <Field
                        label={
                          register
                            ? role === "company"
                              ? localCompany
                                ? "Official company email"
                                : "Verified company email"
                              : "Email address"
                            : "Email or username"
                        }
                      >
                        <input
                          type={register ? "email" : "text"}
                          required
                          maxLength={254}
                          value={identifier}
                          readOnly={
                            register && role === "company" && companyReady
                          }
                          onChange={(e) => setIdentifier(e.target.value)}
                          autoComplete={register ? "email" : "username"}
                        />
                      </Field>
                      <Field
                        label="Password"
                        hint={
                          register
                            ? "At least 10 characters; up to 72 bytes."
                            : undefined
                        }
                      >
                        <input
                          type="password"
                          required
                          minLength={register ? 10 : 1}
                          maxLength={72}
                          autoComplete={
                            register ? "new-password" : "current-password"
                          }
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </Field>
                      {register && (
                        <Field label="Confirm password">
                          <input
                            type="password"
                            name="confirmPassword"
                            required
                            minLength={10}
                            maxLength={72}
                            autoComplete="new-password"
                          />
                        </Field>
                      )}
                      {register && role === "hr" && (
                        <Notice>
                          After registration, accept your company’s invitation
                          from Hiring team to access assigned recruitment work.
                        </Notice>
                      )}
                      {!register &&
                        role === "company" &&
                        options.data?.companyOtp && (
                          <p className="auth-footnote">
                            <ShieldCheck size={14} /> Company sign-in includes
                            {options.data.messagePreview
                              ? " a code saved in your local email preview."
                              : " an email verification code."}
                          </p>
                        )}
                      <button
                        className="btn primary auth-submit"
                        disabled={busy}
                      >
                        {busy
                          ? "Please wait…"
                          : register
                            ? "Create account"
                            : `Sign in as ${entry?.title}`}
                        <ArrowRight size={17} />
                      </button>
                    </>
                  )}
                </form>
              )}
              {!register && !otp && options.data?.demo && (
                <details className="demo-box">
                  <summary>
                    Explore the {entry?.title.toLowerCase()} demo
                  </summary>
                  <p>
                    Sample records for a local demonstration. Sample company
                    sign-in skips email verification.
                  </p>
                  <button
                    className="text-link"
                    onClick={() => {
                      setIdentifier(`${role}@demo.hirelens.local`);
                      setPassword("HireLensDemo!2026");
                      setError("");
                    }}
                  >
                    Use sample credentials <ArrowUpRight size={14} />
                  </button>
                </details>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
