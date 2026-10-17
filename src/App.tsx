import { ThemeToggle } from "./theme";
import { useNavigationDrawer } from "./navigation";
import { useState, useEffect, lazy, Suspense, type FormEvent } from "react";
import {
  Routes,
  Route,
  NavLink,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  LayoutDashboard,
  BriefcaseBusiness,
  Users,
  Video,
  CalendarDays,
  FileText,
  UserRound,
  Settings2,
  LogOut,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  Plus,
  Sparkles,
  Bell,
  Search,
  Menu,
  Command,
  Check,
  Code2,
  MoveUpRight,
  BookOpen,
  ShieldCheck,
  PanelLeftClose,
  AudioLines,
} from "lucide-react";
import type {
  User,
  Role,
  Application,
  Interview,
  Job,
  Notification,
  ServiceStatus,
} from "../shared/types";
import { api, send, useResource, dateLabel } from "./api";
import {
  Avatar,
  Badge,
  Status,
  ErrorBox,
  Loading,
  Empty,
  PageTitle,
  Panel,
  Field,
  Submit,
  Notice,
} from "./ui";
import {
  JobsPage,
  ApplicationsPage,
  InterviewsPage,
  PracticePage,
} from "./workflows";
import {
  ProfilePage,
  TeamPage,
  ReportsPage,
  ReportPage,
  SettingsPage,
} from "./management";
import { AccountAccess } from "./AccountFeatures";
import { GovernancePage } from "./Governance";
import { CodingLibrary } from "./CodingLibrary";
import AuthPage from "./AuthPage";
import {
  CompanyDashboard,
  CompanyProfilePage,
  InterviewersPage,
  AssignmentsPage,
  NotificationsPage,
  HrRequestsSummary,
} from "./company";
import { JobDetailsPage } from "./recruitment";
import { AuthContext, useAuth } from "./auth-context";
import { AppErrorBoundary } from "./AppErrorBoundary";
import { HrAvailabilityPanel } from "./HrWorkload";
const Room = lazy(() => import("./Room"));
export default function App() {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={location.pathname}>
      <AppContent />
    </AppErrorBoundary>
  );
}
function AppContent() {
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = async () => {
    const result = await api<{ user: User }>("/auth/me");
    setUser(result.user);
  };
  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener("hirelens:session-expired", expired);
    refresh()
      .catch(() => setUser(null))
      .finally(() => setReady(true));
    return () =>
      window.removeEventListener("hirelens:session-expired", expired);
  }, []);
  const logout = async () => {
    await send("/auth/logout");
    setUser(null);
  };
  if (
    [
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/verify-contact",
      "/auth/resend-verification",
    ].includes(location.pathname)
  )
    return <AccountAccess key={location.pathname} />;
  if (!ready) return <Loading />;
  if (!user) return <AuthPage key={location.pathname} onLogin={setUser} />;
  return (
    <AuthContext.Provider value={{ user, refresh, logout }}>
      <Routes>
        <Route
          path="/room/:id"
          element={
            <Suspense fallback={<Loading />}>
              {user.role === "company" ? (
                <Navigate to="/interviews" replace />
              ) : (
                <Room />
              )}
            </Suspense>
          }
        />
        <Route path="/*" element={<Shell />} />
      </Routes>
    </AuthContext.Provider>
  );
}
export function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        h<span />
      </span>
      <span>
        hirelens<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
const sharedNavs = [
  { to: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { to: "/applications", label: "Applications", icon: Users },
  { to: "/interviews", label: "Interviews", icon: Video },
  { to: "/reports", label: "Reports & feedback", icon: FileText },
];
const roleNavs = {
  company: [
    { to: "/company", label: "Company overview", icon: LayoutDashboard },
    {
      to: "/company/profile",
      label: "Company profile",
      icon: BriefcaseBusiness,
    },
    { to: "/jobs/new", label: "Create job", icon: Plus },
    ...sharedNavs.map((n) =>
      n.to === "/jobs" ? { ...n, label: "Manage jobs" } : n,
    ),
    { to: "/interviewers", label: "HR & assignments", icon: UserRound },
    { to: "/team", label: "Team invitations", icon: Users },
    { to: "/notifications", label: "Notifications", icon: Bell },
  ],
  hr: [
    { to: "/hr", label: "Interviewer overview", icon: LayoutDashboard },
    { to: "/assignments", label: "My assignments", icon: BriefcaseBusiness },
    ...sharedNavs.map((n) =>
      n.to === "/jobs" ? { ...n, label: "Assigned jobs" } : n,
    ),
    { to: "/team", label: "Hiring team", icon: Users },
  ],
  candidate: [
    { to: "/candidate", label: "My overview", icon: LayoutDashboard },
    { to: "/profile", label: "Resume & profile", icon: FileText },
    ...sharedNavs.map((n) =>
      n.to === "/jobs" ? { ...n, label: "Explore jobs" } : n,
    ),
    { to: "/practice", label: "Practice studio", icon: Sparkles },
  ],
};
function RolePage({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  return user.role === role ? (
    children
  ) : (
    <Empty
      title="This page belongs to another role"
      detail={`You’re signed in as ${user.role}. Open your workspace to continue.`}
      action={
        <Link className="btn primary" to="/">
          Open my workspace
        </Link>
      }
    />
  );
}
function Shell() {
  const { user, logout } = useAuth();
  const navs = roleNavs[user.role];
  const [mobile, setMobile] = useState(false);
  const drawer = useNavigationDrawer(mobile, () => setMobile(false));
  const [notifications, setNotifications] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const notice = useResource<Notification[]>("/notifications", []);
  const location = useLocation();
  useEffect(() => {
    setMobile(false);
    setNotifications(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const unread = notice.data.filter((n) => !n.read).length;
  const page =
    navs.find((n) => n.to === location.pathname)?.label ||
    (location.pathname === "/profile" ? "My profile" : "Workspace");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside
        id="workspace-navigation"
        aria-label="Workspace navigation"
        ref={drawer.sidebar}
        className={`sidebar ${mobile ? "open" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") setMobile(false);
        }}
      >
        <button
          type="button"
          className="icon-button drawer-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <PanelLeftClose size={20} />
        </button>
        <Brand />
        <button
          className="workspace-switch"
          onClick={() =>
            window.location.assign(
              user.role === "candidate"
                ? "/profile"
                : user.role === "company"
                  ? "/company/profile"
                  : "/team",
            )
          }
        >
          <span className="workspace-logo">
            {user.role === "candidate" ? (
              <UserRound size={17} />
            ) : (
              <BriefcaseBusiness size={17} />
            )}
          </span>
          <span>
            <strong>
              {user.role === "candidate"
                ? "My workspace"
                : user.role === "company"
                  ? "Company workspace"
                  : "Interviewer workspace"}
            </strong>
            <small>
              {user.role === "company"
                ? "Company administrator"
                : user.role === "hr"
                  ? "HR & interviewer"
                  : "Candidate account"}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navs.map((n) => (
            <NavLink key={n.to} to={n.to} end>
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.to === "/practice" && <span className="nav-new">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={18} />
            </span>
            <strong>
              {user.role === "candidate"
                ? "A little practice. A big difference."
                : "Potential deserves a closer look."}
            </strong>
            <p>
              {user.role === "candidate"
                ? "Build confidence, one conversation at a time."
                : "Bring skills and evidence into every hiring conversation."}
            </p>
            <Link to={user.role === "candidate" ? "/practice" : "/jobs"}>
              {user.role === "candidate"
                ? "Open practice studio"
                : "Explore your jobs"}{" "}
              <ArrowRight size={15} />
            </Link>
          </div>
          <NavLink to="/settings" className="bottom-nav">
            <Settings2 size={18} /> Settings & integrations
          </NavLink>
          <NavLink to="/profile" className="user-card">
            <Avatar name={user.name} />
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "hr"
                  ? "Interviewer"
                  : user.role[0].toUpperCase() + user.role.slice(1)}
              </small>
            </span>
            <ChevronDown size={14} />
          </NavLink>
          <button
            className="bottom-nav mobile-signout"
            onClick={() => logout().catch((e) => setLogoutError(e.message))}
          >
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-shade"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace-main" ref={drawer.workspace}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              ref={drawer.trigger}
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="workspace-navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            {user.sample && <Badge tone="amber">Sample workspace</Badge>}
            <span className="today">
              {new Intl.DateTimeFormat("en-IN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }).format(new Date())}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              aria-expanded={notifications}
              aria-controls="notification-popover"
              onClick={() => {
                setNotifications(!notifications);
                void notice.reload();
              }}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <span className="top-divider" />
            <Avatar name={user.name} size="small" />
            <button
              className="icon-button logout"
              aria-label="Sign out"
              onClick={() => logout().catch((e) => setLogoutError(e.message))}
            >
              <LogOut size={17} />
            </button>
          </div>
          {notifications && (
            <div
              id="notification-popover"
              className="notification-popover"
              role="region"
              aria-label="Notifications"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNotifications(false);
                  document
                    .querySelector<HTMLButtonElement>(".notification-button")
                    ?.focus();
                }
              }}
            >
              <div className="panel-heading">
                <h2>Notifications</h2>
                <button
                  className="icon-button"
                  aria-label="Close notifications"
                  onClick={() => setNotifications(false)}
                >
                  ×
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    send("/notifications/read", {}, "PATCH")
                      .then(() => notice.reload())
                      .catch((e) => setLogoutError(e.message))
                  }
                >
                  Mark read
                </button>
              </div>
              {notice.error && <ErrorBox message={notice.error} />}{" "}
              {notice.data.length ? (
                notice.data.slice(0, 8).map((n) => (
                  <Link
                    to={n.href}
                    onClick={() => setNotifications(false)}
                    key={n._id}
                    className={n.read ? "" : "unread"}
                  >
                    {n.message}
                    <small>{dateLabel(n.createdAt)}</small>
                  </Link>
                ))
              ) : (
                <p>You’re all caught up.</p>
              )}
            </div>
          )}
        </header>
        <main id="main-content" tabIndex={-1} className="page-content">
          <div className="page-transition" key={location.pathname}>
            <ErrorBox message={logoutError} />
            <Routes>
              <Route
                path="/"
                element={
                  <Navigate
                    to={
                      user.role === "company"
                        ? "/company"
                        : user.role === "hr"
                          ? "/hr"
                          : "/candidate"
                    }
                    replace
                  />
                }
              />
              <Route
                path="/company"
                element={
                  <RolePage role="company">
                    <CompanyDashboard />
                  </RolePage>
                }
              />
              <Route
                path="/company/profile"
                element={
                  <RolePage role="company">
                    <CompanyProfilePage />
                  </RolePage>
                }
              />
              <Route
                path="/hr"
                element={
                  <RolePage role="hr">
                    <Dashboard />
                  </RolePage>
                }
              />
              <Route
                path="/candidate"
                element={
                  <RolePage role="candidate">
                    <Dashboard />
                  </RolePage>
                }
              />
              <Route
                path="/interviewers"
                element={
                  <RolePage role="company">
                    <InterviewersPage />
                  </RolePage>
                }
              />
              <Route
                path="/assignments"
                element={
                  <RolePage role="hr">
                    <AssignmentsPage />
                  </RolePage>
                }
              />
              <Route
                path="/jobs/new"
                element={
                  <RolePage role="company">
                    <JobsPage create />
                  </RolePage>
                }
              />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route
                path="/jobs/:id"
                element={
                  user.role === "candidate" ? (
                    <Navigate to="/jobs" replace />
                  ) : (
                    <JobDetailsPage />
                  )
                }
              />
              <Route path="/applications" element={<ApplicationsPage />} />
              <Route path="/interviews" element={<InterviewsPage />} />
              <Route
                path="/practice"
                element={
                  user.role === "candidate" ? (
                    <PracticePage />
                  ) : (
                    <Navigate to="/" />
                  )
                }
              />
              <Route path="/profile" element={<ProfilePage />} />
              <Route
                path="/team"
                element={
                  user.role !== "candidate" ? <TeamPage /> : <Navigate to="/" />
                }
              />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:id" element={<ReportPage />} />
              <Route
                path="/governance"
                element={
                  user.role === "company" ? (
                    <GovernancePage />
                  ) : (
                    <Navigate to="/" />
                  )
                }
              />
              <Route
                path="/coding-library"
                element={
                  user.role === "candidate" ? (
                    <Navigate to="/" />
                  ) : (
                    <CodingLibrary />
                  )
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </div>
          <footer className="workspace-footer">
            <span>Thoughtful hiring starts with a conversation.</span>
            <span>
              HireLens <span className="footer-dot">●</span> Built around people
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Dashboard() {
  const { user } = useAuth();
  const applicationResource = useResource<Application[]>("/applications", []);
  const apps = {...applicationResource, data: applicationResource.data.filter(a => user.role === "candidate" || a.assignedHrId === user._id)};
  const interviews = useResource<Interview[]>("/interviews", []);
  const jobs = useResource<Job[]>("/jobs", []);
  const candidate = user.role === "candidate";
  const upcoming = interviews.data.filter(
    (i) => ["scheduled", "live"].includes(i.status) && i.type !== "practice",
  );
  const practice = interviews.data.filter((i) => i.type === "practice");
  const completed = interviews.data.filter(
    (i) => i.status === "completed",
  ).length;
  const activeJobs = jobs.data.filter((j) => j.status === "published").length;
  const cards = candidate
    ? [
        {
          title: "My applications",
          value: apps.data.length,
          icon: BriefcaseBusiness,
          sub: "Your next opportunities",
          color: "green",
        },
        {
          title: "Upcoming interviews",
          value: upcoming.length,
          icon: Video,
          sub: "Conversations ahead",
          color: "purple",
        },
        {
          title: "Practice sessions",
          value: practice.length,
          icon: Code2,
          sub: "Every session is a step forward",
          color: "orange",
        },
        {
          title: "Completed interviews",
          value: completed,
          icon: Check,
          sub: "Experience you can build on",
          color: "blue",
        },
      ]
    : [
        {
          title: "Active jobs",
          value: activeJobs,
          icon: BriefcaseBusiness,
          sub: "Open for new possibilities",
          color: "green",
        },
        {
          title: "Assigned candidates",
          value: apps.data.length,
          icon: Users,
          sub: "People in your pipeline",
          color: "purple",
        },
        {
          title: "Upcoming interviews",
          value: upcoming.length,
          icon: Video,
          sub: "Conversations ahead",
          color: "orange",
        },
        {
          title: "Candidates selected",
          value: apps.data.filter((a) => a.status === "Selected").length,
          icon: Check,
          sub: "Decisions made by your team",
          color: "blue",
        },
      ];
  const loading = apps.loading || interviews.loading || jobs.loading;
  return (
    <>
      <PageTitle
        eyebrow={candidate ? "YOUR CAREER, IN FOCUS" : "YOUR HIRING, IN FOCUS"}
        title={`A fresh perspective, ${user.name.split(" ")[0]}.`}
        description={
          candidate
            ? "A little preparation today. A world of possibilities tomorrow."
            : "Here’s what’s happening in your hiring workspace."
        }
        action={
          <Link className="btn primary" to={candidate ? "/practice" : "/jobs"}>
            <Plus size={17} />
            {candidate ? "Start practicing" : "View assigned jobs"}
          </Link>
        }
      />
      <ErrorBox message={apps.error || interviews.error || jobs.error} />
      <div className="stats-grid">
        {cards.map((c) => (
          <div className="stat-card" key={c.title}>
            <div className="stat-top">
              <span>{c.title}</span>
              <span className={`stat-icon ${c.color}`}>
                <c.icon size={18} />
              </span>
            </div>
            <strong className="stat-value">
              {loading ? "—" : c.value.toString().padStart(2, "0")}
            </strong>
            <small>{c.sub}</small>
          </div>
        ))}
      </div>
      {!candidate && <HrRequestsSummary />}
      {!candidate && <HrAvailabilityPanel />}
      {candidate && <Panel title="Application progress" description="Your submitted resume, AI screening result and next interview step." action={<Link className="text-link" to="/applications">View all applications</Link>}>
        <div className="panel-form">
          {apps.loading ? <Loading /> : apps.data.length ? apps.data.slice(0, 5).map(a => {
            const appointment = upcoming.find(i => i.applicationId === a._id);
            return <div className="evidence" key={a._id}>
              <h3>{a.jobTitle} · {a.companyName}</h3>
              <p><Status value={a.status} /> · AI match: <strong>{a.match.score == null ? "Awaiting screening" : `${a.match.score}%`}</strong></p>
              {a.screening?.state === "completed" && <p>{a.status === "Shortlisted" ? "You have been shortlisted for the next stage." : a.screening.outcome === "not_shortlisted" && a.status === "Rejected" ? "Your resume does not currently meet the required matching threshold." : `Original AI result: ${a.screening.outcome === "shortlisted" ? "match threshold met" : a.screening.outcome === "not_shortlisted" ? "below the matching threshold" : "further review needed"}. Current stage: ${a.status}.`}</p>}
              {!!a.match.matching.length && <p><strong>Matched skills:</strong> {a.match.matching.join(", ")}</p>}
              {!!a.match.missing.length && <p><strong>Missing or partial evidence:</strong> {a.match.missing.join(", ")}</p>}
              {a.assignedHrId ? <p><strong>Assigned HR:</strong> {a.assignedHrName || "Hiring team interviewer"}</p> : a.status === "Shortlisted" ? <p>Shortlisted — waiting for an available HR interviewer.</p> : null}
              {appointment && <p>{dateLabel(appointment.scheduledAt)} · {appointment.mode === "in_person" ? `In person: ${appointment.venue}` : "Video interview"} · <Link className="text-link" to={`/room/${appointment._id}`}>View interview</Link></p>}
            </div>;
          }) : <Empty title="No applications yet" detail="Choose a job and review your application details to apply." />}
        </div>
      </Panel>}
      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <section className="feature-banner">
            <div className="feature-copy">
              <div className="eyebrow">
                <span className="tiny-dot" />
                {candidate
                  ? "MEET YOUR NEXT CHAPTER"
                  : "MAKE EVERY CONVERSATION COUNT"}
              </div>
              <h2>
                {candidate ? (
                  <>
                    Your next interview.
                    <br />
                    Your best version.
                  </>
                ) : (
                  <>
                    Find the person.
                    <br />
                    Beyond the résumé.
                  </>
                )}
              </h2>
              <p>
                {candidate
                  ? "Practice real questions, sharpen your code, and turn feedback into your next advantage."
                  : "Bring technical interviews, coding, and meaningful feedback together in one thoughtful workspace."}
              </p>
              <Link
                className="btn dark"
                to={candidate ? "/practice" : "/interviews"}
              >
                {candidate
                  ? "Enter the practice studio"
                  : "Open interview workspace"}
                <ArrowUpRight size={17} />
              </Link>
              <div className="feature-caption">
                <ShieldCheck size={14} />{" "}
                {candidate
                  ? "Your personal space to learn and grow"
                  : "AI-assisted insights. Human-led decisions."}
              </div>
            </div>
            <div className="feature-illustration" aria-hidden="true">
              <div className="orbit-ring ring-one" />
              <div className="orbit-ring ring-two" />
              <div className="orbit-ring ring-three" />
              <div className="floating-tag tag-code">
                <Code2 size={17} /> Skills in focus <span>✧</span>
              </div>
              <div className="interview-art">
                <div className="art-top">
                  <span className="tiny-dot" /> A great conversation
                </div>
                <div className="art-people">
                  <div className="art-person person-one">
                    <div className="head" />
                    <div className="body" />
                  </div>
                  <div className="art-person person-two">
                    <div className="head" />
                    <div className="body" />
                  </div>
                </div>
                <div className="art-wave">
                  {Array.from({ length: 22 }, (_, i) => (
                    <i
                      key={i}
                      style={{ height: `${8 + Math.sin(i * 1.8) ** 2 * 23}px` }}
                    />
                  ))}
                </div>
              </div>
              <div className="floating-tag tag-feedback">
                <span className="feedback-check">
                  <Check size={15} />
                </span>{" "}
                Potential, recognized.
              </div>
              <span className="art-sparkle">✳</span>
            </div>
          </section>
          <Panel
            title={
              candidate ? "Your next conversations" : "Upcoming interviews"
            }
            description="A little preparation goes a long way."
            action={
              <Link className="text-link" to="/interviews">
                View all <ArrowRight size={15} />
              </Link>
            }
          >
            {loading ? (
              <Loading />
            ) : upcoming.length ? (
              <div className="interview-list">
                {upcoming.slice(0, 3).map((i) => (
                  <div className="interview-row" key={i._id}>
                    <div className="date-tile">
                      <small>
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                        }).format(new Date(i.scheduledAt))}
                      </small>
                      <strong>{new Date(i.scheduledAt).getDate()}</strong>
                    </div>
                    <div className="interview-row-info">
                      <h3>{i.jobTitle}</h3>
                      <p>
                        {candidate ? i.companyName : i.candidateName}{" "}
                        <span>·</span> {i.type} interview
                      </p>
                      <div className="interview-meta">
                        <span>
                          <CalendarDays size={13} />
                          {dateLabel(i.scheduledAt, {
                            hour: "numeric",
                            minute: "2-digit",
                            timeZoneName: "short",
                          })}
                        </span>
                        <span>{i.duration} min</span>
                      </div>
                    </div>
                    <Status value={i.status} />
                    <Link to={`/room/${i._id}`} className="btn subtle">
                      {i.mode === "in_person" ? "Appointment details" : "Open room"} <ArrowUpRight size={15} />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Your next conversation is ahead"
                detail={
                  candidate
                    ? "Scheduled interviews will appear here once a hiring team invites you."
                    : "Review the AI shortlist and schedule your first interview."
                }
                action={
                  <Link
                    to={candidate ? "/jobs" : "/applications"}
                    className="text-link"
                  >
                    {candidate
                      ? "Explore opportunities"
                      : "Review applications"}
                    <ArrowRight size={15} />
                  </Link>
                }
              />
            )}
          </Panel>
        </div>
        <div className="dashboard-secondary">
          <Panel
            title={candidate ? "Your journey" : "Hiring pipeline"}
            description={
              candidate
                ? "Every application is a new possibility."
                : "From first hello to the right fit."
            }
            action={<Users size={18} className="muted" />}
          >
            <div className="pipeline-total">
              <strong>{loading ? "—" : apps.data.length}</strong>
              <span>
                {candidate
                  ? "applications in motion"
                  : "candidates in your pipeline"}
              </span>
            </div>
            <div className="pipeline-bars">
              {[
                "Applied",
                "Under Review",
                "Shortlisted",
                "Interview Scheduled",
                "Interview Completed",
                "Selected",
                "Rejected",
              ].map((s, i) => {
                const count = apps.data.filter((a) => a.status === s).length;
                return (
                  <div className="pipeline-line" key={s}>
                    <div>
                      <span>
                        <i
                          style={{
                            background: [
                              "var(--chart-1)",
                              "var(--chart-2)",
                              "var(--chart-3)",
                              "var(--chart-4)",
                              "var(--chart-5)",
                              "var(--success)",
                              "var(--danger)",
                            ][i],
                          }}
                        />
                        {s}
                      </span>
                      <strong>{count}</strong>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width: `${apps.data.length ? (count / apps.data.length) * 100 : 0}%`,
                          background: [
                            "var(--chart-1)",
                            "var(--chart-2)",
                            "var(--chart-3)",
                            "var(--chart-4)",
                            "var(--chart-5)",
                            "var(--success)",
                            "var(--danger)",
                          ][i],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <Link to="/applications" className="panel-footer-link">
              View applications <ArrowUpRight size={17} />
            </Link>
          </Panel>
          <div className="insight-card">
            <span className="insight-symbol">
              <BookOpen size={21} />
            </span>
            <Badge>THE HUMAN SIDE</Badge>
            <h3>
              {candidate
                ? "Progress over perfection."
                : "Good hiring is a team sport."}
            </h3>
            <p>
              {candidate
                ? "Use practice to try, reflect, and try again. Technical feedback is a starting point for growth."
                : "A résumé opens the door. A thoughtful conversation helps you see what comes next."}
            </p>
            <Link to={candidate ? "/practice" : "/team"}>
              {candidate ? "Make time for practice" : "Meet your hiring team"}{" "}
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </div>
      <Panel
        title={
          candidate ? "Opportunities to explore" : "My assigned candidates"
        }
        description={
          candidate
            ? "Find a role where your skills can make a difference."
            : "The people behind your next great team."
        }
        action={
          <Link
            className="text-link"
            to={candidate ? "/jobs" : "/applications"}
          >
            View all <ArrowRight size={15} />
          </Link>
        }
      >
        {candidate ? (
          <div className="mini-jobs">
            {jobs.data.slice(0, 3).map((j) => (
              <Link key={j._id} to="/jobs" className="mini-job">
                <span className="company-monogram">
                  {j.companyName?.[0] || "H"}
                </span>
                <h3>{j.title}</h3>
                <p>
                  {j.companyName} · {j.location}
                </p>
                <div>
                  {j.skills.slice(0, 3).map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
                <span className="mini-job-bottom">
                  {j.employment}
                  <ArrowUpRight size={18} />
                </span>
              </Link>
            ))}
            {!jobs.loading && !jobs.data.length && (
              <Empty
                title="Room for new opportunities"
                detail="Published jobs will appear here."
              />
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Role</th>
                  <th>AI match and evidence</th>
                  <th>Status</th>
                  <th>Applied</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {apps.data.filter(a => a.assignedHrId === user._id).slice(0, 5).map((a) => (
                  <tr key={a._id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={a.candidateName} />
                        <strong>{a.candidateName}</strong>
                      </div>
                    </td>
                    <td>{a.jobTitle}</td>
                    <td>
                      {a.match?.score == null ? (
                        "Not available"
                      ) : (
                        <span className="match-score">
                          {a.match.score}%{" "}
                          <span className="score-mini">
                            <i style={{ width: `${a.match.score}%` }} />
                          </span>
                        </span>
                      )}
                      <small>Matched: {a.match.matching.join(", ") || "None recorded"}</small>
                      <small>Missing / partial: {a.match.missing.join(", ") || "None recorded"}</small>
                    </td>
                    <td>
                      <Status value={a.status} />
                    </td>
                    <td className="muted">
                      {dateLabel(a.createdAt, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>
                      <Link
                        to="/applications"
                        aria-label={`Review ${a.candidateName}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!apps.loading && !apps.data.length && (
              <Empty
                title="Your talent pipeline starts here"
                detail="Accept a job request and set your availability. Matching candidates are assigned automatically when you have capacity."
              />
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
