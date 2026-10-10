"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { hardNavigate } from "@/lib/client/navigate";
import { useCoupleSession } from "@/lib/client/useCoupleSession";

type TimelineEntryOption = { id: string; title: string };

export default function NewLetterPage() {
  const { session } = useCoupleSession();
  const [entries, setEntries] = useState<TimelineEntryOption[]>([]);
  const [timelineEntryId, setTimelineEntryId] = useState("");
  const [message, setMessage] = useState("");
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
    if (!session?.coupleId || saving || !message.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/forgive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleId: session.coupleId,
          authorUserId: session.userId,
          kind: "letter",
          timelineEntryId: timelineEntryId || undefined,
          message
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      hardNavigate(`/forgive/letter/${data.item.id}`);
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
        <h1 className="text-2xl font-black text-ink">写一篇道歉小作文</h1>
        <Link href="/forgive/letter" className="text-sm font-bold text-slate-400 underline">
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
          给对方的话
          <textarea
            className="min-h-40 rounded-2xl border-2 border-ink p-4 font-bold leading-7"
            placeholder="可以再手动改得更像你自己"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
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
