"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
          <p className="text-lg font-medium">Something went wrong.</p>
          <p className="text-sm text-muted-foreground">Try reloading the page. Your data is safe in IndexedDB.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="btn-primary px-4 py-2"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
