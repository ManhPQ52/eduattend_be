import dotenv from "dotenv";

dotenv.config({ quiet: true });

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseDbUrl(url: string): DbConfig | null {
  try {
    const parsed = new URL(url);
    if (!["mysql:", "mysql2:"].includes(parsed.protocol)) return null;
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

function resolveDbConfig(): DbConfig {
  const fromUrl =
    parseDbUrl(process.env.DATABASE_URL ?? "") ??
    parseDbUrl(process.env.MYSQL_URL ?? "");

  if (fromUrl?.host && fromUrl.database) return fromUrl;

  const host =
    process.env.DB_HOST ??
    process.env.MYSQLHOST ??
    process.env.MYSQL_HOST ??
    "localhost";

  const port = parseInt(
    process.env.DB_PORT ?? process.env.MYSQLPORT ?? process.env.MYSQL_PORT ?? "3306",
    10
  );

  const user =
    process.env.DB_USER ?? process.env.MYSQLUSER ?? process.env.MYSQL_USER ?? "root";

  const password =
    process.env.DB_PASSWORD ?? process.env.MYSQLPASSWORD ?? process.env.MYSQL_PASSWORD ?? "";

  const database =
    process.env.DB_NAME ?? process.env.MYSQLDATABASE ?? process.env.MYSQL_DATABASE ?? "eduattend";

  return { host, port, user, password, database };
}

export const config = {
  port: parseInt(process.env.PORT ?? "8080", 10),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  timezone: process.env.TZ ?? "Asia/Ho_Chi_Minh",
  db: resolveDbConfig(),
};
