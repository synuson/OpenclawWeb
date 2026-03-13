import path from "node:path";

export function resolveLocalDatabaseUrl(baseDir?: string) {
  const root = baseDir || process.env.OPENCLAW_USER_DATA_DIR || process.cwd();
  return `file:${path.join(root, "data.db").replace(/\\/g, "/")}`;
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || resolveLocalDatabaseUrl();
}
