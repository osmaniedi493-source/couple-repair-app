import { NextResponse } from "next/server";
import { completeWithModel, parseJsonObject } from "@/lib/llm/provider";
import { patternProfilePrompt } from "@/lib/mediation/prompts";
import type { MediationSession } from "@/lib/mediation/types";
import {
  findUserById,
  getCoupleById,
  getPatternProfile,
  listCurrentFinalSessions,
  listMediationHistory,
  savePatternProfile
} from "@/lib/server/db";
import type { PatternProfile } from "@/lib/types";

type Role = "person_a" | "person_b";

function resolveRole(memberIds: string[], userId: string): Role | null {
  const index = memberIds.indexOf(userId);
  if (index === 0) return "person_a";
  if (index === 1) return "person_b";
  return null;
}

function buildContext(session: MediationSession, role: Role, index: number) {
  const roleLabel = role === "person_a" ? "A" : "B";
  const messages = session.messages
    .filter((message) => message.speaker === role)
    .map((message) => `- ${message.content}`)
    .join("\n");
  const analysis = session.finalAnalysis;
  const person = role === "person_a" ? analysis?.personA : analysis?.personB;
  const behaviorChanges = role === "person_a" ? analysis?.behaviorChanges.personA : analysis?.behaviorChanges.personB;
  const safety = session.safetyAnalysis;

  if (safety) {
    return `【复盘 ${index + 1}】标题：${safety.title}（这次涉及需要优先关注安全的行为，AI 没有对个人沟通风格做评价）
${roleLabel} 方自己说过的话：
${messages || "（没有留下发言记录）"}`;
  }

  return `【复盘 ${index + 1}】标题：${analysis?.title || session.title}
本次冲突类型：${analysis?.behaviorSummary || "无"}
${roleLabel} 方自己说过的话：
${messages || "（没有留下发言记录）"}
AI 分析里的核心需求：${person?.needs.join("、") || "无"}
AI 分析里需要调整的行为：${behaviorChanges?.join("；") || "无"}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { coupleId?: string; userId?: string; force?: boolean };
    const coupleId = body.coupleId || "";
    const userId = body.userId || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 400 });
    const role = resolveRole(couple.memberIds, userId);
    if (!role) return NextResponse.json({ error: "你不是这段关系的成员。" }, { status: 400 });

    const [archived, currentFinal] = await Promise.all([listMediationHistory(coupleId), listCurrentFinalSessions(coupleId)]);
    const sessions: MediationSession[] = [...currentFinal, ...archived];
    if (sessions.length === 0) return NextResponse.json({ error: "还没有完整的复盘记录。" }, { status: 400 });

    const cached = await getPatternProfile(coupleId, userId);
    if (cached && cached.sessionCount === sessions.length && !body.force) {
      return NextResponse.json({ profile: cached });
    }

    const person = await findUserById(userId);
    const personName = person?.name || (role === "person_a" ? "A" : "B");
    const roleLabel = role === "person_a" ? "A" : "B";
    const contexts = sessions.map((session, index) => buildContext(session, role, index));

    const text = await completeWithModel(patternProfilePrompt(roleLabel, personName, contexts), { temperature: 0.5 });
    const parsed = parseJsonObject<Omit<PatternProfile, "sessionCount" | "generatedAt">>(text);

    const profile: PatternProfile = {
      ...parsed,
      sessionCount: sessions.length,
      generatedAt: new Date().toISOString()
    };

    await savePatternProfile(coupleId, userId, profile);

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "生成沟通模式失败。" },
      { status: 500 }
    );
  }
}
