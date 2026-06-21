import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const rootDir = process.cwd();

export const config = {
  port: parseInt(process.env.PORT ?? "8080", 10),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  timezone: process.env.TZ ?? "Asia/Ho_Chi_Minh",
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "eduattend",
  },
};
