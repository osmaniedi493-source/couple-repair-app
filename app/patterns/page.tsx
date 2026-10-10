"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import RadarChart from "@/components/RadarChart";
import { hardNavigate } from "@/lib/client/navigate";
import { loadSession, type LocalSession } from "@/lib/client/session";
import type { MediationSession } from "@/lib/mediation/types";
import { avatarProfiles, type AvatarKey, type PatternProfile } from "@/lib/types";

type Member = { id: string; name: string; avatarKey: AvatarKey };

const behaviorLevelLabel: Record<string, string> = {
  L1: "需求差异",
  L2: "沟通方式需要调整",
  L3: "存在越界行为",
  L4: "涉及高风险行为"
};

export default function PatternsPage() {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [sessions, setSessions] = useState<MediationSession[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const refresh = useCallback(async (coupleId: string, userId: string) => {
    try {
      const [historyRes, pairRes] = await Promise.all([
        fetch(`/api/mediation/history?coupleId=${encodeURIComponent(coupleId)}`),
        fetch(`/api/pair?userId=${encodeURIComponent(userId)}`)
      ]);
      const historyData = await historyRes.json();
      const pairData = await pairRes.json();
      if (!historyRes.ok) throw new Error(historyData.error || "加载模式分析失败。");
      setSessions(historyData.sessions);
      const self: Member = { id: userId, name: pairData.user?.name || "我", avatarKey: pairData.user?.avatarKey || "girl" };
      const partner: Member[] = pairData.partner
        ? [{ id: pairData.partner.id, name: pairData.partner.name, avatarKey: pairData.partner.avatarKey }]
        : [];
      setMembers([self, ...partner]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载模式分析失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.coupleId) refresh(session.coupleId, session.userId);
  }, [session, refresh]);

  if (!session) return null;

  const levelCounts = sessions.reduce<Record<string, number>>((acc, item) => {
    const level = item.finalAnalysis?.behaviorLevel || item.behaviorLevel || "L1";
    acc[level] = (acc[level] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-3xl gap-6 px-5 py-8">
      <AppNav />
      <header>
        <p className="text-sm font-black text-rose">冲突规律总结</p>
        <h1 className="text-3xl font-black text-ink">模式分析</h1>
        <p className="mt-1 leading-7 text-slate-500">每完成一次 AI 双人复盘，这里会多一条记录，帮你们看见反复出现的模式。</p>
      </header>

      {error ? <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}

      {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}

      {!loading && sessions.length === 0 ? (
        <div className="grid justify-items-center gap-4 rounded-[28px] border-2 border-dashed border-ink/20 bg-white/60 p-10 text-center">
          <p className="text-slate-500">还没有完整的复盘记录，先去时间线记一条事件，再从里面开始双人复盘吧。</p>
          <Link href="/timeline" className="rounded-2xl bg-ink px-6 py-3 font-black text-white">
            去时间线看看
          </Link>
        </div>
      ) : null}

      {!loading && sessions.length > 0 ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            {members.map((member) => (
              <ProfileCard key={member.id} coupleId={session.coupleId!} member={member} sessionCount={sessions.length} />
            ))}
          </section>

          <section className="grid gap-4 rounded-[28px] border-[3px] border-ink bg-cream p-6 shadow-sticker sm:grid-cols-3">
            <Stat label="已完成复盘" value={`${sessions.length} 次`} />
            <Stat label="需求差异 (L1)" value={`${levelCounts.L1 || 0} 次`} />
            <Stat label="需要关注的行为 (L2+)" value={`${sessions.length - (levelCounts.L1 || 0)} 次`} />
          </section>

          <section className="grid gap-3 rounded-[28px] border-[3px] border-ink bg-white p-6 shadow-sticker">
            <h2 className="text-xl font-black text-ink">小结</h2>
            <p className="leading-7 text-slate-600">
              过去 {sessions.length} 次复盘中：单纯需求差异 {levelCounts.L1 || 0} 次，沟通方式需要调整 {levelCounts.L2 || 0} 次，
              出现越界行为 {levelCounts.L3 || 0} 次
              {levelCounts.L4 ? `，涉及高风险行为 ${levelCounts.L4} 次` : ""}。
              这里不做责任百分比或情绪打分，只帮你们看见反复出现的类型。
            </p>
          </section>

          <section className="grid gap-3">
            <h2 className="text-xl font-black text-ink">历次复盘</h2>
            {sessions.map((item, index) => (
              <article key={item.id || index} className="grid gap-2 rounded-2xl border-2 border-ink bg-white p-4 shadow-sticker">
                <div className="flex items-center justify-between gap-3">
                  <strong className="font-black text-ink">
                    {item.finalAnalysis?.title || item.safetyAnalysis?.title || "这次吵架复盘"}
                  </strong>
                  <span className="text-xs font-bold text-slate-400">
                    {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("zh-CN") : ""}
                  </span>
                </div>
                <p className="text-sm leading-6 text-slate-600">
                  {item.finalAnalysis?.coreTension || item.safetyAnalysis?.safetyNote}
                </p>
                <span className="w-fit rounded-full bg-peach px-3 py-1 text-xs font-black text-[#a8541c]">
                  {item.finalAnalysis?.behaviorSummary ||
                    behaviorLevelLabel[item.finalAnalysis?.behaviorLevel || item.behaviorLevel || "L1"]}
                </span>
              </article>
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid justify-items-center gap-1 rounded-2xl bg-white/70 p-4 text-center">
      <span className="text-2xl font-black text-ink">{value}</span>
      <span className="text-xs font-bold text-slate-500">{label}</span>
    </div>
  );
}

function ProfileCard({ coupleId, member, sessionCount }: { coupleId: string; member: Member; sessionCount: number }) {
  const [profile, setProfile] = useState<PatternProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const avatar = avatarProfiles[member.avatarKey];

  const generate = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/patterns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coupleId, userId: member.id, force })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "生成沟通模式失败。");
        setProfile(data.profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "生成沟通模式失败。");
      } finally {
        setLoading(false);
      }
    },
    [coupleId, member.id]
  );

  useEffect(() => {
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupleId, member.id, sessionCount]);

  return (
    <section className="grid gap-4 rounded-[28px] border-[3px] border-ink bg-white p-6 shadow-sticker">
      <div className="flex items-center gap-2">
        <Image src={avatar.src} alt={member.name} width={28} height={28} className="h-7 w-7 object-contain" />
        <strong className="font-black text-ink">{member.name}</strong>
        <span className="text-xs font-bold text-slate-400">的沟通模式</span>
      </div>

      {loading ? <p className="text-sm text-slate-400">正在分析...</p> : null}
      {error ? <p className="text-sm font-bold text-rose">{error}</p> : null}

      {!loading && profile ? (
        <>
          <div className="grid justify-items-center gap-2 text-center">
            <h3 className="text-2xl font-black text-[#3f5c34]">{profile.typeName}</h3>
            <p className="text-xs font-black uppercase tracking-wide text-[#a8541c]">{profile.englishTag}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {profile.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[#eef3e6] px-3 py-1 text-xs font-black text-[#4a5f3d]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <p className="text-sm leading-7 text-slate-600">{profile.description}</p>
          <RadarChart axes={profile.radar} />
          <button
            className="justify-self-center rounded-full border-2 border-ink bg-white px-4 py-2 text-xs font-black text-slate-500"
            onClick={() => generate(true)}
          >
            重新生成
          </button>
        </>
      ) : null}
    </section>
  );
}
