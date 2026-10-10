import { NextResponse } from "next/server";
import {
  consumePairCodeAndJoin,
  createPairCode,
  findOwnPairCode,
  findUserById,
  getCoupleById,
  unbindCouple
} from "@/lib/server/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || "";

    const user = await findUserById(userId);
    if (!user) return NextResponse.json({ error: "用户不存在，请重新登录。" }, { status: 404 });

    const ownCode = await findOwnPairCode(userId);

    if (!user.coupleId) {
      return NextResponse.json({ user, couple: null, ownCode });
    }

    const couple = await getCoupleById(user.coupleId);
    const partnerId = couple?.memberIds.find((id) => id !== userId);
    const partner = partnerId ? await findUserById(partnerId) : undefined;
    return NextResponse.json({ user, couple: couple || null, partner: partner || null, ownCode });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; userId?: string; code?: string };
    const userId = body.userId || "";

    if (body.action === "create") {
      const user = await findUserById(userId);
      if (!user) return NextResponse.json({ error: "用户不存在，请重新登录。" }, { status: 404 });
      if (user.coupleId) return NextResponse.json({ error: "你已经绑定了情侣关系。" }, { status: 400 });

      const code = await createPairCode(userId);
      return NextResponse.json({ code });
    }

    if (body.action === "join") {
      const result = await consumePairCodeAndJoin(userId, body.code || "");
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ couple: result.couple, partner: result.inviter });
    }

    if (body.action === "unbind") {
      const result = await unbindCouple(userId);
      if (!result.ok) {
        const status = result.error === "用户不存在，请重新登录。" ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "未知操作。" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "操作失败。" }, { status: 500 });
  }
}
