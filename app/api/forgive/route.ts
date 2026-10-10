import { NextResponse } from "next/server";
import {
  createForgiveItem,
  deleteForgiveItem,
  findForgiveItem,
  generateId,
  getCoupleById,
  listForgiveItems,
  updateForgiveItemData
} from "@/lib/server/db";
import type { ForgiveItem, ForgiveKind } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coupleId = url.searchParams.get("coupleId") || "";
    const kind = (url.searchParams.get("kind") as ForgiveKind | null) || undefined;

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    const items = await listForgiveItems(coupleId, kind);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "加载失败。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      coupleId?: string;
      authorUserId?: string;
      kind?: ForgiveKind;
      timelineEntryId?: string;
      message?: string;
      title?: string;
      targetDate?: string;
      commitment?: string;
      deal?: string;
      totalCells?: number;
    };

    const coupleId = body.coupleId || "";
    const authorUserId = body.authorUserId || "";

    if (!body.kind || !["letter", "todo", "deal"].includes(body.kind)) {
      return NextResponse.json({ error: "未知类型。" }, { status: 400 });
    }

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });
    if (!couple.memberIds.includes(authorUserId)) {
      return NextResponse.json({ error: "你不是这段关系的成员。" }, { status: 403 });
    }

    const item: ForgiveItem = {
      id: generateId("forgive"),
      coupleId,
      authorUserId,
      kind: body.kind,
      timelineEntryId: body.timelineEntryId,
      createdAt: new Date().toISOString()
    };

    if (body.kind === "letter") {
      if (!body.message?.trim()) return NextResponse.json({ error: "请先写一段给对方的话。" }, { status: 400 });
      item.message = body.message.trim();
    } else if (body.kind === "todo") {
      if (!body.title?.trim()) return NextResponse.json({ error: "请先写清楚要做的事。" }, { status: 400 });
      item.title = body.title.trim();
      item.targetDate = body.targetDate || new Date().toISOString();
      item.done = false;
    } else {
      if (!body.commitment?.trim() || !body.deal?.trim()) {
        return NextResponse.json({ error: "请先写清楚承诺和补偿约定。" }, { status: 400 });
      }
      item.commitment = body.commitment.trim();
      item.deal = body.deal.trim();
      item.totalCells = body.totalCells && body.totalCells > 0 ? body.totalCells : 20;
      item.progress = 0;
      item.cells = new Array(item.totalCells).fill(false);
    }

    await createForgiveItem(item);
    const items = await listForgiveItems(coupleId, item.kind);
    return NextResponse.json({ item, items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      coupleId?: string;
      id?: string;
      cellIndex?: number;
      done?: boolean;
    };
    const coupleId = body.coupleId || "";
    const id = body.id || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    const existing = await findForgiveItem(id);
    if (!existing || existing.coupleId !== coupleId) {
      return NextResponse.json({ error: "记录不存在。" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (existing.kind === "deal" && typeof body.cellIndex === "number") {
      const total = existing.totalCells || 20;
      const cells = existing.cells && existing.cells.length === total ? existing.cells.slice() : new Array(total).fill(false);
      if (body.cellIndex >= 0 && body.cellIndex < total) {
        cells[body.cellIndex] = !cells[body.cellIndex];
      }
      patch.cells = cells;
      patch.progress = cells.filter(Boolean).length;
    }
    if (existing.kind === "todo" && typeof body.done === "boolean") {
      patch.done = body.done;
    }

    const item = await updateForgiveItemData(id, patch);
    const items = await listForgiveItems(coupleId, existing.kind);
    return NextResponse.json({ item, items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新失败。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const coupleId = url.searchParams.get("coupleId") || "";
    const id = url.searchParams.get("id") || "";

    const couple = await getCoupleById(coupleId);
    if (!couple) return NextResponse.json({ error: "还没有绑定情侣关系。" }, { status: 404 });

    const existing = await findForgiveItem(id);
    await deleteForgiveItem(coupleId, id);

    const items = await listForgiveItems(coupleId, existing?.kind);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败。" }, { status: 500 });
  }
}
