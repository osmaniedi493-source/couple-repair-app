import { NextResponse } from "next/server";
import { upsertUserByPhone } from "@/lib/server/db";
import { avatarProfiles, type AvatarKey } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; avatarKey?: string; name?: string };
    const phone = (body.phone || "").trim();
    const avatarKey: AvatarKey = body.avatarKey === "boy" ? "boy" : "girl";
    const name = (body.name || "").trim().slice(0, 10) || avatarProfiles[avatarKey].defaultName;

    if (phone.replace(/\D/g, "").length < 6) {
      return NextResponse.json({ error: "请输入有效的手机号。" }, { status: 400 });
    }

    const user = await upsertUserByPhone({ phone, avatarKey, name });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "登录失败，请重试。" }, { status: 500 });
  }
}
