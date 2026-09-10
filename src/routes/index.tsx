import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, ChevronDown, Check, X, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  BEHAVIORS,
  CLARIFICATION_QUESTION,
  DEMO_ANSWERS,
  DRILL_NAME,
  SCENARIO_TEXT,
  STATUS_LABEL,
  evaluateBehavioralResponse,
  isVagueResponse,
  type BehavioralResult,
} from "@/lib/evaluator";
import { createMetrics, type MetricEvent } from "@/lib/metrics";
import { getRecognitionCtor, speak, startRecognition, stopSpeaking, type Recognizer } from "@/lib/speech";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Banger Drill — Proof that the message turned into action" },
      {
        name: "description",
        content:
          "A voice drill by Business Bangerz that checks whether a delivered message turned into correct behavior, and returns a structured behavioral result.",
      },
      { property: "og:title", content: "Banger Drill — Proof that the message turned into action" },
      {
        property: "og:description",
        content:
          "Listen to a scenario, answer by voice, and get a structured behavioral result showing which expected behaviors were demonstrated.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BangerDrill,
});

type Step = "landing" | "consent" | "drill" | "result";

function BangerDrill() {
  const metrics = useMemo(() => createMetrics(), []);
  const [events, setEvents] = useState<MetricEvent[]>([]);
  const track = useCallback(
    (name: Parameters<typeof metrics.track>[0], detail?: Record<string, unknown>) => {
      metrics.track(name, detail);
      setEvents([...metrics.events]);
    },
    [metrics],
  );

  const [step, setStep] = useState<Step>("landing");
  const [consent, setConsent] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [micError, setMicError] = useState<string | null>(null);

  const [clarify, setClarify] = useState(false);
  const [firstAnswer, setFirstAnswer] = useState("");
  const [result, setResult] = useState<BehavioralResult | null>(null);

  const recognizerRef = useRef<Recognizer | null>(null);
  const speechSupported = typeof window !== "undefined" && getRecognitionCtor() !== null;

  useEffect(() => () => stopSpeaking(), []);

  const say = async (text: string) => {
    setSpeaking(true);
    await speak(text);
    setSpeaking(false);
  };

  const startDrill = async () => {
    track("session_started");
    setStep("consent");
  };

  const grantConsent = async () => {
    track("consent_granted", { scope: "microphone_audio_this_session_only", audio_retained: false });
    setStep("drill");
    await say(SCENARIO_TEXT);
  };

  const toggleMic = () => {
    setMicError(null);
    if (listening) {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      setListening(false);
      return;
    }
    const rec = startRecognition({
      onTranscript: (text) => setTranscript(text),
      onEnd: () => {
        setListening(false);
        recognizerRef.current = null;
      },
      onError: (message) => {
        setMicError(`Microphone unavailable (${message}). Use the demo fallback below.`);
        setListening(false);
      },
    });
    if (!rec) {
      setMicError("This browser has no speech recognition. Use the demo fallback below.");
      return;
    }
    recognizerRef.current = rec;
    setListening(true);
  };

  const currentAnswer = (transcript || typed).trim();

  const submitAnswer = async () => {
    if (!currentAnswer) return;
    recognizerRef.current?.stop();
    setListening(false);

    const combined = clarify ? `${firstAnswer} ${currentAnswer}` : currentAnswer;
    track("response_captured", {
      turn: clarify ? "clarification" : "initial",
      characters: currentAnswer.length,
      source: transcript ? "speech" : "typed",
    });

    if (!clarify && isVagueResponse(currentAnswer)) {
      setFirstAnswer(currentAnswer);
      setClarify(true);
      setTranscript("");
      setTyped("");
      track("clarification_asked", { question: CLARIFICATION_QUESTION });
      await say(CLARIFICATION_QUESTION);
      return;
    }

    const evaluated = evaluateBehavioralResponse(combined, { clarificationAsked: clarify });
    setResult(evaluated);
    track("result_generated", { result: evaluated.result });
    track("behaviors_demonstrated_count", { count: evaluated.behaviors_demonstrated.length });
    track("drill_completed");
    setStep("result");
  };

  const restart = () => {
    stopSpeaking();
    recognizerRef.current?.stop();
    recognizerRef.current = null;
    setStep("landing");
    setConsent(false);
    setTranscript("");
    setTyped("");
    setFirstAnswer("");
    setClarify(false);
    setResult(null);
    setMicError(null);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
        <header className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WaveMark active={speaking || listening} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Business Bangerz
              </p>
              <p className="text-lg font-bold tracking-tight">Banger Drill</p>
            </div>
          </div>
          <button
            onClick={() => setDemoMode((v) => !v)}
            className="rounded-full border border-border px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            {demoMode ? "Demo tools on" : "Demo"}
          </button>
        </header>

        {step === "landing" && <Landing onStart={startDrill} />}

        {step === "consent" && (
          <Consent checked={consent} onChange={setConsent} onGrant={grantConsent} onDecline={restart} />
        )}

        {step === "drill" && (
          <Drill
            clarify={clarify}
            speaking={speaking}
            listening={listening}
            transcript={transcript}
            typed={typed}
            micError={micError}
            speechSupported={speechSupported}
            demoMode={demoMode}
            onReplay={() => say(clarify ? CLARIFICATION_QUESTION : SCENARIO_TEXT)}
            onToggleMic={toggleMic}
            onTyped={setTyped}
            onDemoFill={(t) => {
              setTranscript("");
              setTyped(t);
            }}
            onSubmit={submitAnswer}
            canSubmit={Boolean(currentAnswer)}
          />
        )}

        {step === "result" && result && <ResultScreen result={result} events={events} onRestart={restart} />}

        <footer className="mt-auto pt-12 text-xs text-muted-foreground">
          Offline demo mode · Browser speech only · Session external API cost: $0.00
        </footer>
      </div>
    </main>
  );
}

function WaveMark({ active }: { active: boolean }) {
  return (
    <div className="flex h-9 items-end gap-[3px]">
      {[10, 22, 34, 22, 14].map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-full bg-primary transition-all duration-300 ${active ? "animate-pulse" : ""}`}
          style={{ height: active ? h + 4 : h }}
        />
      ))}
    </div>
  );
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <h1 className="text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
        Proof that the message
        <br />
        turned into <span className="text-primary">action.</span>
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        Banger Drill checks whether people know what to do — not just what the song said.
      </p>

      <div className="mt-10 rounded-2xl border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">Fictional drill</p>
        <h2 className="mt-2 text-2xl font-bold">{DRILL_NAME}</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          One spoken scenario. One spoken answer. Up to one clarification question. Then a structured behavioral
          result checked against three expected behaviors.
        </p>
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {BEHAVIORS.map((b) => (
            <li key={b.id}>
              <span className="font-mono text-primary">{b.letter}.</span> {b.label}
            </li>
          ))}
        </ul>
      </div>

      <Button size="lg" onClick={onStart} className="mt-8 h-14 self-start px-10 text-base font-bold">
        Start Drill
      </Button>
    </section>
  );
}

function Consent({
  checked,
  onChange,
  onGrant,
  onDecline,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  onGrant: () => void;
  onDecline: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <h2 className="text-4xl font-black tracking-tight">Before we record</h2>
      <div className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <p>Your microphone audio is used only for this drill, in this browser session.</p>
        <p>Your transcript may be processed to evaluate the answer against the expected behaviors.</p>
        <p>Audio is not retained after the session. Nothing is uploaded to an external service.</p>
        <p>You can decline and exit at any time, and use the typed fallback instead.</p>
      </div>

      <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm">
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <span>I understand and consent to microphone use for this drill.</span>
      </label>

      <div className="mt-8 flex gap-3">
        <Button size="lg" disabled={!checked} onClick={onGrant} className="h-14 px-8 font-bold">
          I consent — begin
        </Button>
        <Button size="lg" variant="ghost" onClick={onDecline} className="h-14">
          Decline and exit
        </Button>
      </div>
    </section>
  );
}

function Drill(props: {
  clarify: boolean;
  speaking: boolean;
  listening: boolean;
  transcript: string;
  typed: string;
  micError: string | null;
  speechSupported: boolean;
  demoMode: boolean;
  onReplay: () => void;
  onToggleMic: () => void;
  onTyped: (v: string) => void;
  onDemoFill: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  return (
    <section className="flex flex-1 flex-col">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
        {props.clarify ? "Clarification" : "Scenario"}
      </p>
      <p className="mt-3 text-2xl font-bold leading-snug sm:text-3xl">
        {props.clarify ? CLARIFICATION_QUESTION : SCENARIO_TEXT}
      </p>

      <button
        onClick={props.onReplay}
        className="mt-4 inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <Volume2 className="h-4 w-4" /> {props.speaking ? "Speaking…" : "Play again"}
      </button>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <Button
            size="lg"
            variant={props.listening ? "destructive" : "default"}
            onClick={props.onToggleMic}
            className="h-14 px-6 font-bold"
          >
            {props.listening ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
            {props.listening ? "Stop" : "Answer by voice"}
          </Button>
          <WaveMark active={props.listening} />
          <span className="text-sm text-muted-foreground">
            {props.listening ? "Listening…" : props.speechSupported ? "Microphone ready" : "Speech not supported"}
          </span>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Live transcript</p>
        <p className="mt-2 min-h-14 text-lg">
          {props.transcript || <span className="text-muted-foreground">Nothing captured yet.</span>}
        </p>
        {props.micError && <p className="mt-2 text-sm text-destructive">{props.micError}</p>}
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">Demo fallback — typed answer</p>
        <Textarea
          value={props.typed}
          onChange={(e) => props.onTyped(e.target.value)}
          placeholder="Type the answer here if the microphone isn't available."
          className="mt-2 min-h-24 text-base"
        />
      </div>

      {props.demoMode && (
        <div className="mt-4 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Demo answers</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => props.onDemoFill(DEMO_ANSWERS.bad)}>
              Bad answer
            </Button>
            <Button variant="secondary" size="sm" onClick={() => props.onDemoFill(DEMO_ANSWERS.vague)}>
              Vague answer
            </Button>
            <Button variant="secondary" size="sm" onClick={() => props.onDemoFill(DEMO_ANSWERS.good)}>
              Good answer
            </Button>
          </div>
        </div>
      )}

      <Button
        size="lg"
        disabled={!props.canSubmit}
        onClick={props.onSubmit}
        className="mt-8 h-14 self-start px-10 font-bold"
      >
        Submit answer
      </Button>
    </section>
  );
}

function ResultScreen({
  result,
  events,
  onRestart,
}: {
  result: BehavioralResult;
  events: MetricEvent[];
  onRestart: () => void;
}) {
  const [openJson, setOpenJson] = useState(false);
  const count = result.behaviors_demonstrated.length;
  const tone =
    result.result === "demonstrated"
      ? "text-success"
      : result.result === "needs_reinforcement"
        ? "text-warning"
        : "text-destructive";

  return (
    <section className="flex flex-1 flex-col">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">{result.drill}</p>
      <h2 className={`mt-3 text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl ${tone}`}>
        {STATUS_LABEL[result.result]}
      </h2>
      <p className="mt-4 text-2xl font-bold">{count} of 3 behaviors demonstrated</p>

      <div className="mt-8 space-y-2">
        {BEHAVIORS.map((b) => {
          const passed = result.behaviors_demonstrated.includes(b.id);
          return (
            <div
              key={b.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card px-5 py-4 text-base"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  passed ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"
                }`}
              >
                {passed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </span>
              <span>
                <span className="font-mono text-primary">{b.letter}.</span> {b.label}
              </span>
            </div>
          );
        })}
      </div>

      {result.most_important_gap && (
        <div className="mt-6 rounded-2xl border-l-4 border-primary bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Most important gap</p>
          <p className="mt-2 text-lg font-semibold">{result.most_important_gap}</p>
        </div>
      )}

      <p className="mt-6 text-base text-muted-foreground">{result.reinforcement_message}</p>

      <div className="mt-6 rounded-2xl border border-border bg-card">
        <button
          onClick={() => setOpenJson((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold"
        >
          Structured Output
          <ChevronDown className={`h-4 w-4 transition-transform ${openJson ? "rotate-180" : ""}`} />
        </button>
        {openJson && (
          <pre className="overflow-x-auto border-t border-border px-5 py-4 font-mono text-xs text-muted-foreground">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-primary/40 bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Business impact</p>
        <p className="mt-2 text-sm">
          Banger Drill gives Business Bangerz something new to sell after delivery: proof that employees can apply
          the message. That creates a premium “verified” tier and a path to recurring reinforcement work.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Impact metrics — this session
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          {events.map((e, i) => (
            <li key={i}>
              {e.name}
              {e.detail ? ` · ${JSON.stringify(e.detail)}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Estimated external API cost this session: $0.00</p>
      </div>

      <Button size="lg" variant="secondary" onClick={onRestart} className="mt-8 h-12 self-start px-8 font-bold">
        Run another drill
      </Button>
    </section>
  );
}
