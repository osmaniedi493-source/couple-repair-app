import type { AvatarKey } from "@/lib/types";

/**
 * Visible conversation stage, persisted on the session.
 *
 * collect_a / collect_b — both sides must give a full initial account before
 * any analysis or follow-up questioning happens. This ordering is enforced
 * in code (app/api/mediation/route.ts), not left to the model's discretion.
 *
 * clarify — dynamic, information-sufficiency-driven clarification. Not a
 * fixed pipeline of sub-steps; the model decides each turn whether another
 * question is warranted at all.
 *
 * safety — entered when a high-risk behavior (L4) is detected. Normal
 * "what should each of you change" repair framing is suspended.
 *
 * final_analysis — joint analysis has been generated (either the normal
 * six-section report, or, if behaviorLevel is L4, a safety-focused one).
 */
export type MediationStage = "collect_a" | "collect_b" | "clarify" | "safety" | "final_analysis";

export type Speaker = "person_a" | "person_b" | "ai";
export type MessageKind = "user" | "assistant" | "system";

export type MediationMessage = {
  id: string;
  speaker: Speaker;
  kind: MessageKind;
  content: string;
  createdAt: string;
  stage: MediationStage;
};

/** Behavior severity gate — see spec section 8. */
export type BehaviorLevel =
  | "L1" // ordinary need conflict (timing, space, chores, ...)
  | "L2" // poor communication behavior (stonewalling, sarcasm, interrupting, ...)
  | "L3" // clear boundary-crossing / harm (insults, threats, repeated violation of a stated limit)
  | "L4"; // high risk (violence, coercion, serious control, safety threat)

/**
 * Structured internal control output the model returns every turn during
 * the "clarify" stage. This is never shown to the user — it drives the
 * code's stage transitions, question-suppression, and early-exit logic.
 */
export type MediationControlState = {
  stage: "COLLECT_BOTH" | "CLARIFY" | "JOINT_ANALYSIS" | "SAFETY";
  information_sufficient: boolean;
  missing_information: string[];
  behavior_level: BehaviorLevel;
  should_ask_question: boolean;
  question_goal: string | null;
  analysis_ready: boolean;
};

/**
 * Final joint analysis. Deliberately has no percentage-based responsibility
 * split and no temperature/emotion score — see spec sections 10-11. Behavior
 * change suggestions may be asymmetric; harmNote is the required sentence
 * that explains a behavior without using that explanation to equalize
 * responsibility for a more severe (L3/L4) behavior.
 */
export type FinalMediationAnalysis = {
  title: string;
  whatHappened: string; // 1. 这次冲突发生了什么 — the interaction loop, not a timeline
  coreTension: string; // 2. 真正卡住你们的地方
  personA: { needs: string[] }; // 3a. A 在保护什么
  personB: { needs: string[] }; // 3b. B 在保护什么
  behaviorLevel: BehaviorLevel;
  behaviorSummary: string; // plain-language label, e.g. "这次主要是需求差异"
  behaviorChanges: {
    personA: string[];
    personB: string[];
    harmNote?: string; // required when behaviorLevel is L3/L4
  }; // 4. 哪些行为需要改变
  repairPlan: string[]; // 5. 下一次具体怎么做 — 2-4 concrete, executable actions
  oneSentenceToSay: { personA: string; personB: string }; // 6.
};

/**
 * Produced instead of FinalMediationAnalysis when behaviorLevel reaches L4.
 * Deliberately does not ask "what should each of you change" — that framing
 * is inappropriate for a safety issue.
 */
export type SafetyAnalysis = {
  title: string;
  whatHappened: string;
  safetyNote: string;
  suggestions: string[];
};

export type MediationSession = {
  id: string;
  title: string;
  timelineEntryId?: string;
  entryTitle?: string;
  stage: MediationStage;
  personAName: string;
  personBName: string;
  personAAvatarKey?: AvatarKey;
  personBAvatarKey?: AvatarKey;
  updatedAt?: string;
  messages: MediationMessage[];
  /** How many clarifying questions have been asked so far (soft cap ~3). */
  clarifyQuestionsAsked: number;
  /** question_goal of every clarifying question already asked, for repeat-suppression. */
  askedQuestionGoals: string[];
  /** Highest behavior level observed so far this session. */
  behaviorLevel: BehaviorLevel;
  /** Last control state returned by the model, kept for continuity/debugging. Never shown to the user. */
  lastControl?: MediationControlState;
  finalAnalysis?: FinalMediationAnalysis;
  safetyAnalysis?: SafetyAnalysis;
};

export type MediationResponse = {
  session: MediationSession;
  assistantMessage?: MediationMessage;
};
