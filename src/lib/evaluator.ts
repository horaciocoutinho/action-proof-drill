/**
 * Deterministic behavioral evaluator for Banger Drill.
 *
 * MR-3: transforms free-text spoken/typed input into a structured,
 * machine-readable artifact.
 *
 * This is a RULE/PHRASE-BASED evaluator, NOT an LLM. The evaluator itself runs
 * locally in the browser with no paid API credentials (OR-10). The interface is
 * intentionally narrow so a future LLM-backed implementation can replace
 * `evaluateBehavioralResponse` without touching the UI.
 */

export const DRILL_NAME = "Responsible AI & Customer Data";
export const CONCEPT_NAME = "Banger Drill";

export const SCENARIO_TEXT =
  "You're preparing a presentation and want to use an AI tool to summarize customer feedback. The document contains customer names and email addresses. What would you do?";

export const CLARIFICATION_QUESTION =
  "What would you do with the customer information before using the AI tool?";

export type BehaviorId =
  | "do_not_upload_customer_pii"
  | "anonymize_sensitive_information"
  | "use_approved_ai_tool";

export type ResultStatus = "demonstrated" | "needs_reinforcement" | "high_risk_gap";

export interface Behavior {
  id: BehaviorId;
  letter: "A" | "B" | "C";
  label: string;
  gapMessage: string;
}

export const BEHAVIORS: Behavior[] = [
  {
    id: "do_not_upload_customer_pii",
    letter: "A",
    label: "Do not upload personally identifiable customer information.",
    gapMessage: "Customer-identifiable information must never be uploaded to an AI tool.",
  },
  {
    id: "anonymize_sensitive_information",
    letter: "B",
    label: "Remove or anonymize sensitive information before using AI.",
    gapMessage: "Customer information must be removed or anonymized before using AI.",
  },
  {
    id: "use_approved_ai_tool",
    letter: "C",
    label: "Use only an approved AI tool.",
    gapMessage: "Only an approved AI tool may be used for this work.",
  },
];

/** Fictional demo identifiers. In production these would come from the existing song/project record. */
export const DEMO_BANGER_ID = "banger_demo_0001";
export const DRILL_ID = "responsible_ai_customer_data_v1";

/**
 * Compact, persistable payload that ties one drill run to one Banger.
 * Nothing here is invented business data — it is exactly what this session produced.
 */
export interface ProofOfImpactPayload {
  banger_id: string;
  drill_id: string;
  assessment_completed: boolean;
  behaviors_demonstrated_count: number;
  total_behaviors: number;
  result: ResultStatus;
  clarification_asked: boolean;
  completed_at: string;
}

export interface BehavioralResult {
  concept: string;
  drill: string;
  result: ResultStatus;
  behaviors_demonstrated: BehaviorId[];
  behaviors_missed: BehaviorId[];
  clarification_asked: boolean;
  most_important_gap: string | null;
  reinforcement_message: string;
  proof_of_impact: ProofOfImpactPayload;
}

const norm = (s: string) => " " + s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim() + " ";
const has = (t: string, phrases: string[]) => phrases.some((p) => t.includes(" " + p + " ") || t.includes(" " + p));

/** Phrases that indicate the person would hand the raw PII document to the AI. */
const UPLOAD_PII_PHRASES = [
  "upload the document",
  "upload it",
  "upload the file",
  "paste the document",
  "paste it in",
  "copy the whole",
  "give it the document",
  "feed it the document",
  "just summarize it",
  "upload the feedback",
];

const REMOVAL_PHRASES = [
  "remove",
  "removing",
  "delete",
  "strip",
  "redact",
  "anonymize",
  "anonymise",
  "anonymized",
  "anonymised",
  "de identify",
  "deidentify",
  "pseudonymize",
  "mask",
  "take out",
  "scrub",
];

const PII_PHRASES = [
  "name",
  "names",
  "email",
  "emails",
  "email address",
  "email addresses",
  "personal data",
  "personal information",
  "customer data",
  "customer information",
  "pii",
  "identifiable",
  "contact details",
];

const APPROVED_TOOL_PHRASES = [
  "approved",
  "approved tool",
  "approved ai",
  "sanctioned",
  "authorised tool",
  "authorized tool",
  "company approved",
  "internal tool",
  "internal ai",
  "whitelisted",
  "on the approved list",
  "policy approved",
];

const VAGUE_PHRASES = [
  "check with someone",
  "ask someone",
  "ask my manager",
  "check with my manager",
  "ask it",
  "check first",
  "ask first",
  "not sure",
  "i would check",
  "i d check",
  "id check",
  "ask legal",
  "ask compliance",
  "double check",
];

/**
 * True when the answer signals hesitation/deferral but says nothing about what
 * happens to the customer data. Drives the single spoken clarification turn (OR-3).
 */
export function isVagueResponse(text: string): boolean {
  const t = norm(text);
  if (t.trim().length < 3) return true;
  const mentionsDataHandling =
    (has(t, REMOVAL_PHRASES) && has(t, PII_PHRASES)) || has(t, UPLOAD_PII_PHRASES) || has(t, APPROVED_TOOL_PHRASES);
  if (mentionsDataHandling) return false;
  if (has(t, VAGUE_PHRASES)) return true;
  // Very short answers with no concrete behavior are treated as vague.
  return t.trim().split(" ").length < 12;
}

export interface EvaluateOptions {
  clarificationAsked: boolean;
}

/**
 * Evaluate a combined (initial + clarification) answer against the three
 * expected behaviors and return the structured Behavioral Result.
 *
 * Swap-point for a future LLM evaluator: keep this signature.
 */
export function evaluateBehavioralResponse(
  responseText: string,
  options: EvaluateOptions = { clarificationAsked: false },
): BehavioralResult {
  const t = norm(responseText);

  const removesPii = has(t, REMOVAL_PHRASES) && has(t, PII_PHRASES);
  const uploadsPii = has(t, UPLOAD_PII_PHRASES) && !removesPii;
  const usesApprovedTool = has(t, APPROVED_TOOL_PHRASES);

  const demonstrated: BehaviorId[] = [];
  if (!uploadsPii && removesPii) demonstrated.push("do_not_upload_customer_pii");
  if (removesPii) demonstrated.push("anonymize_sensitive_information");
  if (usesApprovedTool) demonstrated.push("use_approved_ai_tool");

  const missed = BEHAVIORS.map((b) => b.id).filter((id) => !demonstrated.includes(id));

  let result: ResultStatus;
  if (demonstrated.length === 3) result = "demonstrated";
  else if (uploadsPii || missed.includes("anonymize_sensitive_information")) result = "high_risk_gap";
  else result = "needs_reinforcement";

  const firstMissed = BEHAVIORS.find((b) => missed.includes(b.id));
  const gapPriority: BehaviorId[] = [
    "anonymize_sensitive_information",
    "do_not_upload_customer_pii",
    "use_approved_ai_tool",
  ];
  const priorityGap = gapPriority.find((id) => missed.includes(id));
  const gapBehavior = BEHAVIORS.find((b) => b.id === priorityGap) ?? firstMissed;

  const reinforcement =
    demonstrated.length === 3
      ? "Keep doing this: anonymize first, then use only an approved AI tool."
      : "Remove customer-identifiable information before using an approved AI tool.";

  return {
    concept: CONCEPT_NAME,
    drill: DRILL_NAME,
    result,
    behaviors_demonstrated: demonstrated,
    behaviors_missed: missed,
    clarification_asked: options.clarificationAsked,
    most_important_gap: gapBehavior ? gapBehavior.gapMessage : null,
    reinforcement_message: reinforcement,
    proof_of_impact: {
      banger_id: DEMO_BANGER_ID,
      drill_id: DRILL_ID,
      assessment_completed: true,
      behaviors_demonstrated_count: demonstrated.length,
      total_behaviors: BEHAVIORS.length,
      result,
      clarification_asked: options.clarificationAsked,
      completed_at: new Date().toISOString(),
    },
  };
}

export const STATUS_LABEL: Record<ResultStatus, string> = {
  demonstrated: "DEMONSTRATED",
  needs_reinforcement: "NEEDS REINFORCEMENT",
  high_risk_gap: "HIGH-RISK GAP",
};

export const DEMO_ANSWERS = {
  bad: "I would upload the document and ask the AI to summarize it, but I wouldn't share the result externally.",
  vague: "I'd check with someone first.",
  good: "I would remove names and email addresses, use only an approved AI tool, and then summarize the anonymized feedback.",
};
