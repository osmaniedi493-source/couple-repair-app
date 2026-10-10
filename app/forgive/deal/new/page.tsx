"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { hardNavigate } from "@/lib/client/navigate";
import { useCoupleSession } from "@/lib/client/useCoupleSession";

type TimelineEntryOption = { id: string; title: string };

export default function NewDealPage() {
  const { session } = useCoupleSession();
  const [entries, setEntries] = useState<TimelineEntryOption[]>([]);
  const [timelineEntryId, setTimelineEntryId] = useState("");
  const [commitment, setCommitment] = useState("");
  const [deal, setDeal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.coupleId) return;
    fetch(`/api/timeline?coupleId=${encodeURIComponent(session.coupleId)}`)
      .then((response) => response.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {});
  }, [session]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!session?.coupleId || saving || !commitment.trim() || !deal.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/forgive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleId: session.coupleId,
          authorUserId: session.userId,
          kind: "deal",
          timelineEntryId: timelineEntryId || undefined,
          commitment,
          deal
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      hardNavigate("/forgive/deal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-2xl gap-6 px-5 py-8">
      <AppNav />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-ink">新的说到做到</h1>
          <p className="mt-1 text-sm text-slate-500">
            比如约定戒烟，如果再抽一次烟，就给对方 500 块作为惩罚。
          </p>
        </div>
        <Link href="/forgive/deal" className="text-sm font-bold text-slate-400 underline">
          取消
        </Link>
      </header>

      <form className="grid gap-4 rounded-[28px] border-[3px] border-ink bg-white p-6 shadow-sticker" onSubmit={submit}>
        <label className="grid gap-1 font-black text-ink">
          关联记录（可选）
          <select
            className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
            value={timelineEntryId}
            onChange={(event) => setTimelineEntryId(event.target.value)}
          >
            <option value="">不关联</option>
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 font-black text-ink">
          我承诺
          <input
            className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
            placeholder="例如：下次晚归会提前说一声"
            value={commitment}
            onChange={(event) => setCommitment(event.target.value)}
            required
          />
        </label>

        <label className="grid gap-1 font-black text-ink">
          如果没做到，补偿约定
          <input
            className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
            placeholder="例如：负责一周洗碗"
            value={deal}
            onChange={(event) => setDeal(event.target.value)}
            required
          />
        </label>

        <p className="text-xs text-slate-400">一共 20 格，每违约一次就点亮一格。</p>

        {error ? <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}

        <button className="rounded-2xl bg-ink px-6 py-4 text-lg font-black text-white disabled:opacity-50" disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
      </form>
    </main>
  );
}
