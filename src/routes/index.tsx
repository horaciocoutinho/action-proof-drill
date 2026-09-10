import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, ChevronDown, Check, X, Volume2 } from "lucide-react";

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

/* ---------- brand primitives ---------- */

function Sticker({
  children,
  tone = "lime",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "lime" | "pink" | "yellow" | "cream" | "cyan";
  className?: string;
}) {
  const tones: Record<string, string> = {
    lime: "bg-accent text-accent-foreground",
    pink: "bg-primary text-primary-foreground",
    yellow: "bg-warning text-warning-foreground",
    cream: "bg-paper text-ink",
    cyan: "bg-teal-bright text-ink",
  };
  return <span className={`bb-sticker text-[11px] sm:text-xs ${tones[tone]} ${className}`}>{children}</span>;
}

function Panel({
  children,
  tone = "deep",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "deep" | "paper" | "pink" | "lime" | "yellow";
  className?: string;
}) {
  const tones: Record<string, string> = {
    deep: "bg-teal-deep text-foreground",
    paper: "bg-paper text-ink",
    pink: "bg-primary text-primary-foreground",
    lime: "bg-accent text-accent-foreground",
    yellow: "bg-warning text-warning-foreground",
  };
  return <div className={`bb-panel ${tones[tone]} ${className}`}>{children}</div>;
}

function PosterButton({
  children,
  onClick,
  tone = "pink",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "pink" | "lime" | "cream" | "yellow";
  disabled?: boolean;
  className?: string;
}) {
  const tones: Record<string, string> = {
    pink: "bg-primary text-primary-foreground",
    lime: "bg-accent text-accent-foreground",
    cream: "bg-paper text-ink",
    yellow: "bg-warning text-warning-foreground",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`bb-panel-sm font-display uppercase tracking-wide transition-transform ${tones[tone]} px-8 py-4 text-xl active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

function Equalizer({ active, big = false }: { active: boolean; big?: boolean }) {
  const bars = big ? [26, 52, 38, 64, 30, 46, 22] : [10, 22, 34, 22, 14];
  return (
    <div className={`flex items-end gap-[4px] ${big ? "h-16" : "h-9"}`}>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[6px] rounded-sm border-2 border-ink bg-accent"
          style={{
            height: h,
            animation: active ? `bb-bounce 0.6s ease-in-out ${i * 0.08}s infinite alternate` : undefined,
          }}
        />
      ))}
      <style>{`@keyframes bb-bounce { from { transform: scaleY(0.45); } to { transform: scaleY(1.25); } }`}</style>
    </div>
  );
}

/* ---------- main flow (logic unchanged) ---------- */

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
    <main className="bb-halftone min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Equalizer active={speaking || listening} />
            <div>
              <Sticker tone="pink">Business Bangerz</Sticker>
              <p className="mt-1 font-display text-2xl uppercase tracking-wide">Banger Drill</p>
            </div>
          </div>
          <button
            onClick={() => setDemoMode((v) => !v)}
            className={`bb-sticker text-[11px] ${demoMode ? "bg-warning text-warning-foreground" : "bg-teal-deep text-foreground"}`}
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

        <footer className="mt-auto pt-10 text-sm font-medium text-foreground/80">
          Offline demo mode · Browser speech only · Session external API cost: $0.00
        </footer>
      </div>
    </main>
  );
}

/* ---------- screens ---------- */

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <section className="flex flex-1 flex-col justify-center">
      <Sticker tone="cream" className="self-start">
        Business Bangerz
      </Sticker>
      <h1 className="bb-headline bb-ink-shadow mt-4 text-[19vw] leading-[0.82] sm:text-[9.5rem]">Banger Drill</h1>
      <p className="mt-5 max-w-3xl font-display text-2xl uppercase tracking-wide text-paper sm:text-4xl">
        Proof that the message turned into action.
      </p>

      <div className="mt-9 grid gap-5 md:grid-cols-[1.35fr_1fr]">
        <Panel tone="paper" className="p-6">
          <Sticker tone="pink">Fictional drill</Sticker>
          <h2 className="bb-headline mt-3 text-3xl sm:text-4xl">{DRILL_NAME}</h2>
          <p className="mt-3 text-base font-medium">
            One spoken scenario. One spoken answer. Up to one clarification question. Then a structured behavioral
            result checked against three expected behaviors.
          </p>
          <ul className="mt-4 space-y-2">
            {BEHAVIORS.map((b) => (
              <li key={b.id} className="bb-panel-sm flex items-start gap-3 bg-teal-bright px-4 py-3 text-base font-bold">
                <span className="font-display text-xl leading-none">{b.letter}.</span>
                <span>{b.label}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel tone="pink" className="flex flex-col items-center justify-center gap-6 p-6">
          <Equalizer active big />
          <p className="text-center font-display text-2xl uppercase leading-tight">
            Prove they know what to do — not just what the song said.
          </p>
          <Mic className="h-14 w-14" strokeWidth={2.5} />
        </Panel>
      </div>

      <PosterButton tone="lime" onClick={onStart} className="mt-9 self-start text-3xl">
        Start Drill
      </PosterButton>
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
      <Sticker tone="yellow" className="self-start">
        Before we record
      </Sticker>
      <h2 className="bb-headline bb-ink-shadow mt-4 text-6xl sm:text-8xl">Mic Check</h2>

      <Panel tone="paper" className="mt-7 space-y-3 p-6 text-lg font-medium">
        <p>Your microphone audio is used only for this drill, in this browser session.</p>
        <p>Your transcript may be processed to evaluate the answer against the expected behaviors.</p>
        <p>Audio is not retained after the session. Nothing is uploaded to an external service.</p>
        <p>You can decline and exit at any time, and use the typed fallback instead.</p>
      </Panel>

      <label className="bb-panel-sm mt-6 flex cursor-pointer items-center gap-3 self-start bg-teal-bright px-5 py-4 text-base font-bold text-ink">
        <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="border-ink" />
        <span>I understand and consent to microphone use for this drill.</span>
      </label>

      <div className="mt-8 flex flex-wrap gap-4">
        <PosterButton tone="lime" disabled={!checked} onClick={onGrant}>
          I consent — begin
        </PosterButton>
        <PosterButton tone="cream" onClick={onDecline} className="text-base">
          Decline and exit
        </PosterButton>
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
      <Sticker tone={props.clarify ? "yellow" : "pink"} className="self-start">
        {props.clarify ? "One more thing" : "The scenario"}
      </Sticker>

      <Panel tone="paper" className="mt-4 p-6">
        <p className="font-display text-2xl uppercase leading-[1.05] sm:text-4xl">
          {props.clarify ? CLARIFICATION_QUESTION : SCENARIO_TEXT}
        </p>
        <button
          onClick={props.onReplay}
          className="bb-panel-sm mt-5 inline-flex items-center gap-2 bg-teal-bright px-4 py-2 text-sm font-bold uppercase tracking-widest"
        >
          <Volume2 className="h-4 w-4" /> {props.speaking ? "Speaking…" : "Play again"}
        </button>
      </Panel>

      <Sticker tone="lime" className="mt-7 self-start">
        Your turn
      </Sticker>

      <Panel tone="deep" className="mt-4 p-6">
        <div className="flex flex-wrap items-center gap-5">
          <PosterButton tone={props.listening ? "pink" : "lime"} onClick={props.onToggleMic} className="text-lg">
            <span className="inline-flex items-center gap-2">
              {props.listening ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {props.listening ? "Stop" : "Answer by voice"}
            </span>
          </PosterButton>
          <Equalizer active={props.listening} big />
          <span className="font-display text-lg uppercase tracking-wide">
            {props.listening ? "Listening…" : props.speechSupported ? "Microphone ready" : "Speech not supported"}
          </span>
        </div>

        <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-paper/80">Live transcript</p>
        <p className="mt-2 min-h-14 text-xl font-medium">
          {props.transcript || <span className="text-paper/60">Nothing captured yet.</span>}
        </p>
        {props.micError && (
          <p className="bb-panel-sm mt-3 bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            {props.micError}
          </p>
        )}
      </Panel>

      <div className="mt-6">
        <Sticker tone="yellow">Demo fallback — typed answer</Sticker>
        <Textarea
          value={props.typed}
          onChange={(e) => props.onTyped(e.target.value)}
          placeholder="Type the answer here if the microphone isn't available."
          className="bb-panel-sm mt-3 min-h-24 bg-paper text-base font-medium text-ink placeholder:text-ink/50"
        />
      </div>

      {props.demoMode && (
        <Panel tone="paper" className="mt-5 p-4">
          <p className="text-xs font-bold uppercase tracking-widest">Demo answers</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <PosterButton tone="pink" className="px-4 py-2 text-sm" onClick={() => props.onDemoFill(DEMO_ANSWERS.bad)}>
              Bad answer
            </PosterButton>
            <PosterButton
              tone="yellow"
              className="px-4 py-2 text-sm"
              onClick={() => props.onDemoFill(DEMO_ANSWERS.vague)}
            >
              Vague answer
            </PosterButton>
            <PosterButton tone="lime" className="px-4 py-2 text-sm" onClick={() => props.onDemoFill(DEMO_ANSWERS.good)}>
              Good answer
            </PosterButton>
          </div>
        </Panel>
      )}

      <PosterButton tone="pink" disabled={!props.canSubmit} onClick={props.onSubmit} className="mt-8 self-start">
        Submit answer
      </PosterButton>
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
  const [openMetrics, setOpenMetrics] = useState(false);
  const count = result.behaviors_demonstrated.length;
  const statusTone =
    result.result === "demonstrated"
      ? "bg-accent text-accent-foreground"
      : result.result === "needs_reinforcement"
        ? "bg-warning text-warning-foreground"
        : "bg-primary text-primary-foreground";

  return (
    <section className="flex flex-1 flex-col">
      <Sticker tone="cream" className="self-start">
        {result.drill}
      </Sticker>

      <div className={`bb-panel mt-4 px-7 py-8 ${statusTone}`}>
        <h2 className="bb-headline text-[13vw] leading-[0.85] sm:text-[7rem]">{STATUS_LABEL[result.result]}</h2>
        <p className="bb-headline mt-4 text-4xl sm:text-6xl">{count} of 3 behaviors demonstrated</p>
      </div>

      <div className="mt-6 space-y-3">
        {BEHAVIORS.map((b) => {
          const passed = result.behaviors_demonstrated.includes(b.id);
          return (
            <div
              key={b.id}
              className={`bb-panel flex items-center gap-4 px-6 py-5 ${passed ? "bg-accent text-accent-foreground" : "bg-paper text-ink"}`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-ink ${
                  passed ? "bg-paper" : "bg-primary"
                }`}
              >
                {passed ? <Check className="h-6 w-6" strokeWidth={4} /> : <X className="h-6 w-6" strokeWidth={4} />}
              </span>
              <span className="font-display text-xl uppercase leading-tight sm:text-2xl">
                {b.letter}. {b.label}
              </span>
            </div>
          );
        })}
      </div>

      {result.most_important_gap && (
        <Panel tone="pink" className="mt-7 p-6">
          <Sticker tone="cream">Most important gap</Sticker>
          <p className="bb-headline mt-3 text-2xl sm:text-4xl">{result.most_important_gap}</p>
        </Panel>
      )}

      <Panel tone="paper" className="mt-5 p-5">
        <p className="text-lg font-bold">{result.reinforcement_message}</p>
      </Panel>

      <Panel tone="deep" className="mt-7 p-5">
        <Sticker tone="cyan">Business impact</Sticker>
        <p className="mt-3 text-base font-medium">
          Banger Drill gives Business Bangerz something new to sell after delivery: proof that employees can apply
          the message. That creates a premium “verified” tier and a path to recurring reinforcement work.
        </p>
      </Panel>

      <div className="mt-6 space-y-3">
        <div className="bb-panel-sm bg-teal-deep">
          <button
            onClick={() => setOpenJson((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-bold uppercase tracking-widest"
          >
            Structured output
            <ChevronDown className={`h-4 w-4 transition-transform ${openJson ? "rotate-180" : ""}`} />
          </button>
          {openJson && (
            <pre className="overflow-x-auto border-t-[3px] border-ink px-5 py-4 font-mono text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>

        <div className="bb-panel-sm bg-teal-deep">
          <button
            onClick={() => setOpenMetrics((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-bold uppercase tracking-widest"
          >
            Impact metrics — this session
            <ChevronDown className={`h-4 w-4 transition-transform ${openMetrics ? "rotate-180" : ""}`} />
          </button>
          {openMetrics && (
            <div className="border-t-[3px] border-ink px-5 py-4">
              <ul className="space-y-1 font-mono text-xs">
                {events.map((e, i) => (
                  <li key={i}>
                    {e.name}
                    {e.detail ? ` · ${JSON.stringify(e.detail)}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-xs">Estimated external API cost this session: $0.00</p>
            </div>
          )}
        </div>
      </div>

      <PosterButton tone="cream" onClick={onRestart} className="mt-8 self-start text-lg">
        Run another drill
      </PosterButton>
    </section>
  );
}
