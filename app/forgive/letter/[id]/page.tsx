"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppNav from "@/components/AppNav";
import { useCoupleSession } from "@/lib/client/useCoupleSession";
import { avatarProfiles, type ForgiveItem } from "@/lib/types";

export default function LetterDetailPage() {
  const params = useParams<{ id: string }>();
  const { session, members } = useCoupleSession();
  const [item, setItem] = useState<ForgiveItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.coupleId) return;
    fetch(`/api/forgive?coupleId=${encodeURIComponent(session.coupleId)}&kind=letter`)
      .then((response) => response.json())
      .then((data) => {
        const found = (data.items as ForgiveItem[])?.find((entry) => entry.id === params.id);
        if (!found) setError("没有找到这篇道歉小作文。");
        setItem(found || null);
      })
      .finally(() => setLoading(false));
  }, [session, params.id]);

  const author = item ? members.find((member) => member.id === item.authorUserId) : undefined;
  const avatar = author ? avatarProfiles[author.avatarKey] : null;

  if (!session) return null;

  return (
    <main className="mx-auto grid min-h-screen content-start w-full max-w-2xl gap-6 px-5 py-8">
      <AppNav />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-ink">道歉小作文</h1>
        <Link href="/forgive/letter" className="text-sm font-bold text-slate-400 underline">
          返回列表
        </Link>
      </header>

      {loading ? <p className="text-sm text-slate-400">正在加载...</p> : null}
      {error ? <p className="text-sm font-bold text-rose">{error}</p> : null}

      {item ? (
        <div className="grid justify-items-center py-6">
          <div
            className="relative w-full max-w-md -rotate-1 rounded-sm p-8 shadow-soft"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.03), transparent 45%), radial-gradient(circle at 85% 75%, rgba(0,0,0,0.04), transparent 40%), #fbf3df",
              boxShadow: "0 18px 40px rgba(90, 70, 30, 0.18)"
            }}
          >
            <span
              className="absolute -top-4 left-1/2 h-8 w-24 -translate-x-1/2 rotate-[-3deg] rounded-sm"
              style={{ background: "rgba(232, 214, 150, 0.75)" }}
            />
            <div className="mb-4 flex items-center justify-between text-xs font-bold text-[#8a7550]">
              <span className="flex items-center gap-1.5">
                {avatar ? <Image src={avatar.src} alt={author?.name || ""} width={20} height={20} className="h-5 w-5 object-contain" /> : null}
                {author?.name || "TA"}
              </span>
              <span>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</span>
            </div>
            <p className="font-handwriting whitespace-pre-line text-2xl leading-10 text-[#4a3a1f]">{item.message}</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
