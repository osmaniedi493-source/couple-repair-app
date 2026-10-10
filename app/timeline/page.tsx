"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { hardNavigate } from "@/lib/client/navigate";
import { clearSession, loadSession, saveSession, type LocalSession } from "@/lib/client/session";
import { avatarProfiles, type TimelineEntry, type UserProfile } from "@/lib/types";
import { emotionOptions, sceneOptions } from "@/lib/timeline/constants";
import AppNav from "@/components/AppNav";

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TimelinePage() {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [scene, setScene] = useState(sceneOptions[0]);
  const [time, setTime] = useState(() => toDatetimeLocalValue(new Date()));
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const local = loadSession();
    if (!local) {
      hardNavigate("/login");
      return;
    }
    if (!local.coupleId) {
      hardNavigate("/pair");
      return;
    }
    setSession(local);
  }, []);

  const refresh = useCallback(async (coupleId: string) => {
    try {
      const response = await fetch(`/api/timeline?coupleId=${encodeURIComponent(coupleId)}`);
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          // The couple was unbound (by either side) since this device last checked —
          // clear the stale coupleId and send this device back to pairing.
          const local = loadSession();
          if (local) saveSession({ ...local, coupleId: undefined });
          hardNavigate("/pair");
          return;
        }
        throw new Error(data.error || "加载时间线失败。");
      }
      setEntries(data.entries);
      setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载时间线失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.coupleId) refresh(session.coupleId);
  }, [session, refresh]);

  function toggleEmotion(emotion: string) {
    setSelectedEmotions((current) =>
      current.includes(emotion) ? current.filter((item) => item !== emotion) : [...current, emotion]
    );
  }

  async function submitEntry(event: FormEvent) {
    event.preventDefault();
    if (!session?.coupleId || submitting || !title.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coupleId: session.coupleId,
          authorUserId: session.userId,
          title,
          scene,
          emotions: selectedEmotions,
          time: new Date(time).toISOString()
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败。");
      setEntries(data.entries);
      setMembers(data.members);
      setTitle("");
      setSelectedEmotions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败。");
    } finally {
      setSubmitting(false);
    }
  }

  function logout() {
    clearSession();
    hardNavigate("/login");
  }

  async function unbind() {
    if (!session) return;
    if (!window.confirm("确定要解除和TA的情侣绑定吗？解除后需要重新配对才能再看到共享内容。")) return;
    try {
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unbind", userId: session.userId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "解除绑定失败。");
      saveSession({ ...session, coupleId: undefined });
      hardNavigate("/pair");
    } catch (err) {
      setError(err instanceof Error ? err.message : "解除绑定失败。");
    }
  }

  function authorOf(userId: string) {
    const profile = members.find((member) => member.id === userId);
    if (!profile) return { name: "对方", avatar: avatarProfiles.girl };
    return { name: profile.name, avatar: avatarProfiles[profile.avatarKey] };
  }

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-3xl gap-6 px-5 py-8">
      <AppNav />
      <header className="flex items-center justify-between gap-4 rounded-[28px] border-[3px] border-ink bg-cream p-5 shadow-sticker">
        <div className="flex items-center gap-3">
          {members.map((member) => (
            <span key={member.id} className="flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-1.5">
              <Image
                src={avatarProfiles[member.avatarKey].src}
                alt={member.name}
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
              />
              <strong className="text-sm font-black">{member.name}</strong>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm font-bold text-rose underline" onClick={unbind}>
            解除绑定
          </button>
          <button className="text-sm font-bold text-slate-400 underline" onClick={logout}>
            退出登录
          </button>
        </div>
      </header>

      <section className="grid gap-1 rounded-[28px] border-[3px] border-ink bg-ink px-6 py-5 text-white shadow-sticker">
        <span className="text-sm font-black text-peach">吵架了？</span>
        <strong className="text-2xl font-black">先记一下这次的事，再进入 AI 双人复盘</strong>
        <span className="text-sm text-white/70">在下面存下这一刻，然后点进这条记录，就能针对它开始 AI 双人复盘。</span>
      </section>

      <section className="grid gap-4 rounded-[28px] border-[3px] border-ink bg-white p-6 shadow-sticker">
        <div>
          <h2 className="text-xl font-black text-ink">先记一下</h2>
          <p className="text-sm text-slate-500">生气的时候不用讲清楚全部，先把这一刻存下来。</p>
        </div>
        <form className="grid gap-4" onSubmit={submitEntry}>
          <label className="grid gap-1 font-black text-ink">
            事件一句话
            <input
              className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
              maxLength={40}
              placeholder="例如：因为没有及时回消息吵架"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 font-black text-ink">
              时间
              <input
                className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
                type="datetime-local"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            </label>
            <label className="grid gap-1 font-black text-ink">
              场景
              <select
                className="rounded-2xl border-2 border-ink px-4 py-3 font-bold"
                value={scene}
                onChange={(event) => setScene(event.target.value)}
              >
                {sceneOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2">
            <span className="font-black text-ink">情绪标签</span>
            <div className="flex flex-wrap gap-2">
              {emotionOptions.map((emotion) => (
                <button
                  key={emotion}
                  type="button"
                  onClick={() => toggleEmotion(emotion)}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${
                    selectedEmotions.includes(emotion) ? "border-ink bg-peach" : "border-ink/15 bg-white text-slate-500"
                  }`}
                >
                  {emotion}
                </button>
              ))}
            </div>
          </div>
          <button className="rounded-2xl bg-ink px-6 py-4 text-lg font-black text-white disabled:opacity-50" disabled={submitting}>
            {submitting ? "保存中..." : "先存下来"}
          </button>
        </form>
      </section>

      {error ? <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}

      <section className="grid gap-3">
        <h2 className="text-xl font-black text-ink">冲突时间线</h2>
        {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}
        {!loading && entries.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-ink/20 bg-white/60 p-6 text-center text-slate-400">
            还没有记录，先存下第一条吧。
          </p>
        ) : null}
        <div className="grid gap-3">
          {entries.map((entry) => {
            const author = authorOf(entry.authorUserId);
            return (
              <Link
                key={entry.id}
                href={`/timeline/${entry.id}`}
                className="grid gap-2 rounded-2xl border-2 border-ink bg-white p-4 shadow-sticker"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Image src={author.avatar.src} alt={author.name} width={28} height={28} className="h-7 w-7 object-contain" />
                    <strong className="text-sm font-black">{author.name}</strong>
                  </div>
                  <span className="text-xs font-bold text-slate-400">
                    {new Date(entry.time).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="font-bold text-ink">{entry.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">{entry.scene}</span>
                  {entry.emotions.map((emotion) => (
                    <span key={emotion} className="rounded-full bg-[#fff0e8] px-3 py-1">
                      {emotion}
                    </span>
                  ))}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
