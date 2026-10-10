"use client";

import { useEffect, useState } from "react";
import { hardNavigate } from "@/lib/client/navigate";
import { loadSession } from "@/lib/client/session";

export default function HomeGate() {
  const [target, setTarget] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let session: ReturnType<typeof loadSession> = null;
    try {
      session = loadSession();
    } catch {
      session = null;
    }
    const next = !session ? "/login" : !session.coupleId ? "/pair" : "/timeline";
    setTarget(next);
    hardNavigate(next);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="grid min-h-screen place-items-center gap-4 bg-paper px-6 text-center">
      <div className="grid gap-3 justify-items-center">
        <p className="text-lg font-black text-slate-400">正在打开我们慢慢说...</p>
        {slow ? (
          <a href={target || "/login"} className="rounded-2xl bg-ink px-6 py-3 font-black text-white">
            点这里手动进入
          </a>
        ) : null}
      </div>
    </main>
  );
}
