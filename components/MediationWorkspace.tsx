"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { placeholderFor, stageLabels, stageOrder } from "@/lib/mediation/flow";
import type {
  FinalMediationAnalysis,
  MediationResponse,
  MediationSession,
  MediationStage,
  SafetyAnalysis
} from "@/lib/mediation/types";
import { hardNavigate } from "@/lib/client/navigate";
import { loadSession, type LocalSession } from "@/lib/client/session";
import { avatarProfiles, type AvatarKey } from "@/lib/types";

const POLL_INTERVAL_MS = 4000;

/** Downscales a screenshot client-side before it's sent for transcription, to keep upload size and vision-model cost down. */
async function resizeImageToDataUrl(file: File, maxDim = 1440, quality = 0.82): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("图片读取失败，请换一张重试。"));
      el.src = objectUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("当前浏览器不支持图片处理。");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function MediationWorkspace() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entry") || "";
  const [local, setLocal] = useState<LocalSession | null>(null);
  const [myRole, setMyRole] = useState<"person_a" | "person_b" | null>(null);
  const [session, setSession] = useState<MediationSession | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState<{ done: number; total: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const stored = loadSession();
    if (!stored) {
      hardNavigate("/login");
      return;
    }
    if (!stored.coupleId) {
      hardNavigate("/pair");
      return;
    }
    if (!entryId) {
      hardNavigate("/timeline");
      return;
    }
    setLocal(stored);
  }, [entryId]);

  const loadRole = useCallback(async (userId: string, coupleId: string) => {
    const response = await fetch(`/api/pair?userId=${encodeURIComponent(userId)}`);
    const data = await response.json();
    if (!response.ok || !data.couple) return null;
    const index = (data.couple.memberIds as string[]).indexOf(userId);
    void coupleId;
    return index === 0 ? "person_a" : "person_b";
  }, []);

  const fetchSession = useCallback(async (coupleId: string) => {
    const response = await fetch(
      `/api/mediation?coupleId=${encodeURIComponent(coupleId)}&entryId=${encodeURIComponent(entryId)}`
    );
    const data = (await response.json()) as MediationResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || "加载复盘会话失败。");
    return data.session;
  }, [entryId]);

  useEffect(() => {
    if (!local?.coupleId) return;
    let cancelled = false;

    (async () => {
      try {
        const role = await loadRole(local.userId, local.coupleId!);
        const initial = await fetchSession(local.coupleId!);
        if (cancelled) return;
        setMyRole(role);
        setSession(initial);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败，请刷新重试。");
      }
    })();

    pollRef.current = setInterval(async () => {
      try {
        const latest = await fetchSession(local.coupleId!);
        setSession((current) => {
          if (!current) return latest;
          if (latest.messages.length === current.messages.length && latest.stage === current.stage) return current;
          return latest;
        });
      } catch {
        // ignore transient polling errors
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [local, loadRole, fetchSession]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length]);

  async function submitMessage() {
    const content = text.trim();
    if (!content || loading || !local?.coupleId || !session) return;
    setError("");
    setText("");
    setLoading(true);

    try {
      const next = await callMediationApi(local.coupleId, local.userId, entryId, content, "submit");
      setSession(next.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 调解暂时不可用，请检查 .env.local。");
    } finally {
      setLoading(false);
    }
  }

  async function finalize() {
    if (loading || !local?.coupleId) return;
    setError("");
    setLoading(true);
    try {
      const next = await callMediationApi(local.coupleId, local.userId, entryId, "", "finalize");
      setSession(next.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成最终分析失败。");
    } finally {
      setLoading(false);
    }
  }

  async function resetSession() {
    if (loading || !local?.coupleId) return;
    setLoading(true);
    setError("");
    try {
      const next = await callMediationApi(local.coupleId, local.userId, entryId, "", "reset");
      setSession(next.session);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新开始失败。");
    } finally {
      setLoading(false);
    }
  }

  if (!local || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        <p className="text-lg font-black text-slate-400">{error || "正在加载复盘房间..."}</p>
      </main>
    );
  }

  const avatars = {
    person_a: avatarProfiles[session.personAAvatarKey || "girl"],
    person_b: avatarProfiles[session.personBAvatarKey || "boy"]
  };
  const myName = myRole === "person_b" ? session.personBName : session.personAName;
  const partnerName = myRole === "person_b" ? session.personAName : session.personBName;

  async function handleScreenshotFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 6);
    setError("");
    setScreenshotBusy({ done: 0, total: files.length });

    const collected: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const imageDataUrl = await resizeImageToDataUrl(files[i]);
        const response = await fetch("/api/mediation/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, selfName: myName, otherName: partnerName })
        });
        const data = (await readJsonResponse(response)) as { transcript?: string; error?: string };
        if (!response.ok) throw new Error(data.error || "识别失败。");
        if (data.transcript) collected.push(data.transcript);
      } catch (err) {
        collected.push(`[第 ${i + 1} 张截图识别失败：${err instanceof Error ? err.message : "未知错误"}]`);
      }
      setScreenshotBusy({ done: i + 1, total: files.length });
    }

    setScreenshotBusy(null);
    if (!collected.length) return;
    const merged = collected.join("\n");
    setText((current) => {
      const prefix = current.trim() ? `${current.trim()}\n\n` : "";
      return `${prefix}【聊天记录原文】\n${merged}`;
    });
  }

  return (
    <main className="grid min-h-screen grid-rows-[auto_1fr] text-ink lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:grid-rows-1">
      <StageSidebar stage={session.stage} resetSession={resetSession} />

      <section className="grid min-h-0 grid-rows-[auto_1fr_auto] border-x border-black/10 bg-cream/80">
        <header className="flex items-center justify-between gap-4 border-b-[3px] border-ink bg-cream px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href={`/timeline/${entryId}`} className="text-sm font-bold text-slate-400 underline">
              返回记录
            </Link>
            <div>
              <p className="text-xs font-black text-rose">{session.entryTitle || "房间记录"}</p>
              <h1 className="text-2xl font-black">AI 双人复盘</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border-2 border-ink bg-white px-3 py-2 text-sm font-black shadow-sticker">
            <Avatar src={avatars.person_a.src} label={session.personAName} />
            <span>×</span>
            <Avatar src={avatars.person_b.src} label={session.personBName} />
          </div>
        </header>

        <section className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto grid max-w-3xl gap-4">
            {session.messages.map((message) => (
              <article
                key={message.id}
                className={[
                  "relative max-w-[86%] rounded-2xl border-2 border-ink p-4 shadow-sticker",
                  message.speaker === "ai" ? "justify-self-center bg-[#e9f1e7]" : "",
                  message.speaker === "person_a" ? "justify-self-end bg-peach pr-16" : "",
                  message.speaker === "person_b" ? "justify-self-start bg-[#eaf5ff] pl-16" : ""
                ].join(" ")}
              >
                {message.speaker !== "ai" ? (
                  <span className={`absolute top-3 ${message.speaker === "person_a" ? "right-3" : "left-3"}`}>
                    <Avatar
                      src={avatars[message.speaker].src}
                      label={message.speaker === "person_a" ? session.personAName : session.personBName}
                    />
                  </span>
                ) : null}
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black text-slate-500">
                  <span>{speakerName(message.speaker, session)}</span>
                  <span>{new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="whitespace-pre-line leading-7">{message.content}</p>
              </article>
            ))}
            {session.safetyAnalysis ? (
              <SafetyAnalysisCard analysis={session.safetyAnalysis} />
            ) : session.finalAnalysis ? (
              <FinalAnalysisCard analysis={session.finalAnalysis} />
            ) : null}
            <div ref={chatEndRef} />
          </div>
        </section>

        <footer className="border-t-[3px] border-ink bg-cream px-4 py-4 sm:px-6">
          {error ? <p className="mb-3 rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p> : null}
          <div className="mb-3 flex items-center gap-2 rounded-2xl border-2 border-ink bg-[#fff0e8] px-3 py-2 font-black shadow-sticker">
            <Avatar src={avatars[myRole || "person_a"].src} label={myName} />
            {myName} 正在发言
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button className="rounded-full border border-ink/15 bg-white px-3 py-2 text-sm font-bold" onClick={() => setText("我想补充这段经过：")}>
              补充经过
            </button>
            <button className="rounded-full border border-ink/15 bg-white px-3 py-2 text-sm font-bold" onClick={() => setText("最刺痛我的其实是：")}>
              说刺痛点
            </button>
            <button className="rounded-full border border-ink/15 bg-white px-3 py-2 text-sm font-bold" onClick={() => setText("我希望以后可以：")}>
              说想要什么
            </button>
            <button
              className="rounded-full border border-ink/15 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!screenshotBusy}
            >
              {screenshotBusy ? `识别截图中 ${screenshotBusy.done}/${screenshotBusy.total}` : "导入聊天截图"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleScreenshotFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          <p className="mb-2 text-xs font-bold text-slate-400">
            也可以直接导入微信聊天截图，AI 会先转录成文字，你确认无误后再发送——比事后回忆更准确。
          </p>
          <textarea
            className="min-h-28 w-full rounded-2xl border-2 border-ink bg-white p-4 leading-7 shadow-sticker"
            placeholder={placeholderFor(session.stage)}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <button className="rounded-2xl bg-ink px-6 py-4 font-black text-white disabled:opacity-50" onClick={submitMessage} disabled={loading || session.stage === "final_analysis"}>
              {loading ? "小喷菇正在整理" : `${myName} 发送`}
            </button>
            <button className="rounded-2xl border-2 border-ink bg-white px-6 py-4 font-black" onClick={finalize} disabled={loading}>
              生成最终复盘
            </button>
          </div>
        </footer>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto bg-white/60 px-4 py-5 lg:block">
        <ContextPanel session={session} />
      </aside>
    </main>
  );
}

async function callMediationApi(
  coupleId: string,
  userId: string,
  entryId: string,
  message: string,
  action: "submit" | "finalize" | "reset"
) {
  const response = await fetch("/api/mediation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coupleId, userId, entryId, message, action })
  });
  const data = (await readJsonResponse(response)) as MediationResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || "AI 请求失败。");
  return data;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const preview = text.trim().slice(0, 120);
    throw new Error(`本地服务返回了无法读取的内容：${preview || response.status}`);
  }
}

function StageSidebar({ stage, resetSession }: { stage: MediationStage; resetSession: () => void }) {
  const activeIndex = stageOrder.indexOf(stage);
  return (
    <aside className="hidden bg-paper/80 px-5 py-6 lg:block">
      <div className="sticky top-6 grid gap-5">
        <div>
          <p className="text-sm font-black text-rose">调解阶段</p>
          <h2 className="mt-1 text-3xl font-black">先说完，才分析</h2>
        </div>
        <ol className="grid gap-2">
          {stageOrder.slice(1).map((item, index) => (
            <li
              key={item}
              className={`rounded-2xl border px-4 py-3 text-sm font-black ${
                index <= activeIndex - 1 ? "border-ink bg-cream shadow-sticker" : "border-black/10 bg-white/60 text-slate-400"
              }`}
            >
              {stageLabels[item]}
            </li>
          ))}
        </ol>
        <button className="rounded-2xl border-2 border-ink bg-white px-4 py-3 font-black" onClick={resetSession}>
          重新开始
        </button>
      </div>
    </aside>
  );
}

function ContextPanel({ session }: { session: MediationSession }) {
  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border-2 border-ink bg-cream p-5 shadow-sticker">
        <p className="text-sm font-black text-rose">当前阶段</p>
        <h3 className="mt-1 text-2xl font-black">{stageLabels[session.stage]}</h3>
        <p className="mt-3 leading-7 text-slate-600">双方都完整说完之前，小喷菇不会分析、不会追问。信息足够了就直接进入联合分析，不会为了走完流程硬凑问题。</p>
      </section>
      <section className="rounded-3xl border-2 border-ink bg-white p-5 shadow-sticker">
        <h3 className="text-xl font-black">小喷菇会看什么</h3>
        <div className="mt-4 grid gap-3 text-sm">
          <FactGroup title="发生了什么" text="关键行为是什么，双方分别怎么理解。" />
          <FactGroup title="是不是重复模式" text="一次性事件，还是已经说过很多次却仍被反复违反的边界。" />
          <FactGroup title="有没有越界" text="区分普通需求冲突、沟通方式问题，和真正的伤害行为。" />
          <FactGroup title="各自在保护什么" text="不做道德评判，只看两个需求怎么碰撞。" />
          <FactGroup title="修复而不是打分" text="不算责任百分比、不算情绪温度，只给具体可执行的下一步。" />
        </div>
      </section>
    </div>
  );
}

function FactGroup({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="font-black text-slate-700">{title}</p>
      <p className="mt-1 leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function FinalAnalysisCard({ analysis }: { analysis: FinalMediationAnalysis }) {
  return (
    <section className="grid gap-5 rounded-[28px] border-[3px] border-moss bg-white/90 p-5 shadow-soft">
      <div className="grid justify-items-center gap-3 py-4 text-center">
        <p className="text-sm font-black text-[#4a5f3d]">小喷菇判读书</p>
        <h2 className="text-4xl font-black leading-tight text-[#3f5c34]">{analysis.title}</h2>
        <span className="rounded-full bg-peach px-6 py-3 text-lg font-black text-[#a8541c]">{analysis.behaviorSummary}</span>
      </div>

      <AnalysisBlock title="这次冲突发生了什么" text={analysis.whatHappened} />
      <AnalysisBlock title="真正卡住你们的地方" text={analysis.coreTension} />

      <section className="grid gap-4 rounded-3xl bg-white/90 p-5 shadow-soft sm:grid-cols-2">
        <div className="grid gap-2">
          <h3 className="text-center text-lg font-black text-[#4a5f3d]">A 在保护什么</h3>
          <ul className="grid gap-1 text-center leading-7 text-slate-700">
            {analysis.personA.needs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2">
          <h3 className="text-center text-lg font-black text-[#a8541c]">B 在保护什么</h3>
          <ul className="grid gap-1 text-center leading-7 text-slate-700">
            {analysis.personB.needs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl bg-[#fff8ef] p-4">
        <h3 className="font-black">哪些行为需要改变</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="font-black text-[#4a5f3d]">A</p>
            <ul className="mt-1 grid gap-1 leading-7 text-slate-700">
              {analysis.behaviorChanges.personA.length ? (
                analysis.behaviorChanges.personA.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li className="text-slate-400">没有需要独立指出的行为。</li>
              )}
            </ul>
          </div>
          <div>
            <p className="font-black text-[#a8541c]">B</p>
            <ul className="mt-1 grid gap-1 leading-7 text-slate-700">
              {analysis.behaviorChanges.personB.length ? (
                analysis.behaviorChanges.personB.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li className="text-slate-400">没有需要独立指出的行为。</li>
              )}
            </ul>
          </div>
        </div>
        {analysis.behaviorChanges.harmNote ? (
          <p className="mt-3 rounded-2xl border-2 border-rose/40 bg-rose/10 p-3 leading-7 text-rose">
            {analysis.behaviorChanges.harmNote}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-[#fff8ef] p-4">
        <h3 className="font-black">下一次具体怎么做</h3>
        <ul className="mt-2 grid gap-2 leading-7 text-slate-700">
          {analysis.repairPlan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-[#fff8ef] p-4">
        <h3 className="font-black">可以直接对 TA 说</h3>
        <p className="mt-2 whitespace-pre-line leading-7 text-slate-700">
          {`A：${analysis.oneSentenceToSay.personA}\nB：${analysis.oneSentenceToSay.personB}`}
        </p>
      </section>
    </section>
  );
}

function SafetyAnalysisCard({ analysis }: { analysis: SafetyAnalysis }) {
  return (
    <section className="grid gap-5 rounded-[28px] border-[3px] border-rose bg-white/90 p-5 shadow-soft">
      <div className="grid justify-items-center gap-3 py-4 text-center">
        <p className="text-sm font-black text-rose">安全提示</p>
        <h2 className="text-3xl font-black leading-tight text-rose">{analysis.title}</h2>
      </div>
      <AnalysisBlock title="发生了什么" text={analysis.whatHappened} />
      <section className="rounded-2xl border-2 border-rose/40 bg-rose/10 p-4">
        <h3 className="font-black text-rose">为什么这不只是沟通问题</h3>
        <p className="mt-2 leading-7 text-slate-700">{analysis.safetyNote}</p>
      </section>
      <section className="rounded-2xl bg-[#fff8ef] p-4">
        <h3 className="font-black">现在可以做的事</h3>
        <ul className="mt-2 grid gap-2 leading-7 text-slate-700">
          {analysis.suggestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function AnalysisBlock({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-2xl bg-[#fff8ef] p-4">
      <h3 className="font-black">{title}</h3>
      <p className="mt-2 whitespace-pre-line leading-7 text-slate-700">{text}</p>
    </section>
  );
}

function Avatar({ src, label }: { src: string; label: string }) {
  return <Image src={src} alt={label} width={36} height={36} className="h-9 w-9 rounded-full object-contain" />;
}

function speakerName(speaker: "person_a" | "person_b" | "ai", session: MediationSession) {
  if (speaker === "person_a") return session.personAName;
  if (speaker === "person_b") return session.personBName;
  return "AI 调解助手";
}
