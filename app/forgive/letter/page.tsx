"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import FloatingNewButton from "@/components/FloatingNewButton";
import { useCoupleSession } from "@/lib/client/useCoupleSession";
import type { ForgiveItem } from "@/lib/types";

export default function LetterWallPage() {
  const { session, members } = useCoupleSession();
  const [items, setItems] = useState<ForgiveItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (coupleId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/forgive?coupleId=${encodeURIComponent(coupleId)}&kind=letter`);
      const data = await response.json();
      if (response.ok) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.coupleId) refresh(session.coupleId);
  }, [session, refresh]);

  function authorName(userId: string) {
    return members.find((member) => member.id === userId)?.name || "TA";
  }

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-2xl gap-6 px-5 py-8">
      <AppNav />
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-rose">修复与和解</p>
          <h1 className="text-3xl font-black text-ink">道歉小作文</h1>
        </div>
        <Link href="/forgive" className="text-sm font-bold text-slate-400 underline">
          返回
        </Link>
      </header>

      {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}

      {!loading && items.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-[24px] border-2 border-dashed border-ink/20 bg-white/60 p-10 text-center">
          <p className="text-slate-500">还没有写过道歉小作文，点右下角写第一篇吧。</p>
        </div>
      ) : null}

      <div className="grid gap-1 overflow-hidden rounded-[24px] border-2 border-ink bg-white shadow-sticker">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={`/forgive/letter/${item.id}`}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              index !== items.length - 1 ? "border-b border-ink/10" : ""
            }`}
          >
            <div className="grid min-w-0 gap-1">
              <strong className="truncate font-black text-ink">{authorName(item.authorUserId)} 的道歉</strong>
              <span className="truncate text-sm text-slate-500">{item.message}</span>
            </div>
            <span className="shrink-0 text-xs font-bold text-slate-400">
              {new Date(item.createdAt).toLocaleDateString("zh-CN")}
            </span>
          </Link>
        ))}
      </div>

      <FloatingNewButton href="/forgive/letter/new" />
    </main>
  );
}
