import { NextResponse } from "next/server";
import {
  createTimelineEntry,
  deleteTimelineEntry,
  findTimelineEntry,
  getCoupleById,
  listCoupleMembersOrdered,
  listTimelineEntries,
  updateTimelineEntry
} from "@/lib/server/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coupleId = url.searchParams.get("coupleId") || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    const [entries, members] = await Promise.all([listTimelineEntries(coupleId), listCoupleMembersOrdered(couple)]);
    return NextResponse.json({ entries, members: members.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      coupleId?: string;
      authorUserId?: string;
      title?: string;
      scene?: string;
      emotions?: string[];
      time?: string;
    };

    const coupleId = body.coupleId || "";
    const authorUserId = body.authorUserId || "";
    const title = (body.title || "").trim();
    if (!title) return NextResponse.json({ error: "请先写一句话事件。" }, { status: 400 });

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });
    if (!couple.memberIds.includes(authorUserId)) {
      return NextResponse.json({ error: "你不是这段关系的成员。" }, { status: 403 });
    }

    await createTimelineEntry({
      coupleId,
      authorUserId,
      title,
      scene: body.scene || "线上聊天",
      emotions: Array.isArray(body.emotions) ? body.emotions : [],
      time: body.time || new Date().toISOString()
    });

    const [entries, members] = await Promise.all([listTimelineEntries(coupleId), listCoupleMembersOrdered(couple)]);
    return NextResponse.json({ entries, members: members.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      coupleId?: string;
      id?: string;
      title?: string;
      whatHappened?: string;
      whyItMatters?: string;
    };
    const coupleId = body.coupleId || "";
    const id = body.id || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    const existing = await findTimelineEntry(id);
    if (!existing || existing.coupleId !== coupleId) {
      return NextResponse.json({ error: "记录不存在。" }, { status: 404 });
    }

    const entry = await updateTimelineEntry(id, {
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : undefined,
      whatHappened: typeof body.whatHappened === "string" ? body.whatHappened.trim() : undefined,
      whyItMatters: typeof body.whyItMatters === "string" ? body.whyItMatters.trim() : undefined
    });

    const [entries, members] = await Promise.all([listTimelineEntries(coupleId), listCoupleMembersOrdered(couple)]);
    return NextResponse.json({ entry, entries, members: members.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const coupleId = url.searchParams.get("coupleId") || "";
    const id = url.searchParams.get("id") || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    await deleteTimelineEntry(coupleId, id);

    const [entries, members] = await Promise.all([listTimelineEntries(coupleId), listCoupleMembersOrdered(couple)]);
    return NextResponse.json({ entries, members: members.filter(Boolean) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败。" }, { status: 500 });
  }
}
