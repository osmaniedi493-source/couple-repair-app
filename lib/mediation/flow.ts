import type { AvatarKey } from "@/lib/types";
import type { BehaviorLevel, MediationControlState, MediationMessage, MediationSession, MediationStage, Speaker } from "./types";

type Role = "person_a" | "person_b";

export const stageLabels: Record<MediationStage, string> = {
  collect_a: "先听第一方说完",
  collect_b: "再听另一方说完",
  clarify: "按需澄清",
  safety: "安全优先",
  final_analysis: "联合分析"
};

export const stageOrder: MediationStage[] = ["collect_a", "collect_b", "clarify", "safety", "final_analysis"];

export function createMessage(
  speaker: Speaker,
  kind: MediationMessage["kind"],
  content: string,
  stage: MediationStage
): MediationMessage {
  return {
    id: `${speaker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    speaker,
    kind,
    content,
    createdAt: new Date().toISOString(),
    stage
  };
}

export function createInitialSession(
  personAName = "猫猫",
  personBName = "狗狗",
  personAAvatarKey?: AvatarKey,
  personBAvatarKey?: AvatarKey,
  timelineEntryId?: string,
  entryTitle?: string
): MediationSession {
  return {
    id: `session-${Date.now()}`,
    title: entryTitle || "这次吵架复盘",
    timelineEntryId,
    entryTitle,
    stage: "collect_a",
    personAName,
    personBName,
    personAAvatarKey,
    personBAvatarKey,
    updatedAt: new Date().toISOString(),
    clarifyQuestionsAsked: 0,
    askedQuestionGoals: [],
    behaviorLevel: "L1",
    messages: [
      createMessage(
        "ai",
        "assistant",
        `先别急着判断谁对谁错。\n\n请你们分别说说：\n这次发生了什么？\n什么事情让你不舒服？\n\n先由${personAName}回答。`,
        "collect_a"
      )
    ]
  };
}

/**
 * The fixed, near-literal acknowledgment used when the first side finishes
 * their statement. Deliberately hardcoded (no model call) so it can never
 * drift into summarizing, analyzing, or asking a follow-up — see spec
 * section 2 ("禁止 A 说完以后立刻分析/追问").
 */
export function firstStatementAck(otherPersonName: string): string {
  return `我听到了。先不急着判断，我想先听听${otherPersonName}怎么看这件事。`;
}

/**
 * Used when the side that already went sends another message before the
 * other person has spoken at all. Still no analysis, still no question.
 */
export function stillWaitingAck(otherPersonName: string): string {
  return `好，这段也记下了。我们再等${otherPersonName}说说看。`;
}

/** Soft cap on clarifying questions per spec section 13. Enforced in code as a backstop. */
export const MAX_CLARIFY_QUESTIONS = 3;

export function otherRole(role: Role): Role {
  return role === "person_a" ? "person_b" : "person_a";
}

export function nameFor(session: MediationSession, role: Role) {
  return role === "person_a" ? session.personAName : session.personBName;
}

export function userMessageCount(session: MediationSession, role: Role) {
  return session.messages.filter((message) => message.kind === "user" && message.speaker === role).length;
}

const BEHAVIOR_SEVERITY: Record<BehaviorLevel, number> = { L1: 0, L2: 1, L3: 2, L4: 3 };

/** Behavior level only ever ratchets up within a session — a calmer later message
 * cannot erase an earlier disclosed L3/L4 behavior. */
export function mergeBehaviorLevel(current: BehaviorLevel, next: BehaviorLevel): BehaviorLevel {
  return BEHAVIOR_SEVERITY[next] > BEHAVIOR_SEVERITY[current] ? next : current;
}

/**
 * The displayed stage is derived from behaviorLevel in code, not trusted
 * from the model's own control.stage field — the model may reasonably want
 * one more clarifying question after detecting L4 (e.g. "is this a repeated
 * pattern?"), but the session must still surface as "safety" so the UI and
 * the rest of the flow never keep treating it as ordinary two-sided
 * mediation once a high-risk behavior has been disclosed.
 */
export function resolveDisplayStage(behaviorLevel: BehaviorLevel): "safety" | "clarify" {
  return behaviorLevel === "L4" ? "safety" : "clarify";
}

export type CollectDecision = { bothSpoken: true } | { bothSpoken: false; ack: string };

/**
 * Pure decision for the "collect_a"/"collect_b" stages: given a session whose
 * messages already include the just-submitted user message, decide whether
 * both sides have now given a full statement, or what fixed acknowledgment to
 * send while still waiting. No model call — see spec section 2.
 */
export function decideCollectTurn(session: MediationSession, role: Role): CollectDecision {
  const bothSpoken = userMessageCount(session, "person_a") > 0 && userMessageCount(session, "person_b") > 0;
  if (bothSpoken) return { bothSpoken: true };

  const speakingAgain = userMessageCount(session, role) > 1;
  const other = nameFor(session, otherRole(role));
  return { bothSpoken: false, ack: speakingAgain ? stillWaitingAck(other) : firstStatementAck(other) };
}

export type ClarifyCapResult = { control: MediationControlState; replyOverride: string | null };

/**
 * Backstop for spec section 13's soft round cap: if the model still wants to
 * ask another question after the cap is reached, force a transition to
 * analysis instead. The model is instructed to self-limit; this makes a
 * runaway question loop structurally impossible regardless.
 */
export function applyClarifyCap(control: MediationControlState, clarifyQuestionsAsked: number): ClarifyCapResult {
  if (control.should_ask_question && clarifyQuestionsAsked >= MAX_CLARIFY_QUESTIONS) {
    return {
      control: { ...control, should_ask_question: false, information_sufficient: true, analysis_ready: true },
      replyOverride: "我觉得已经听得比较清楚了，我们直接来看看整体分析。"
    };
  }
  return { control, replyOverride: null };
}

export function placeholderFor(stage: MediationStage): string {
  if (stage === "collect_a" || stage === "collect_b") {
    return "从你看到的事情开始说：发生了什么、什么地方让你不舒服。比如：我们本来约好周六出去，但对方周五晚上临时说要加班……";
  }
  if (stage === "clarify") return "补充刚才被问到的部分，或者说说你还想让对方知道的事。";
  if (stage === "safety") return "如果愿意，可以说说现在的具体情况和你需要什么支持。";
  return "已经可以生成联合分析。";
}
