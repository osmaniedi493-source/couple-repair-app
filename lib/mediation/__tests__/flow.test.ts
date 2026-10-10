import { describe, expect, it } from "vitest";
import {
  MAX_CLARIFY_QUESTIONS,
  applyClarifyCap,
  createInitialSession,
  createMessage,
  decideCollectTurn,
  firstStatementAck,
  mergeBehaviorLevel,
  resolveDisplayStage,
  stillWaitingAck
} from "../flow";
import type { MediationControlState, MediationSession } from "../types";

function baseControl(overrides: Partial<MediationControlState> = {}): MediationControlState {
  return {
    stage: "CLARIFY",
    information_sufficient: false,
    missing_information: [],
    behavior_level: "L1",
    should_ask_question: true,
    question_goal: "test goal",
    analysis_ready: false,
    ...overrides
  };
}

describe("createInitialSession", () => {
  it("starts in collect_a with an intro message naming person A first", () => {
    const session = createInitialSession("阿柚", "阿橙");
    expect(session.stage).toBe("collect_a");
    expect(session.behaviorLevel).toBe("L1");
    expect(session.clarifyQuestionsAsked).toBe(0);
    expect(session.askedQuestionGoals).toEqual([]);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toContain("先由阿柚回答");
  });
});

describe("decideCollectTurn — spec section 2 (both sides must speak before any analysis)", () => {
  function sessionWithMessages(messages: Array<{ speaker: "person_a" | "person_b"; content: string }>): MediationSession {
    const session = createInitialSession("阿柚", "阿橙");
    for (const m of messages) {
      session.messages.push(createMessage(m.speaker, "user", m.content, "collect_a"));
    }
    return session;
  }

  it("acknowledges briefly and does not analyze when only A has spoken", () => {
    const session = sessionWithMessages([{ speaker: "person_a", content: "他昨天没告诉我就取消了约会" }]);
    const decision = decideCollectTurn(session, "person_a");
    expect(decision.bothSpoken).toBe(false);
    if (!decision.bothSpoken) {
      expect(decision.ack).toBe(firstStatementAck("阿橙"));
      // Must not contain any analysis-flavored language.
      expect(decision.ack).not.toMatch(/责任|分析|建议|你需要/);
    }
  });

  it("does not treat A speaking twice as B having spoken", () => {
    const session = sessionWithMessages([
      { speaker: "person_a", content: "他昨天没告诉我就取消了约会" },
      { speaker: "person_a", content: "而且这已经是第三次了" }
    ]);
    const decision = decideCollectTurn(session, "person_a");
    expect(decision.bothSpoken).toBe(false);
    if (!decision.bothSpoken) {
      expect(decision.ack).toBe(stillWaitingAck("阿橙"));
    }
  });

  it("flags bothSpoken once the second side has given their first statement", () => {
    const session = sessionWithMessages([
      { speaker: "person_a", content: "他昨天没告诉我就取消了约会" },
      { speaker: "person_b", content: "我确实忘了说，但我很忙" }
    ]);
    const decision = decideCollectTurn(session, "person_b");
    expect(decision.bothSpoken).toBe(true);
  });

  it("works regardless of who speaks first (B can go first)", () => {
    const session = sessionWithMessages([{ speaker: "person_b", content: "我们计划有变" }]);
    const decision = decideCollectTurn(session, "person_b");
    expect(decision.bothSpoken).toBe(false);
    if (!decision.bothSpoken) {
      expect(decision.ack).toBe(firstStatementAck("阿柚"));
    }
  });
});

describe("mergeBehaviorLevel — ratchets up, never down", () => {
  it("keeps the more severe level seen so far", () => {
    expect(mergeBehaviorLevel("L1", "L2")).toBe("L2");
    expect(mergeBehaviorLevel("L3", "L1")).toBe("L3");
    expect(mergeBehaviorLevel("L4", "L2")).toBe("L4");
    expect(mergeBehaviorLevel("L2", "L2")).toBe("L2");
  });
});

describe("resolveDisplayStage — L4 always surfaces as safety regardless of the model's own control.stage", () => {
  it("forces safety once behaviorLevel is L4", () => {
    expect(resolveDisplayStage("L4")).toBe("safety");
  });

  it("stays clarify for L1-L3", () => {
    expect(resolveDisplayStage("L1")).toBe("clarify");
    expect(resolveDisplayStage("L2")).toBe("clarify");
    expect(resolveDisplayStage("L3")).toBe("clarify");
  });
});

describe("applyClarifyCap — spec section 13 (hard backstop on question count)", () => {
  it("passes through when under the cap", () => {
    const control = baseControl({ should_ask_question: true });
    const result = applyClarifyCap(control, MAX_CLARIFY_QUESTIONS - 1);
    expect(result.control.should_ask_question).toBe(true);
    expect(result.replyOverride).toBeNull();
  });

  it("forces analysis_ready once the cap is reached, regardless of the model's wish to keep asking", () => {
    const control = baseControl({ should_ask_question: true, information_sufficient: false, analysis_ready: false });
    const result = applyClarifyCap(control, MAX_CLARIFY_QUESTIONS);
    expect(result.control.should_ask_question).toBe(false);
    expect(result.control.analysis_ready).toBe(true);
    expect(result.control.information_sufficient).toBe(true);
    expect(result.replyOverride).not.toBeNull();
  });

  it("does not touch a control that already stopped asking", () => {
    const control = baseControl({ should_ask_question: false, analysis_ready: true });
    const result = applyClarifyCap(control, MAX_CLARIFY_QUESTIONS + 5);
    expect(result.control).toEqual(control);
    expect(result.replyOverride).toBeNull();
  });
});
