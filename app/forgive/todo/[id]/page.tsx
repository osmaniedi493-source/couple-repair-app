"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppNav from "@/components/AppNav";
import { hardNavigate } from "@/lib/client/navigate";
import { useCoupleSession } from "@/lib/client/useCoupleSession";
import type { ForgiveItem } from "@/lib/types";

function daysLeft(date?: string) {
  if (!date) return 0;
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

export default function TodoDetailPage() {
  const params = useParams<{ id: string }>();
  const { session, members } = useCoupleSession();
  const [item, setItem] = useState<ForgiveItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (coupleId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/forgive?coupleId=${encodeURIComponent(coupleId)}&kind=todo`);
      const data = await response.json();
      const found = (data.items as ForgiveItem[])?.find((entry) => entry.id === params.id);
      if (!found) setError("没有找到这条计划。");
      setItem(found || null);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (session?.coupleId) refresh(session.coupleId);
  }, [session, refresh]);

  async function toggleDone() {
    if (!session?.coupleId || !item) return;
    const response = await fetch("/api/forgive", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coupleId: session.coupleId, id: item.id, done: !item.done })
    });
    const data = await response.json();
    if (response.ok) setItem((data.items as ForgiveItem[]).find((entry) => entry.id === item.id) || item);
  }

  async function removeItem() {
    if (!session?.coupleId || !item) return;
    if (!window.confirm("确定要删除这条计划吗？删除后无法恢复。")) return;
    const response = await fetch(
      `/api/forgive?coupleId=${encodeURIComponent(session.coupleId)}&id=${encodeURIComponent(item.id)}`,
      { method: "DELETE" }
    );
    if (response.ok) hardNavigate("/forgive/todo");
  }

  const author = item ? members.find((member) => member.id === item.authorUserId) : undefined;

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-md gap-6 px-5 py-8">
      <AppNav />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-ink">未来 To Do</h1>
        <Link href="/forgive/todo" className="text-sm font-bold text-slate-400 underline">
          返回列表
        </Link>
      </header>

      {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}
      {error ? <p className="text-sm font-bold text-rose">{error}</p> : null}

      {item ? (
        <div className="grid gap-4">
          <div
            className="grid aspect-square place-items-center rounded-[32px] border-[3px] border-ink p-8 text-center shadow-sticker"
            style={{ background: "linear-gradient(160deg, #ffe3cf 0%, #fff8ef 55%, #eaf2e4 100%)" }}
          >
            <div className="grid gap-2">
              <p className="text-lg font-black text-ink/70">{item.title}</p>
              {item.done ? (
                <strong className="text-5xl font-black text-[#4a5f3d]">已完成 🎉</strong>
              ) : (
                <>
                  <strong className="text-7xl font-black text-ink">{daysLeft(item.targetDate)}</strong>
                  <span className="text-lg font-black text-ink/70">天后</span>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border-2 border-ink bg-white p-4 text-sm shadow-sticker">
            <p className="font-bold text-slate-500">{author?.name || "TA"} 发起 · 目标日 {new Date(item.targetDate || "").toLocaleDateString("zh-CN")}</p>
          </div>

          <button className="rounded-2xl border-2 border-ink bg-white px-6 py-4 font-black text-ink shadow-sticker" onClick={toggleDone}>
            {item.done ? "标记未完成" : "标记完成"}
          </button>
          <button className="rounded-2xl border-2 border-rose px-6 py-4 font-black text-rose" onClick={removeItem}>
            删除
          </button>
        </div>
      ) : null}
    </main>
  );
}
