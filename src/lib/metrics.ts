/**
 * OR-11: lightweight measurement instrumentation.
 * Session-scoped only — nothing leaves the browser.
 */

export type MetricEventName =
  | "session_started"
  | "consent_granted"
  | "response_captured"
  | "clarification_asked"
  | "result_generated"
  | "behaviors_demonstrated_count"
  | "drill_completed";

export interface MetricEvent {
  name: MetricEventName;
  at: string;
  detail?: Record<string, unknown>;
}

export function createMetrics() {
  const events: MetricEvent[] = [];
  return {
    events,
    track(name: MetricEventName, detail?: Record<string, unknown>) {
      events.push({ name, at: new Date().toISOString(), ...(detail ? { detail } : {}) });
    },
  };
}
