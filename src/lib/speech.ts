/**
 * MR-1 / OR-1 / OR-2: browser-native audio in and out.
 * Uses browser-provided speech APIs; no paid API key is configured by this
 * prototype. Browser speech recognition may use a browser/vendor service.
 */

export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

type SpeechRecognitionCtor = new () => any;

export function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, SpeechRecognitionCtor | undefined>;
  return w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null;
}

export interface Recognizer {
  stop: () => void;
}

export function startRecognition(handlers: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event: any) => {
    let text = "";
    let isFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    handlers.onTranscript(text.trim(), isFinal);
  };
  recognition.onerror = (event: any) => handlers.onError(String(event?.error ?? "speech-error"));
  recognition.onend = () => handlers.onEnd();
  recognition.start();

  return { stop: () => recognition.stop() };
}
