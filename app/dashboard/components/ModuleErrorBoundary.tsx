'use client';

import { Component, type ReactNode } from 'react';

// ── Per-module error boundary ────────────────────────────────────────────
// One failed module must never wedge the whole dashboard on "Loading…".
// Wrap each module's content: a render crash resolves to Error + Retry
// instead of a blank/spinning page.
export default class ModuleErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean; message: string }
> {
  state = { failed: false, message: '' };

  static getDerivedStateFromError(err: unknown) {
    return { failed: true, message: err instanceof Error ? err.message : 'Unexpected error' };
  }

  componentDidCatch() {
    // Intentionally not re-thrown: the boundary IS the error state.
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="cc-alert cc-alert-error" role="alert" style={{ fontSize: 13 }}>
          <strong>⚠️ {this.props.label || 'Module'} failed to render.</strong>
          <div style={{ marginTop: 4 }}>{this.state.message.slice(0, 300)}</div>
          <button
            className="cc-btn"
            style={{ marginTop: 8, fontSize: 12 }}
            onClick={() => this.setState({ failed: false, message: '' })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
