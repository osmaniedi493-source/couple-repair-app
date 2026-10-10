"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppNav from "@/components/AppNav";
import { hardNavigate } from "@/lib/client/navigate";
import { useCoupleSession } from "@/lib/client/useCoupleSession";
import { avatarProfiles, type TimelineEntry } from "@/lib/types";

export default function TimelineDetailPage() {
  const params = useParams<{ id: string }>();
  const { session, members } = useCoupleSession();
  const [entry, setEntry] = useState<TimelineEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [whyItMatters, setWhyItMatters] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!session?.coupleId) return;
    fetch(`/api/timeline?coupleId=${encodeURIComponent(session.coupleId)}`)
      .then((response) => response.json())
      .then((data) => {
        const found = (data.entries as TimelineEntry[])?.find((item) => item.id === params.id);
        if (!found) {
          setError("没有找到这条记录。");
          return;
        }
        setEntry(found);
        setWhatHappened(found.whatHappened || "");
        setWhyItMatters(found.whyItMatters || "");
      })
      .finally(() => setLoading(false));
  }, [session, params.id]);

  async function save() {
    if (!session?.coupleId || !entry || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch("/api/timeline", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId: session.coupleId, id: entry.id, whatHappened, whyItMatters })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      setEntry(data.entry);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!session?.coupleId || !entry || deleting) return;
    if (!window.confirm("确定要删除这条记录吗？删除后无法恢复。")) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/timeline?coupleId=${encodeURIComponent(session.coupleId)}&id=${encodeURIComponent(entry.id)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "删除失败。");
      }
      hardNavigate("/timeline");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败。");
      setDeleting(false);
    }
  }

  const author = entry ? members.find((member) => member.id === entry.authorUserId) : undefined;
  const avatar = author ? avatarProfiles[author.avatarKey] : null;

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-2xl gap-6 px-5 py-8 pb-28">
      <AppNav />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-ink">冲突记录</h1>
        <Link href="/timeline" className="text-sm font-bold text-slate-400 underline">
          返回时间线
        </Link>
      </header>

      {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}
      {error ? <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}

      {entry ? (
        <>
          <section className="grid gap-3 rounded-[24px] border-[3px] border-ink bg-white p-5 shadow-sticker">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {avatar ? <Image src={avatar.src} alt={author?.name || ""} width={28} height={28} className="h-7 w-7 object-contain" /> : null}
                <strong className="text-sm font-black">{author?.name || "TA"}</strong>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {new Date(entry.time).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <p className="text-xl font-black text-ink">{entry.title}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">{entry.scene}</span>
              {entry.emotions.map((emotion) => (
                <span key={emotion} className="rounded-full bg-[#fff0e8] px-3 py-1">
                  {emotion}
                </span>
              ))}
            </div>
          </section>

          <a
            href={`/review?entry=${entry.id}`}
            className="grid gap-1 rounded-[24px] border-[3px] border-ink bg-ink px-6 py-5 text-white shadow-sticker"
          >
            <span className="text-sm font-black text-peach">吵架了？</span>
            <strong className="text-xl font-black">开始 / 继续 AI 双人复盘</strong>
            <span className="text-sm text-white/70">针对这条记录，分别说说发生了什么，AI 会一起梳理事实、感受和需要。</span>
          </a>

          <section className="grid gap-4 rounded-[24px] border-[3px] border-ink bg-white p-6 shadow-sticker">
            <label className="grid gap-1 font-black text-ink">
              发生了什么
              <textarea
                className="min-h-28 rounded-2xl border-2 border-ink p-4 font-bold leading-7"
                placeholder="展开说说事情的经过"
                value={whatHappened}
                onChange={(event) => {
                  setWhatHappened(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <label className="grid gap-1 font-black text-ink">
              我为什么在意
              <textarea
                className="min-h-28 rounded-2xl border-2 border-ink p-4 font-bold leading-7"
                placeholder="说说这件事戳到你的是什么"
                value={whyItMatters}
                onChange={(event) => {
                  setWhyItMatters(event.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <button className="rounded-2xl bg-ink px-6 py-4 text-lg font-black text-white disabled:opacity-50" onClick={save} disabled={saving}>
              {saving ? "保存中..." : saved ? "已保存" : "保存"}
            </button>
          </section>
        </>
      ) : null}

      {entry ? (
        <button
          onClick={remove}
          disabled={deleting}
          className="fixed bottom-6 right-6 grid h-14 w-14 place-items-center rounded-full border-[3px] border-rose bg-white text-rose shadow-sticker disabled:opacity-50"
          aria-label="删除该事件"
        >
          🗑
        </button>
      ) : null}
    </main>
  );
}
