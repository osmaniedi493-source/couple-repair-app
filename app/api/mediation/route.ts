import { NextResponse } from "next/server";
import { completeWithModel, parseJsonObject } from "@/lib/llm/provider";
import {
  applyClarifyCap,
  createInitialSession,
  createMessage,
  decideCollectTurn,
  mergeBehaviorLevel,
  resolveDisplayStage
} from "@/lib/mediation/flow";
import {
  fallbackFinalAnalysis,
  fallbackSafetyAnalysis,
  finalAnalysisPrompt,
  safetyAnalysisPrompt,
  turnPrompt
} from "@/lib/mediation/prompts";
import type { FinalMediationAnalysis, MediationControlState, MediationSession, SafetyAnalysis } from "@/lib/mediation/types";
import {
  archiveMediationSession,
  findTimelineEntry,
  getCoupleById,
  getMediationSession,
  listCoupleMembersOrdered,
  saveMediationSession
} from "@/lib/server/db";
import type { Couple } from "@/lib/types";

type Role = "person_a" | "person_b";

function resolveRole(couple: Couple, userId: string): Role | null {
  const index = couple.memberIds.indexOf(userId);
  if (index === 0) return "person_a";
  if (index === 1) return "person_b";
  return null;
}

async function ensureSession(couple: Couple, entryId: string): Promise<MediationSession> {
  const existing = await getMediationSession(couple.id, entryId);
  if (existing) return existing;

  const [personA, personB] = await listCoupleMembersOrdered(couple);
  const entry = await findTimelineEntry(entryId);
  const created = createInitialSession(
    personA?.name || "A",
    personB?.name || "B",
    personA?.avatarKey,
    personB?.avatarKey,
    entryId,
    entry?.title
  );
  await saveMediationSession(couple.id, entryId, created);
  return created;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coupleId = url.searchParams.get("coupleId") || "";
    const entryId = url.searchParams.get("entryId") || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });
    if (!entryId) return NextResponse.json({ error: "缺少关联的时间线记录。" }, { status: 400 });

    const session = await ensureSession(couple, entryId);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      coupleId?: string;
      userId?: string;
      entryId?: string;
      message?: string;
      action?: "submit" | "finalize" | "reset";
    };
    const coupleId = body.coupleId || "";
    const userId = body.userId || "";
    const entryId = body.entryId || "";

    if (!entryId) {
      return NextResponse.json({ error: "缺少关联的时间线记录。" }, { status: 400 });
    }

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 400 });
    const role = resolveRole(couple, userId);
    if (!role) return NextResponse.json({ error: "你不是这段关系的成员。" }, { status: 400 });

    const session = await ensureSession(couple, entryId);

    if (body.action === "reset") {
      const freshSession = createInitialSession(
        session.personAName,
        session.personBName,
        session.personAAvatarKey,
        session.personBAvatarKey,
        entryId,
        session.entryTitle
      );
      const saved = await persistSession(coupleId, entryId, freshSession, session);
      return NextResponse.json({ session: saved } satisfies { session: MediationSession });
    }

    if (body.action === "finalize") {
      const saved = await runFinalize(session, coupleId, entryId);
      return NextResponse.json({ session: saved } satisfies { session: MediationSession });
    }

    if (session.stage === "final_analysis") {
      return NextResponse.json({ error: "本次复盘已经完成联合分析，如需继续请重新开始。" }, { status: 400 });
    }

    const content = (body.message || "").trim();
    if (!content) {
      return NextResponse.json({ error: "请输入内容。" }, { status: 400 });
    }

    const userMessage = createMessage(role, "user", content, session.stage);
    let working: MediationSession = { ...session, messages: [...session.messages, userMessage] };

    if (working.stage === "collect_a" || working.stage === "collect_b") {
      const decision = decideCollectTurn(working, role);

      if (!decision.bothSpoken) {
        // Still waiting on one side. Deterministic, no model call — guarantees we
        // never analyze, summarize, or question before both have fully spoken.
        const assistantMessage = createMessage("ai", "assistant", decision.ack, "collect_b");
        working = {
          ...working,
          stage: "collect_b",
          updatedAt: new Date().toISOString(),
          messages: [...working.messages, assistantMessage]
        };
        const saved = await persistSession(coupleId, entryId, working);
        return NextResponse.json({ session: saved, assistantMessage } satisfies {
          session: MediationSession;
          assistantMessage: typeof assistantMessage;
        });
      }

      // Both sides have now given a full initial statement — hand off to the
      // dynamic information-sufficiency turn below by falling through with
      // stage advanced to "clarify".
      working = { ...working, stage: "clarify" };
    }

    // stage is "clarify" or "safety" — run the structured turn call.
    const { reply, control } = await runTurn(working);
    working = {
      ...working,
      behaviorLevel: mergeBehaviorLevel(working.behaviorLevel, control.behavior_level),
      lastControl: control
    };

    const capped = applyClarifyCap(control, working.clarifyQuestionsAsked);
    const cappedControl = capped.control;
    const finalReply = capped.replyOverride ?? reply;

    if (cappedControl.should_ask_question) {
      working.clarifyQuestionsAsked += 1;
      if (cappedControl.question_goal) {
        working.askedQuestionGoals = [...working.askedQuestionGoals, cappedControl.question_goal];
      }
    }

    working.stage = resolveDisplayStage(working.behaviorLevel);

    const assistantMessage = createMessage("ai", "assistant", finalReply, working.stage);
    working = {
      ...working,
      updatedAt: new Date().toISOString(),
      messages: [...working.messages, assistantMessage]
    };

    if (cappedControl.analysis_ready) {
      const saved = await runFinalize(working, coupleId, entryId);
      return NextResponse.json({ session: saved, assistantMessage } satisfies {
        session: MediationSession;
        assistantMessage: typeof assistantMessage;
      });
    }

    const saved = await persistSession(coupleId, entryId, working);
    return NextResponse.json({ session: saved, assistantMessage } satisfies {
      session: MediationSession;
      assistantMessage: typeof assistantMessage;
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "AI 调解服务暂时不可用。"
      },
      { status: 500 }
    );
  }
}

async function persistSession(
  coupleId: string,
  entryId: string,
  session: MediationSession,
  archiveIfComplete?: MediationSession
) {
  if (archiveIfComplete && (archiveIfComplete.finalAnalysis || archiveIfComplete.safetyAnalysis)) {
    await archiveMediationSession(coupleId, archiveIfComplete);
  }
  await saveMediationSession(coupleId, entryId, session);
  return session;
}

async function runTurn(session: MediationSession): Promise<{ reply: string; control: MediationControlState }> {
  try {
    const text = await completeWithModel(turnPrompt(session), { temperature: 0.4 });
    const parsed = parseJsonObject<{ reply: string; control: MediationControlState }>(text);
    if (!parsed.reply || !parsed.control) throw new Error("模型返回的结构不完整。");
    return parsed;
  } catch {
    return {
      reply: "这一点我听到了。能再说说这里面最让你在意的具体行为是什么吗？",
      control: {
        stage: "CLARIFY",
        information_sufficient: false,
        missing_information: [],
        behavior_level: session.behaviorLevel,
        should_ask_question: true,
        question_goal: "澄清最在意的具体行为",
        analysis_ready: false
      }
    };
  }
}

async function runFinalize(session: MediationSession, coupleId: string, entryId: string) {
  const isSafety = session.behaviorLevel === "L4";
  let nextSession: MediationSession;

  if (isSafety) {
    const safetyAnalysis = await generateSafetyAnalysis(session);
    nextSession = {
      ...session,
      stage: "final_analysis",
      safetyAnalysis,
      updatedAt: new Date().toISOString(),
      messages: [
        ...session.messages,
        createMessage("ai", "assistant", "我已经整理好这次的情况说明，安全和边界是现在最优先的事。", "final_analysis")
      ]
    };
  } else {
    const finalAnalysis = await generateFinalAnalysis(session);
    nextSession = {
      ...session,
      stage: "final_analysis",
      finalAnalysis,
      updatedAt: new Date().toISOString(),
      messages: [
        ...session.messages,
        createMessage("ai", "assistant", "我已经整理好这次复盘。你们可以先看判断理由，再决定要不要修改。", "final_analysis")
      ]
    };
  }

  return persistSession(coupleId, entryId, nextSession);
}

async function generateFinalAnalysis(session: MediationSession) {
  try {
    const text = await completeWithModel(finalAnalysisPrompt(session), { temperature: 0.6 });
    return parseJsonObject<FinalMediationAnalysis>(text);
  } catch {
    return fallbackFinalAnalysis(session.behaviorLevel);
  }
}

async function generateSafetyAnalysis(session: MediationSession) {
  try {
    const text = await completeWithModel(safetyAnalysisPrompt(session), { temperature: 0.3 });
    return parseJsonObject<SafetyAnalysis>(text);
  } catch {
    return fallbackSafetyAnalysis();
  }
}
