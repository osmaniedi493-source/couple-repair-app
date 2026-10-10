"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { hardNavigate } from "@/lib/client/navigate";
import { clearSession, loadSession, saveSession, type LocalSession } from "@/lib/client/session";
import { avatarProfiles, otherAvatarKey, type AvatarKey } from "@/lib/types";

const blobTone: Record<AvatarKey, string> = {
  girl: "bg-[#ffe1ef]",
  boy: "bg-[#dcefff]"
};

export default function PairPage() {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [code, setCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const local = loadSession();
    if (!local) {
      hardNavigate("/login");
      return;
    }
    if (local.coupleId) {
      hardNavigate("/timeline");
      return;
    }
    setSession(local);
  }, []);

  const checkStatus = useCallback(
    async (userId: string) => {
      try {
        const response = await fetch(`/api/pair?userId=${encodeURIComponent(userId)}`);
        const data = await response.json();
        if (!response.ok) return;
        if (data.ownCode) setCode(data.ownCode);
        if (data.couple) {
          const local = loadSession();
          if (local) {
            saveSession({ ...local, coupleId: data.couple.id });
          }
          window.location.href = "/timeline";
        }
      } catch {
        // ignore transient polling errors
      }
    },
    []
  );

  useEffect(() => {
    if (!session) return;
    checkStatus(session.userId);
    pollRef.current = setInterval(() => checkStatus(session.userId), 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session, checkStatus]);

  async function generateCode() {
    if (!session || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", userId: session.userId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成配对码失败。");
      setCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成配对码失败。");
    } finally {
      setCreating(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // clipboard unavailable, ignore
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function submitJoin(event: FormEvent) {
    event.preventDefault();
    if (!session || joining) return;
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", userId: session.userId, code: enteredCode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "配对失败。");
      saveSession({ ...session, coupleId: data.couple.id });
      window.location.href = "/timeline";
    } catch (err) {
      setError(err instanceof Error ? err.message : "配对失败。");
    } finally {
      setJoining(false);
    }
  }

  function logout() {
    clearSession();
    hardNavigate("/login");
  }

  if (!session) return null;

  const mine = avatarProfiles[session.avatarKey];
  const partnerPreview = avatarProfiles[otherAvatarKey(session.avatarKey)];

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-2xl gap-6 px-5 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-rose">还差最后一步</p>
          <h1 className="text-3xl font-black text-ink">绑定为情侣</h1>
        </div>
        <button className="text-sm font-bold text-slate-400 underline" onClick={logout}>
          换个手机号
        </button>
      </header>

      <section className={`grid justify-items-center gap-4 rounded-[32px] border-[3px] border-ink p-8 shadow-sticker ${blobTone[session.avatarKey]}`}>
        <Image src={mine.src} alt={mine.label} width={180} height={180} className="h-40 w-40 object-contain" />
        <p className="text-center font-bold text-ink/70">
          我是 <strong className="font-black">{session.name}</strong>，把配对码发给 ta，等 ta 输入完成绑定。
        </p>
        {code ? (
          <div className="grid justify-items-center gap-3">
            <strong className="text-4xl font-black tracking-[0.4em] text-ink">{code}</strong>
            <button
              className="rounded-full border-2 border-ink bg-white px-5 py-2 text-sm font-black shadow-sticker"
              type="button"
              onClick={copyCode}
            >
              {copied ? "已复制" : "复制配对码"}
            </button>
            <p className="text-xs font-bold text-ink/50">正在等待对方输入配对码...</p>
          </div>
        ) : (
          <button
            className="rounded-2xl bg-ink px-8 py-4 text-lg font-black text-white disabled:opacity-50"
            type="button"
            onClick={generateCode}
            disabled={creating}
          >
            {creating ? "生成中..." : "邀请对方加入"}
          </button>
        )}
      </section>

      <section className="grid gap-4 rounded-[32px] border-[3px] border-ink bg-cream p-6 shadow-sticker">
        <div className="flex items-center justify-center gap-4">
          <div className="grid justify-items-center gap-1">
            <Image src={mine.src} alt={mine.label} width={64} height={64} className="h-16 w-16 object-contain" />
            <span className="text-xs font-black">{session.name}</span>
          </div>
          <strong className="text-2xl text-slate-300">×</strong>
          <div className="grid justify-items-center gap-1 opacity-50">
            <Image src={partnerPreview.src} alt={partnerPreview.label} width={64} height={64} className="h-16 w-16 object-contain" />
            <span className="text-xs font-black">等待对方</span>
          </div>
        </div>
        <form className="grid gap-3" onSubmit={submitJoin}>
          <label className="grid gap-2 font-black text-ink">
            输入对方的配对码
            <input
              className="rounded-2xl border-2 border-ink bg-white px-4 py-3 text-center text-xl font-black uppercase tracking-[0.3em]"
              placeholder="例如 9CDSMTB"
              value={enteredCode}
              onChange={(event) => setEnteredCode(event.target.value.toUpperCase())}
              maxLength={12}
            />
          </label>
          <button
            className="rounded-2xl border-2 border-ink bg-white px-6 py-4 text-lg font-black text-ink disabled:opacity-50"
            disabled={joining || enteredCode.trim().length < 5}
          >
            {joining ? "配对中..." : "立即配对"}
          </button>
        </form>
        {error ? <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}
        <p className="text-center text-xs text-slate-400">配对成功后，双方的时间线会按头像分别显示各自的信息。</p>
      </section>
    </main>
  );
}
