# Banger Drill

## 1. What this is

Banger Drill is a narrow prototype for the **Business Bangerz AI Voice Agent Prototype Challenge**.

**Concept name:** Banger Drill — "Prove they know what to do — not just what the song said."

A voice agent speaks one workplace scenario aloud, the user answers by voice, and the system evaluates that answer
against three explicit expected behaviors. If the answer is vague, the agent asks exactly one spoken clarification
question. The output is a structured Behavioral Result that a downstream process can consume.

One fictional training case only: **Responsible AI & Customer Data**.

## 2. The outcome it targets

- **Friction addressed: F5 — no proof of impact after delivery.**
- **Business outcome: REVENUE.**

Business Bangerz already delivers the message. Banger Drill adds one specific post-delivery proof-of-impact slice we
chose for F5: **scenario-based evidence that an employee can apply the message to a realistic decision.** We make no
claims about what any existing Business Bangerz product does or does not measure, and we do not assert that this idea
is new to the team — this is simply the slice we built.

Commercially, evidence of application is what makes a premium "verified" tier and recurring reinforcement work
sellable after delivery.

## 3. What actually works

Functional:

- Spoken scenario via the browser Web Speech Synthesis API (MR-1, OR-2). This plays on the typed-fallback path too,
  so audio is always part of the workflow even when speech recognition is unavailable.
- Voice answer capture with a live transcript via the browser Web Speech Recognition API (MR-2, OR-1).
- Typed answer fallback, clearly labeled "Demo fallback" in the UI (MR-2).
- Deterministic behavioral evaluator returning structured JSON (MR-3).
- One spoken clarification turn when the answer is vague (OR-3).
- Explicit consent step with retention statement, recorded as a session event (OR-7). Microphone use is opt-in: the
  consent screen offers "I consent — use voice" (checkbox required) and "Continue without microphone", so the full
  drill can be taken with a typed answer and no microphone consent. The typed-only choice is logged as
  `typed_mode_selected`.
- Session measurement events shown on the result screen (OR-11).
- Prototype-paid API cost: $0.00; no paid API credentials are configured (OR-10). Browser speech recognition may use
  the browser/vendor service described below.
- A single runnable path from spoken input to structured output (MR-4).

Fallback / stubbed / honest limitations (MR-6):

- **The evaluator is deterministic rule and phrase matching, not an LLM.** The UI never claims otherwise. It lives in
  `src/lib/evaluator.ts` behind `evaluateBehavioralResponse()` so an LLM evaluator can replace it later.
- Speech recognition is browser-dependent. Chrome and Edge work; Firefox generally does not. The typed fallback exists
  precisely for that case and for noisy live-demo rooms.
- **Voice privacy, stated precisely:** this prototype does not save an audio recording. If you use voice input, your
  browser's speech-recognition service may process the audio according to that browser's own behavior — Chrome, for
  example, may use a remote recognition service. We do not claim recognition is offline. The transcript is used only
  for this drill session and is cleared when the session ends.
- Measurement events and the proof-of-impact payload are in-memory for the session only. There is no analytics
  backend and nothing is persisted.
- Consent can be withdrawn mid-drill ("Withdraw consent & exit"): audio stops, session drill state is cleared, a
  `consent_withdrawn` event is logged, and the app returns to the landing screen. In typed-only sessions no microphone
  consent was granted, so the same control is labeled "Exit drill" and no `consent_withdrawn` event is logged.
- No revenue, attach-rate, or dollar figures are shown anywhere. We do not have that data.
- There is exactly one drill, hard-coded. There is no authoring UI.

## 4. How it works

1. `src/lib/speech.ts` — browser speech synthesis (agent voice) and speech recognition (user voice).
2. `src/lib/evaluator.ts` — expected behaviors, vagueness detection (`isVagueResponse`), and
   `evaluateBehavioralResponse()` which returns the `BehavioralResult` JSON.
3. `src/lib/metrics.ts` — session event tracking.
4. `src/routes/index.tsx` — the four screens: landing, consent, drill, result.

Structured output shape:

```json
{
  "concept": "Banger Drill",
  "drill": "Responsible AI & Customer Data",
  "result": "high_risk_gap",
  "behaviors_demonstrated": ["use_approved_ai_tool"],
  "behaviors_missed": ["do_not_upload_customer_pii", "anonymize_sensitive_information"],
  "clarification_asked": false,
  "most_important_gap": "Customer information must be removed or anonymized before using AI.",
  "reinforcement_message": "Remove customer-identifiable information before using an approved AI tool.",
  "proof_of_impact": {
    "banger_id": "banger_demo_0001",
    "drill_id": "responsible_ai_customer_data_v1",
    "assessment_completed": true,
    "behaviors_demonstrated_count": 1,
    "total_behaviors": 3,
    "result": "high_risk_gap",
    "clarification_asked": false,
    "completed_at": "2026-01-01T12:00:00.000Z"
  }
}
```

`banger_id` is a fictional demo identifier here. In production it would be the existing song/project ID.

### Why the proof-of-impact payload exists

The session events (`session_started`, `consent_granted`, `response_captured`, `clarification_asked`,
`result_generated`, `behaviors_demonstrated_count`, `drill_completed`, `consent_withdrawn`) are technical instrumentation
— useful, but they do not by themselves evidence the REVENUE outcome. The compact `proof_of_impact` payload does the
commercial work: joined to the existing client/project record, it lets Business Bangerz measure completion and
behavioral application **per Banger**.

A later production integration would additionally associate the Banger Drill / Verified tier with the project or
order, which is what makes attach rate, repeat purchase, and recurring reinforcement revenue measurable. We are not
modelling or estimating any of those numbers here.

### Integration path: Next.js + Supabase (documented, not implemented)

Business Bangerz's stated surface is Next.js and Supabase. This prototype is deliberately client-side, and adoption
would be small:

1. One table, e.g. `banger_drill_results`, holding the payload fields above plus a foreign key to the existing
   song/project record, with RLS scoped the same way as existing per-client rows.
2. One server-side insert — a Next.js route handler or server action calling the Supabase server client — invoked once
   when the drill completes. The client posts the single JSON result; it never talks to the database directly.
3. Browser voice capture, speech synthesis, and the evaluator can all remain client-side unchanged.

**Not currently implemented.** Estimated prototype-integration effort: **~0.5–1 engineering day after confirming the
existing schema and RLS model** — an estimate, subject to schema review.

## 5. Setup

```bash
bun install
bun run dev
```

Open the app in Chrome or Edge and allow microphone access. No API keys and no environment variables are required.
Future API-backed evaluation or transcription would be configured through environment variables (OR-12); nothing
today reads one.

## 6. The primary path

1. Landing screen → **Start Drill** (`session_started`).
2. Consent screen → either **I consent — use voice** after checking the microphone consent box (`consent_granted`), or
   **Continue without microphone** for a typed-only session (`typed_mode_selected`). Voice sessions can be ended with
   **Withdraw consent & exit** (`consent_withdrawn`); typed-only sessions use **Exit drill**. Either stops audio and
   clears session state.
3. Agent speaks the scenario aloud.
4. User answers by microphone, live transcript appears (or uses the typed demo fallback) → **Submit answer**
   (`response_captured`).
5. If vague, the agent speaks one clarification question and captures a second answer (`clarification_asked`).
6. Result screen: status, X of 3 behaviors, per-behavior pass/fail, most important gap, reinforcement message,
   the "scenario-based application check" line, expandable structured JSON (including `proof_of_impact`), business
   impact panel, collapsible session impact metrics (`result_generated`,
   `behaviors_demonstrated_count`, `drill_completed`).

Demo fixtures are available behind the subtle **Demo** toggle in the header:

| Fixture | Answer | Expected |
| --- | --- | --- |
| Bad | "I would upload the document and ask the AI to summarize it, but I wouldn't share the result externally." | HIGH-RISK GAP, 0 of 3 |
| Vague | "I'd check with someone first." | One spoken clarification question |
| Good | "I would remove names and email addresses, use only an approved AI tool, and then summarize the anonymized feedback." | DEMONSTRATED, 3 of 3 |

## 7. What you did not build, and why

We intentionally did not build multi-company authentication, dashboards, music generation, billing, a full training
platform, a generalized drill authoring system, or any database provisioning, because the challenge rewards one narrow working slice rather than
a broad, partly-working platform. Everything above is deliberately out of scope for this prototype.

## 8. AI-use disclosure

This prototype was built with AI coding assistance (Lovable). The scenario, the three expected behaviors, the drill
content, and the evaluation rules were authored for this submission. The runtime app performs no LLM calls: the
behavioral evaluation is deterministic code, and the voice in and out is the browser's own Web Speech API.

## 9. Attribution

- Concept and prototype: Banger Drill, built for the Business Bangerz AI Voice Agent Prototype Challenge.
- Voice input/output: Web Speech API (browser-native).
- UI stack: TanStack Start, React, Tailwind CSS, shadcn/ui, Lucide icons.
- The drill scenario and company case are fictional and used for demonstration only.
