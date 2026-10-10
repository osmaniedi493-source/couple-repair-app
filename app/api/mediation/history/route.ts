import { NextResponse } from "next/server";
import type { MediationSession } from "@/lib/mediation/types";
import { getCoupleById, listCurrentFinalSessions, listMediationHistory } from "@/lib/server/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coupleId = url.searchParams.get("coupleId") || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    const [archived, currentFinal] = await Promise.all([
      listMediationHistory(coupleId),
      listCurrentFinalSessions(coupleId)
    ]);

    const sessions: MediationSession[] = [...currentFinal, ...archived].sort(
      (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
    );

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载失败。" }, { status: 500 });
  }
}
