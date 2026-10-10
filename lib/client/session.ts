import type { AvatarKey } from "@/lib/types";

export type LocalSession = {
  userId: string;
  phone: string;
  name: string;
  avatarKey: AvatarKey;
  coupleId?: string;
};

const KEY = "slow-talk-session-v1";

export function loadSession(): LocalSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalSession;
  } catch {
    return null;
  }
}

export function saveSession(session: LocalSession) {
  window.localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
}
