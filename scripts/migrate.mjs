#!/usr/bin/env node
// Applies sql/schema.sql to the database configured via POSTGRES_URL /
// DATABASE_URL (read from .env.local). Safe to re-run — every statement uses
// `if not exists`.
//
// Usage: node scripts/migrate.mjs

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

  const schemaPath = path.join(root, "sql", "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8")
    // Strip full-line comments first — otherwise a comment glued to the
    // following statement (no semicolon between them) makes the whole
    // chunk start with "--" and silently drops the statement after it.
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  // Naive split on statement-terminating semicolons — fine for this schema
  // file since every statement is a simple, non-nested DDL statement.
  const statements = schema
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const sql = neon(connectionString);

  console.log(`正在对数据库执行 ${statements.length} 条建表/建索引语句...`);
  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log("完成。数据库结构已就绪。");
}

main().catch((error) => {
  console.error("迁移失败：", error);
  process.exit(1);
});
