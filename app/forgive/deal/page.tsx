"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import FloatingNewButton from "@/components/FloatingNewButton";
import { useCoupleSession } from "@/lib/client/useCoupleSession";
import { avatarProfiles, type ForgiveItem } from "@/lib/types";

export default function DealWallPage() {
  const { session, members } = useCoupleSession();
  const [items, setItems] = useState<ForgiveItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (coupleId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/forgive?coupleId=${encodeURIComponent(coupleId)}&kind=deal`);
      const data = await response.json();
      if (response.ok) setItems(data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.coupleId) refresh(session.coupleId);
  }, [session, refresh]);

  async function toggleCell(itemId: string, cellIndex: number) {
    if (!session?.coupleId) return;
    const response = await fetch("/api/forgive", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coupleId: session.coupleId, id: itemId, cellIndex })
    });
    const data = await response.json();
    if (response.ok) setItems(data.items);
  }

  async function removeItem(itemId: string) {
    if (!session?.coupleId) return;
    if (!window.confirm("确定要删除这条约定吗？删除后无法恢复。")) return;
    const response = await fetch(
      `/api/forgive?coupleId=${encodeURIComponent(session.coupleId)}&id=${encodeURIComponent(itemId)}`,
      { method: "DELETE" }
    );
    const data = await response.json();
    if (response.ok) setItems(data.items);
  }

  function authorOf(userId: string) {
    return members.find((member) => member.id === userId);
  }

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-2xl gap-6 px-5 py-8">
      <AppNav />
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-rose">修复与和解</p>
          <h1 className="text-3xl font-black text-ink">说到做到</h1>
          <p className="mt-1 text-sm text-slate-500">
            比如约定戒烟，如果再抽一次烟，就给对方 500 块作为惩罚。
          </p>
        </div>
        <Link href="/forgive" className="text-sm font-bold text-slate-400 underline">
          返回
        </Link>
      </header>

      {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}

      {!loading && items.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-[24px] border-2 border-dashed border-ink/20 bg-white/60 p-10 text-center">
          <p className="text-slate-500">还没有约定，点右下角新建一个吧。</p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {items.map((item) => {
          const author = authorOf(item.authorUserId);
          const avatar = author ? avatarProfiles[author.avatarKey] : null;
          const total = item.totalCells || 20;
          const cells = item.cells && item.cells.length === total ? item.cells : new Array(total).fill(false);
          return (
            <article key={item.id} className="relative grid gap-3 rounded-2xl border-2 border-ink bg-white p-5 pb-14 shadow-sticker">
              <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-500">
                <span className="flex items-center gap-1.5">
                  {avatar ? <Image src={avatar.src} alt={author?.name || ""} width={20} height={20} className="h-5 w-5 object-contain" /> : null}
                  {author?.name || "TA"}
                </span>
                <span>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</span>
              </div>
              <p className="font-bold text-ink">承诺：{item.commitment}</p>
              <p className="text-sm text-slate-500">补偿约定：{item.deal}</p>
              <div className="grid grid-cols-10 gap-1.5">
                {cells.map((filled, index) => (
                  <button
                    key={index}
                    onClick={() => toggleCell(item.id, index)}
                    className={`aspect-square rounded-md border-2 border-ink/20 ${filled ? "border-moss bg-moss" : "bg-slate-50"}`}
                    aria-label={`第 ${index + 1} 格`}
                  />
                ))}
              </div>
              <span className="text-sm font-bold text-slate-500">
                {item.progress || 0} / {total} 格已违约
              </span>
              <button
                onClick={() => removeItem(item.id)}
                className="absolute bottom-4 right-4 rounded-full border-2 border-rose px-3 py-1 text-xs font-black text-rose"
              >
                删除
              </button>
            </article>
          );
        })}
      </div>

      <FloatingNewButton href="/forgive/deal/new" />
    </main>
  );
}
