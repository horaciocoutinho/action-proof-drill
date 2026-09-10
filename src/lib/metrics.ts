/**
 * OR-11: lightweight measurement instrumentation.
 * Session-scoped only: these events are held in memory for this page session
 * and are not sent anywhere.
 */

export type MetricEventName =
  | "session_started"
  | "consent_granted"
  | "consent_withdrawn"
  | "typed_mode_selected"
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
