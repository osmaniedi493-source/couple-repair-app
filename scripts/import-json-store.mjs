#!/usr/bin/env node
// One-time import of the old file-based data/store.json into Postgres, so
// existing pairings/timelines/mediation history survive the cutover to a
// real database. Safe to run once after `pnpm run db:migrate`; re-running
// will fail on duplicate primary keys (that's the intended guard against
// double-importing).
//
// Usage: node scripts/import-json-store.mjs

import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

async function main() {
  loadEnvLocal();
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("缺少 POSTGRES_URL / DATABASE_URL，请先在 .env.local 里配置数据库连接串。");
    process.exit(1);
  }

  const storePath = path.join(root, "data", "store.json");
  if (!existsSync(storePath)) {
    console.log("没有找到 data/store.json，没有旧数据需要导入。");
    return;
  }
  const store = JSON.parse(readFileSync(storePath, "utf-8"));
  const sql = neon(connectionString);

  let counts = { users: 0, couples: 0, timeline: 0, mediationSessions: 0, mediationHistory: 0, forgiveItems: 0, patternProfiles: 0 };

  for (const user of Object.values(store.users || {})) {
    await sql`
      insert into users (id, phone, name, avatar_key, couple_id, created_at)
      values (${user.id}, ${user.phone}, ${user.name}, ${user.avatarKey}, ${user.coupleId || null}, ${user.createdAt})
      on conflict (id) do nothing
    `;
    counts.users++;
  }

  for (const couple of Object.values(store.couples || {})) {
    await sql`
      insert into couples (id, member_ids, created_at)
      values (${couple.id}, ${couple.memberIds}::text[], ${couple.createdAt})
      on conflict (id) do nothing
    `;
    counts.couples++;
  }

  for (const entries of Object.values(store.timeline || {})) {
    for (const entry of entries) {
      await sql`
        insert into timeline_entries (id, couple_id, author_user_id, title, scene, emotions, time, what_happened, why_it_matters, created_at)
        values (${entry.id}, ${entry.coupleId}, ${entry.authorUserId}, ${entry.title}, ${entry.scene}, ${entry.emotions || []}::text[], ${entry.time}, ${entry.whatHappened || null}, ${entry.whyItMatters || null}, ${entry.createdAt})
        on conflict (id) do nothing
      `;
      counts.timeline++;
    }
  }

  for (const [coupleId, byEntry] of Object.entries(store.mediationSessions || {})) {
    for (const [entryId, session] of Object.entries(byEntry)) {
      await sql`
        insert into mediation_sessions (couple_id, entry_id, data, updated_at)
        values (${coupleId}, ${entryId}, ${JSON.stringify(session)}::jsonb, ${session.updatedAt || new Date().toISOString()})
        on conflict (couple_id, entry_id) do nothing
      `;
      counts.mediationSessions++;
    }
  }

  for (const [coupleId, sessions] of Object.entries(store.mediationHistory || {})) {
    for (const session of sessions) {
      await sql`insert into mediation_history (couple_id, data) values (${coupleId}, ${JSON.stringify(session)}::jsonb)`;
      counts.mediationHistory++;
    }
  }

  for (const items of Object.values(store.forgiveItems || {})) {
    for (const item of items) {
      const { id, coupleId, kind, authorUserId, timelineEntryId, createdAt, ...rest } = item;
      await sql`
        insert into forgive_items (id, couple_id, kind, author_user_id, timeline_entry_id, data, created_at)
        values (${id}, ${coupleId}, ${kind}, ${authorUserId}, ${timelineEntryId || null}, ${JSON.stringify(rest)}::jsonb, ${createdAt})
        on conflict (id) do nothing
      `;
      counts.forgiveItems++;
    }
  }

  for (const [coupleId, byUser] of Object.entries(store.patternProfiles || {})) {
    for (const [userId, profile] of Object.entries(byUser)) {
      await sql`
        insert into pattern_profiles (couple_id, user_id, data, updated_at)
        values (${coupleId}, ${userId}, ${JSON.stringify(profile)}::jsonb, ${profile.generatedAt || new Date().toISOString()})
        on conflict (couple_id, user_id) do nothing
      `;
      counts.patternProfiles++;
    }
  }

  console.log("导入完成：", counts);
}

main().catch((error) => {
  console.error("导入失败：", error);
  process.exit(1);
});
