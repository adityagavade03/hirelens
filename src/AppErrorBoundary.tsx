import { Component, createRef, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

type Props = {
  children: ReactNode;
  resetKey: string;
  reload?: () => void;
};
type State = { failure: "module" | "render" | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failure: null };
  private alert = createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? `${error.name} ${error.message}` : "";
    return {
      failure:
        /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .+ failed|error loading dynamically imported module/i.test(
          message,
        )
          ? "module"
          : "render",
    };
  }

  componentDidCatch() {
    this.alert.current?.focus();
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failure && previous.resetKey !== this.props.resetKey)
      this.setState({ failure: null });
  }

  render() {
    if (!this.state.failure) return this.props.children;
    const moduleFailed = this.state.failure === "module";
    return (
      <main className="preflight-page" aria-labelledby="app-recovery-title">
        <section className="panel panel-form">
          <div className="page-heading">
            <div>
              <h1 id="app-recovery-title">We couldn’t open this page</h1>
              <p>HireLens encountered an unexpected problem.</p>
            </div>
          </div>
          <div
            className="notice error"
            role="alert"
            tabIndex={-1}
            ref={this.alert}
          >
            <AlertCircle size={18} aria-hidden="true" />
            <span>
              {moduleFailed
                ? "Part of this page could not be loaded. Check your connection, then reload the page to try again."
                : "This page could not be displayed. Try again, or return to the start page."}
            </span>
          </div>
          <p>Unsaved changes may need to be entered again.</p>
          <div className="form-actions">
            <a className="btn secondary" href="/">
              Return to start
            </a>
            {!moduleFailed && (
              <button
                className="btn secondary"
                type="button"
                onClick={() => this.setState({ failure: null })}
              >
                Try again
              </button>
            )}
            <button
              className="btn primary"
              type="button"
              onClick={() =>
                this.props.reload
                  ? this.props.reload()
                  : window.location.reload()
              }
            >
              Reload page
            </button>
          </div>
        </section>
      </main>
    );
  }
}
