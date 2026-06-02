import { Component, type ErrorInfo, type ReactNode } from "react";
import { logDebug, copyToClipboard } from "../state/debugLog";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  copied: boolean;
}

/**
 * Top-level React error boundary. Wrapping <App/> in main.tsx replaces the old
 * blank-white-screen behaviour on a render crash with a readable fallback card
 * that shows the error and lets the owner copy it (works in production too).
 *
 * The caught error + component stack are also reported through debugLog, so the
 * browser DevTools Console shows the useful details even in production builds.
 *
 * SECURITY: only the error message and stacks are recorded/displayed — never
 * game state or card values.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "", stack: "", copied: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || "Unknown error",
      stack: error?.stack || "",
      copied: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logDebug(
      "error",
      "react",
      error?.message || "Unknown error",
      `${error?.stack ?? ""}\n${info?.componentStack ?? ""}`,
    );
  }

  private handleCopy = (): void => {
    const text = this.state.stack
      ? `${this.state.message}\n${this.state.stack}`
      : this.state.message;
    void copyToClipboard(text).then((ok) => {
      if (ok) this.setState({ copied: true });
    });
  };

  private handleReload = (): void => {
    location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="error-boundary-overlay">
        <div className="error-boundary-card">
          <h2 className="error-boundary-title">Something went wrong</h2>
          <p className="error-boundary-sub">
            The game hit an unexpected error. The details were written to the
            browser console; you can also copy them, then reload.
          </p>
          <pre className="error-boundary-message">{this.state.message}</pre>
          <div className="error-boundary-actions">
            <button className="btn" onClick={this.handleCopy}>
              {this.state.copied ? "Copied!" : "Copy details"}
            </button>
            <button className="btn primary" onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
