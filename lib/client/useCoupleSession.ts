"use client";

import { useEffect, useState } from "react";
import { hardNavigate } from "@/lib/client/navigate";
import { loadSession, saveSession, type LocalSession } from "@/lib/client/session";
import type { AvatarKey } from "@/lib/types";

export type Member = { id: string; name: string; avatarKey: AvatarKey };

export function useCoupleSession() {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

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

  useEffect(() => {
    if (!session?.coupleId) return;
    (async () => {
      try {
        const response = await fetch(`/api/pair?userId=${encodeURIComponent(session.userId)}`);
        const data = await response.json();
        if (!response.ok) return;
        if (!data.couple) {
          // The couple was unbound (by either side) since this device last checked.
          // Clear the stale coupleId and send this device back to pairing.
          saveSession({ ...session, coupleId: undefined });
          hardNavigate("/pair");
          return;
        }
        const self: Member = {
          id: session.userId,
          name: data.user?.name || session.name,
          avatarKey: data.user?.avatarKey || session.avatarKey
        };
        const partner: Member[] = data.partner
          ? [{ id: data.partner.id, name: data.partner.name, avatarKey: data.partner.avatarKey }]
          : [];
        setMembers([self, ...partner]);
      } catch {
        // ignore, member lookup is best-effort for display
      }
    })();
  }, [session]);

  return { session, members };
}
