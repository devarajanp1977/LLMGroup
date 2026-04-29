import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env, hasDatabase } from "@/lib/env";

import * as schema from "./schema";

declare global {
  var __atriumSql: postgres.Sql | undefined;
}

function createClient() {
  if (!hasDatabase || !env.DATABASE_URL) {
    return null;
  }

  const sql =
    globalThis.__atriumSql ??
    postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });

  if (!globalThis.__atriumSql) {
    globalThis.__atriumSql = sql;
  }

  return {
    sql,
    db: drizzle(sql, { schema }),
  };
}

export const database = createClient();
