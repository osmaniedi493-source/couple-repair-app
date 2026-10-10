"use client";

import { useEffect } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { hardNavigate } from "@/lib/client/navigate";
import { loadSession } from "@/lib/client/session";
import type { ForgiveKind } from "@/lib/types";

const kindMeta: Record<ForgiveKind, { title: string; tagline: string; emoji: string }> = {
  letter: { title: "道歉小作文", tagline: "把解释改成能被听见的道歉", emoji: "📝" },
  todo: { title: "未来 To Do List", tagline: "把和好变成一起做的具体事情", emoji: "⏳" },
  deal: { title: "说到做到", tagline: "给承诺配一个温和的补偿机制", emoji: "🧩" }
};

export default function ForgivePage() {
  useEffect(() => {
    const local = loadSession();
    if (!local) {
      hardNavigate("/login");
      return;
    }
    if (!local.coupleId) {
      hardNavigate("/pair");
    }
  }, []);

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-3xl gap-6 px-5 py-8">
      <AppNav />
      <header>
        <p className="text-sm font-black text-rose">修复与和解</p>
        <h1 className="text-3xl font-black text-ink">原谅我吧</h1>
      </header>

      <section className="grid gap-4">
        {(Object.keys(kindMeta) as ForgiveKind[]).map((kind) => (
          <Link
            key={kind}
            href={`/forgive/${kind}`}
            className="flex items-center gap-4 rounded-[24px] border-[3px] border-ink bg-white p-5 shadow-sticker"
          >
            <span className="text-3xl">{kindMeta[kind].emoji}</span>
            <div className="grid gap-1">
              <strong className="text-lg font-black text-ink">{kindMeta[kind].title}</strong>
              <span className="text-sm text-slate-500">{kindMeta[kind].tagline}</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
