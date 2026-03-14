import { Component, type ReactNode, type ErrorInfo } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UCAD Error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          padding: "40px 20px",
          textAlign: "center",
          color: "#f85149",
          fontFamily: "var(--font-sans, sans-serif)",
        }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Something went wrong</h2>
          <p style={{ fontSize: "13px", color: "#8b949e" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            style={{
              marginTop: "12px",
              padding: "6px 14px",
              fontSize: "13px",
              background: "#1c2129",
              color: "#c9d1d9",
              border: "1px solid #21262d",
              borderRadius: "4px",
              cursor: "pointer",
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
