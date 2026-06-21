import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { ExecuteValues } from "mysql2";
import mysql from "mysql2/promise";
import { config } from "../config/env.js";

let pool: Pool | null = null;

export async function initDb(): Promise<void> {
  if (pool) return;

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    timezone: "+00:00",
  });

  try {
    const connection = await pool.getConnection();
    try {
      await connection.ping();
    } finally {
      connection.release();
    }
  } catch (err) {
    pool = null;
    const { host, port, database } = config.db;
    const message =
      `Cannot connect to MySQL at ${host}:${port}/${database}. ` +
      "Check DB env vars (Railway: link MySQL service and set MYSQLHOST/MYSQLPORT/... or MYSQL_URL).";
    throw new Error(message, { cause: err });
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return pool;
}

export async function query<T extends RowDataPacket>(
  sql: string,
  params: ExecuteValues = []
): Promise<T[]> {
  const [rows] = await getPool().execute<T[]>(sql, params);
  return rows;
}

export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params: ExecuteValues = []
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: ExecuteValues = []): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
