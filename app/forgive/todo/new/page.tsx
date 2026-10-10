"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { hardNavigate } from "@/lib/client/navigate";
import { useCoupleSession } from "@/lib/client/useCoupleSession";

type TimelineEntryOption = { id: string; title: string };

export default function NewTodoPage() {
  const { session } = useCoupleSession();
  const [entries, setEntries] = useState<TimelineEntryOption[]>([]);
  const [timelineEntryId, setTimelineEntryId] = useState("");
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
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
    if (!session?.coupleId || saving || !title.trim() || !targetDate) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/forgive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleId: session.coupleId,
          authorUserId: session.userId,
          kind: "todo",
          timelineEntryId: timelineEntryId || undefined,
          title,
          targetDate: new Date(targetDate).toISOString()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      hardNavigate(`/forgive/todo/${data.item.id}`);
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
        <h1 className="text-2xl font-black text-ink">约一件未来要做的事</h1>
        <Link href="/forgive/todo" className="text-sm font-bold text-slate-400 underline">
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
          要一起做的事
          <input
            className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
            placeholder="例如：这周六一起去吃她喜欢的火锅"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>

        <label className="grid gap-1 font-black text-ink">
          目标日期
          <input
            className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            required
          />
        </label>

        {error ? <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}

        <button className="rounded-2xl bg-ink px-6 py-4 text-lg font-black text-white disabled:opacity-50" disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </button>
      </form>
    </main>
  );
}
