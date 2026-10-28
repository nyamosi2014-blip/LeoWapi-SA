import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const root = join(__dirname, "..", "..");
const adminUrl = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/postgres";

/** Creates a throwaway database with the Supabase stub and every migration applied. */
export async function freshDatabase(name: string) {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(readFileSync(join(root, "tests/db/supabase-stub.sql"), "utf8"));
  const dir = join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.query(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export type Db = Client;

/**
 * Runs one statement the way the Supabase API would for this caller: as `anon`, or as
 * `authenticated` with the user's id in the JWT claims. Each call is its own transaction.
 */
export async function as(db: Db, user: string | null, sql: string, params: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [
      user ? "authenticated" : "anon",
      user ? JSON.stringify({ sub: user, role: "authenticated" }) : "",
    ]);
    const result = await db.query(sql, params);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

export async function createUser(db: Db, email: string, roles: string[] = []) {
  const { rows } = await db.query("insert into auth.users (email) values ($1) returning id", [email]);
  for (const role of roles) await db.query("insert into public.user_roles (user_id, role) values ($1, $2)", [rows[0].id, role]);
  return rows[0].id as string;
}
