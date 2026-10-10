"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { saveSession } from "@/lib/client/session";
import { avatarProfiles, type AvatarKey } from "@/lib/types";

const NAME_LIMIT = 10;

export default function LoginPage() {
  const [avatarKey, setAvatarKey] = useState<AvatarKey>("girl");
  const [name, setName] = useState(avatarProfiles.girl.defaultName);
  const [nameTouched, setNameTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function pickAvatar(key: AvatarKey) {
    setAvatarKey(key);
    if (!nameTouched) setName(avatarProfiles[key].defaultName);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, avatarKey, name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录失败，请重试。");
      saveSession({
        userId: data.user.id,
        phone: data.user.phone,
        name: data.user.name,
        avatarKey: data.user.avatarKey,
        coupleId: data.user.coupleId
      });
      window.location.href = data.user.coupleId ? "/timeline" : "/pair";
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
      <section className="grid w-full gap-7 rounded-[28px] border-[3px] border-ink bg-cream p-6 shadow-sticker sm:p-10">
        <div className="grid gap-2 text-center">
          <p className="text-sm font-black text-rose">我们慢慢说</p>
          <h1 className="text-3xl font-black text-ink sm:text-4xl">完善资料</h1>
        </div>

        <form className="grid gap-5" onSubmit={submit}>
          <section className="grid gap-4 rounded-3xl border-2 border-ink/15 bg-white/70 p-5">
            <div>
              <p className="font-black text-ink">你是男生还是女生？</p>
              <p className="text-sm text-slate-500">介绍一下自己的头像吧</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {(Object.entries(avatarProfiles) as [AvatarKey, (typeof avatarProfiles)[AvatarKey]][]).map(
                ([key, avatar]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickAvatar(key)}
                    className={`grid justify-items-center gap-2 rounded-3xl border-[3px] p-4 transition ${
                      avatarKey === key ? "border-ink bg-peach/40 shadow-sticker" : "border-black/10 bg-white"
                    }`}
                  >
                    <Image src={avatar.src} alt={avatar.label} width={120} height={120} className="h-28 w-28 object-contain" />
                    <strong className="font-black">{avatar.defaultName}</strong>
                    <span className="text-xs font-bold text-slate-400">{avatar.label}</span>
                  </button>
                )
              )}
            </div>
          </section>

          <section className="grid gap-3 rounded-3xl border-2 border-ink/15 bg-white/70 p-5">
            <div>
              <p className="font-black text-ink">大家应该怎么称呼你？</p>
              <p className="text-sm text-slate-500">取一个好听的昵称吧</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-white px-4 py-3">
              <input
                className="min-w-0 flex-1 font-bold text-ink"
                value={name}
                maxLength={NAME_LIMIT}
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
                required
              />
              <span className="shrink-0 text-xs font-bold text-slate-400">
                {name.length}/{NAME_LIMIT}
              </span>
            </div>
          </section>

          <label className="grid gap-2 font-black text-ink">
            手机号
            <input
              className="rounded-2xl border-2 border-ink bg-white px-4 py-3 font-bold"
              inputMode="tel"
              placeholder="请输入手机号"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm font-bold text-rose">{error}</p>
          ) : null}

          <button className="rounded-2xl bg-ink px-6 py-4 text-lg font-black text-white disabled:opacity-50" disabled={loading}>
            {loading ? "登录中..." : "授权手机号登录"}
          </button>
          <p className="text-center text-xs text-slate-400">
            本地原型会先模拟授权，不会发送验证码；正式上线可接入短信 OTP 服务。
          </p>
        </form>
      </section>
    </main>
  );
}
