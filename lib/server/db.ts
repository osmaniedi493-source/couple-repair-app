import { neon } from "@neondatabase/serverless";
import type { Couple, ForgiveItem, ForgiveKind, PatternProfile, TimelineEntry, UserProfile } from "@/lib/types";
import type { MediationSession } from "@/lib/mediation/types";

function connectionString() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "缺少数据库连接串。请在 .env.local 里设置 POSTGRES_URL（或 DATABASE_URL），本地开发时通常用 `vercel env pull .env.local` 自动生成。"
    );
  }
  return url;
}

let cached: ReturnType<typeof neon> | null = null;

/** Lazily-created Neon HTTP query function. One query = one HTTPS request; no pool to manage. */
function sql() {
  if (!cached) cached = neon(connectionString());
  return cached;
}

export function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generatePairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 7 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

// ---------------------------------------------------------------------------
// Row <-> app type mapping
// ---------------------------------------------------------------------------

type UserRow = {
  id: string;
  phone: string;
  name: string;
  avatar_key: "girl" | "boy";
  couple_id: string | null;
  created_at: string;
};

function userFromRow(row: UserRow): UserProfile {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    avatarKey: row.avatar_key,
    coupleId: row.couple_id ?? undefined,
    createdAt: row.created_at
  };
}

type CoupleRow = { id: string; member_ids: string[]; created_at: string };

function coupleFromRow(row: CoupleRow): Couple {
  return { id: row.id, memberIds: row.member_ids, createdAt: row.created_at };
}

type TimelineRow = {
  id: string;
  couple_id: string;
  author_user_id: string;
  title: string;
  scene: string;
  emotions: string[];
  time: string;
  what_happened: string | null;
  why_it_matters: string | null;
  created_at: string;
};

function timelineFromRow(row: TimelineRow): TimelineEntry {
  return {
    id: row.id,
    coupleId: row.couple_id,
    authorUserId: row.author_user_id,
    title: row.title,
    scene: row.scene,
    emotions: row.emotions || [],
    time: row.time,
    createdAt: row.created_at,
    whatHappened: row.what_happened ?? undefined,
    whyItMatters: row.why_it_matters ?? undefined
  };
}

type ForgiveRow = {
  id: string;
  couple_id: string;
  kind: ForgiveKind;
  author_user_id: string;
  timeline_entry_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

function forgiveFromRow(row: ForgiveRow): ForgiveItem {
  return {
    id: row.id,
    coupleId: row.couple_id,
    kind: row.kind,
    authorUserId: row.author_user_id,
    timelineEntryId: row.timeline_entry_id ?? undefined,
    createdAt: row.created_at,
    ...row.data
  } as ForgiveItem;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function findUserById(id: string): Promise<UserProfile | null> {
  const rows = (await sql()`select * from users where id = ${id}`) as UserRow[];
  return rows[0] ? userFromRow(rows[0]) : null;
}

export async function findUserByPhone(phone: string): Promise<UserProfile | null> {
  const rows = (await sql()`select * from users where phone = ${phone}`) as UserRow[];
  return rows[0] ? userFromRow(rows[0]) : null;
}

/** Find-or-create by phone; on an existing account, refresh name/avatar to the latest login choice. */
export async function upsertUserByPhone(params: { phone: string; avatarKey: "girl" | "boy"; name: string }): Promise<UserProfile> {
  const existing = await findUserByPhone(params.phone);
  if (existing) {
    const rows = (await sql()`
      update users set name = ${params.name}, avatar_key = ${params.avatarKey}
      where id = ${existing.id}
      returning *
    `) as UserRow[];
    return userFromRow(rows[0]);
  }
  const id = generateId("user");
  const rows = (await sql()`
    insert into users (id, phone, name, avatar_key)
    values (${id}, ${params.phone}, ${params.name}, ${params.avatarKey})
    returning *
  `) as UserRow[];
  return userFromRow(rows[0]);
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

export async function findOwnPairCode(userId: string): Promise<string | null> {
  const rows = (await sql()`select code from pair_codes where user_id = ${userId} limit 1`) as { code: string }[];
  return rows[0]?.code ?? null;
}

export async function createPairCode(userId: string): Promise<string> {
  await sql()`delete from pair_codes where user_id = ${userId}`;
  const code = generatePairCode();
  await sql()`insert into pair_codes (code, user_id) values (${code}, ${userId})`;
  return code;
}

export async function getCoupleById(coupleId: string): Promise<Couple | null> {
  const rows = (await sql()`select * from couples where id = ${coupleId}`) as CoupleRow[];
  return rows[0] ? coupleFromRow(rows[0]) : null;
}

/** Members of a couple, ordered to match couple.memberIds (index 0 = person_a, index 1 = person_b). */
export async function listCoupleMembersOrdered(couple: Couple): Promise<(UserProfile | undefined)[]> {
  if (couple.memberIds.length === 0) return [];
  const rows = (await sql()`select * from users where id = any(${couple.memberIds}::text[])`) as UserRow[];
  const byId = new Map(rows.map((row) => [row.id, userFromRow(row)]));
  return couple.memberIds.map((id) => byId.get(id));
}

export type JoinResult =
  | { ok: true; couple: Couple; inviter: UserProfile }
  | { ok: false; error: string };

/** Validates + atomically creates the couple, updates both users, and clears any leftover pair codes. */
export async function consumePairCodeAndJoin(joiningUserId: string, rawCode: string): Promise<JoinResult> {
  const code = rawCode.trim().toUpperCase();
  const joiningUser = await findUserById(joiningUserId);
  if (!joiningUser) return { ok: false, error: "用户不存在，请重新登录。" };
  if (joiningUser.coupleId) return { ok: false, error: "你已经绑定了情侣关系。" };

  const codeRows = (await sql()`select * from pair_codes where code = ${code}`) as { code: string; user_id: string }[];
  const entry = codeRows[0];
  if (!entry) return { ok: false, error: "配对码无效或已过期，请确认对方刚生成的最新配对码。" };
  if (entry.user_id === joiningUserId) return { ok: false, error: "不能使用自己的配对码。" };

  const inviter = await findUserById(entry.user_id);
  if (!inviter) return { ok: false, error: "配对码对应的用户不存在。" };
  if (inviter.coupleId) return { ok: false, error: "对方已经和别人绑定了。" };

  const coupleId = generateId("couple");
  const memberIds = [inviter.id, joiningUser.id];

  await sql().transaction((txSql) => [
    txSql`insert into couples (id, member_ids) values (${coupleId}, ${memberIds}::text[])`,
    txSql`update users set couple_id = ${coupleId} where id = ${inviter.id}`,
    txSql`update users set couple_id = ${coupleId} where id = ${joiningUser.id}`,
    txSql`delete from pair_codes where user_id = ${inviter.id} or user_id = ${joiningUser.id}`
  ]);

  return {
    ok: true,
    couple: { id: coupleId, memberIds, createdAt: new Date().toISOString() },
    inviter: { ...inviter, coupleId }
  };
}

export type UnbindResult = { ok: true } | { ok: false; error: string };

export async function unbindCouple(userId: string): Promise<UnbindResult> {
  const user = await findUserById(userId);
  if (!user) return { ok: false, error: "用户不存在，请重新登录。" };
  if (!user.coupleId) return { ok: false, error: "还没有绑定情侣关系。" };

  const couple = await getCoupleById(user.coupleId);
  if (couple) {
    await sql().transaction((txSql) =>
      couple.memberIds
        .map((memberId) => txSql`update users set couple_id = null where id = ${memberId}`)
        .concat([txSql`delete from couples where id = ${couple.id}`])
    );
  } else {
    await sql()`update users set couple_id = null where id = ${userId}`;
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export async function listTimelineEntries(coupleId: string): Promise<TimelineEntry[]> {
  const rows = (await sql()`
    select * from timeline_entries where couple_id = ${coupleId} order by time desc, created_at desc
  `) as TimelineRow[];
  return rows.map(timelineFromRow);
}

export async function createTimelineEntry(params: {
  coupleId: string;
  authorUserId: string;
  title: string;
  scene: string;
  emotions: string[];
  time: string;
}): Promise<TimelineEntry> {
  const id = generateId("entry");
  const rows = (await sql()`
    insert into timeline_entries (id, couple_id, author_user_id, title, scene, emotions, time)
    values (${id}, ${params.coupleId}, ${params.authorUserId}, ${params.title}, ${params.scene}, ${params.emotions}::text[], ${params.time})
    returning *
  `) as TimelineRow[];
  return timelineFromRow(rows[0]);
}

export async function findTimelineEntry(id: string): Promise<TimelineEntry | null> {
  const rows = (await sql()`select * from timeline_entries where id = ${id}`) as TimelineRow[];
  return rows[0] ? timelineFromRow(rows[0]) : null;
}

export async function updateTimelineEntry(
  id: string,
  patch: { title?: string; whatHappened?: string; whyItMatters?: string }
): Promise<TimelineEntry | null> {
  const current = await findTimelineEntry(id);
  if (!current) return null;
  const rows = (await sql()`
    update timeline_entries set
      title = ${patch.title ?? current.title},
      what_happened = ${patch.whatHappened ?? current.whatHappened ?? null},
      why_it_matters = ${patch.whyItMatters ?? current.whyItMatters ?? null}
    where id = ${id}
    returning *
  `) as TimelineRow[];
  return rows[0] ? timelineFromRow(rows[0]) : null;
}

export async function deleteTimelineEntry(coupleId: string, id: string): Promise<void> {
  await sql()`delete from timeline_entries where id = ${id} and couple_id = ${coupleId}`;
}

// ---------------------------------------------------------------------------
// Mediation sessions
// ---------------------------------------------------------------------------

export async function getMediationSession(coupleId: string, entryId: string): Promise<MediationSession | null> {
  const rows = (await sql()`
    select data from mediation_sessions where couple_id = ${coupleId} and entry_id = ${entryId}
  `) as { data: MediationSession }[];
  return rows[0]?.data ?? null;
}

export async function saveMediationSession(coupleId: string, entryId: string, session: MediationSession): Promise<void> {
  await sql()`
    insert into mediation_sessions (couple_id, entry_id, data, updated_at)
    values (${coupleId}, ${entryId}, ${JSON.stringify(session)}::jsonb, now())
    on conflict (couple_id, entry_id) do update set data = excluded.data, updated_at = now()
  `;
}

export async function archiveMediationSession(coupleId: string, session: MediationSession): Promise<void> {
  await sql()`insert into mediation_history (couple_id, data) values (${coupleId}, ${JSON.stringify(session)}::jsonb)`;
}

export async function listMediationHistory(coupleId: string): Promise<MediationSession[]> {
  const rows = (await sql()`
    select data from mediation_history where couple_id = ${coupleId} order by created_at desc
  `) as { data: MediationSession }[];
  return rows.map((row) => row.data);
}

/** All "current" sessions for a couple (one per timeline entry) that already reached an analysis. */
export async function listCurrentFinalSessions(coupleId: string): Promise<MediationSession[]> {
  const rows = (await sql()`select data from mediation_sessions where couple_id = ${coupleId}`) as {
    data: MediationSession;
  }[];
  return rows.map((row) => row.data).filter((session) => Boolean(session.finalAnalysis || session.safetyAnalysis));
}

// ---------------------------------------------------------------------------
// Forgive items
// ---------------------------------------------------------------------------

export async function listForgiveItems(coupleId: string, kind?: ForgiveKind): Promise<ForgiveItem[]> {
  const rows = (kind
    ? await sql()`
        select * from forgive_items where couple_id = ${coupleId} and kind = ${kind} order by created_at desc
      `
    : await sql()`select * from forgive_items where couple_id = ${coupleId} order by created_at desc`) as ForgiveRow[];
  return rows.map(forgiveFromRow);
}

export async function findForgiveItem(id: string): Promise<ForgiveItem | null> {
  const rows = (await sql()`select * from forgive_items where id = ${id}`) as ForgiveRow[];
  return rows[0] ? forgiveFromRow(rows[0]) : null;
}

export async function createForgiveItem(item: ForgiveItem): Promise<ForgiveItem> {
  const { id, coupleId, kind, authorUserId, timelineEntryId, createdAt, ...rest } = item;
  await sql()`
    insert into forgive_items (id, couple_id, kind, author_user_id, timeline_entry_id, data, created_at)
    values (${id}, ${coupleId}, ${kind}, ${authorUserId}, ${timelineEntryId ?? null}, ${JSON.stringify(rest)}::jsonb, ${createdAt})
  `;
  return item;
}

export async function updateForgiveItemData(id: string, patch: Record<string, unknown>): Promise<ForgiveItem | null> {
  const current = await findForgiveItem(id);
  if (!current) return null;
  const { id: _id, coupleId, kind, authorUserId, timelineEntryId, createdAt, ...rest } = current;
  void _id;
  const merged = { ...rest, ...patch };
  await sql()`update forgive_items set data = ${JSON.stringify(merged)}::jsonb where id = ${id}`;
  return { id, coupleId, kind, authorUserId, timelineEntryId, createdAt, ...merged } as ForgiveItem;
}

export async function deleteForgiveItem(coupleId: string, id: string): Promise<void> {
  await sql()`delete from forgive_items where id = ${id} and couple_id = ${coupleId}`;
}

// ---------------------------------------------------------------------------
// Pattern profiles
// ---------------------------------------------------------------------------

export async function getPatternProfile(coupleId: string, userId: string): Promise<PatternProfile | null> {
  const rows = (await sql()`
    select data from pattern_profiles where couple_id = ${coupleId} and user_id = ${userId}
  `) as { data: PatternProfile }[];
  return rows[0]?.data ?? null;
}

export async function savePatternProfile(coupleId: string, userId: string, profile: PatternProfile): Promise<void> {
  await sql()`
    insert into pattern_profiles (couple_id, user_id, data, updated_at)
    values (${coupleId}, ${userId}, ${JSON.stringify(profile)}::jsonb, now())
    on conflict (couple_id, user_id) do update set data = excluded.data, updated_at = now()
  `;
}
