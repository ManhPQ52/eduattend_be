import type { UserRole, UserRow, AuthUser, Weekday } from "../types/index.js";

const HUST_EMAIL_DOMAIN = "@hust.edu.vn";

export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";

const WEEKDAY_SHORT_TO_CODE: Record<string, Weekday> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

export function toAuthUser(row: Pick<UserRow, "id" | "name" | "email" | "role">): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    redirectTo: row.role === "teacher" ? "teacher_dash" : "student_dash",
  };
}

export function isValidHustEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith(HUST_EMAIL_DOMAIN) &&
    normalized.length > HUST_EMAIL_DOMAIN.length &&
    !normalized.includes(" ")
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateUserId(role: UserRole, existingIds: string[]): string {
  const prefix = role === "teacher" ? "TCH" : "STU";
  const nums = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(3), 10))
    .filter((value) => !Number.isNaN(value));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function generateCourseId(existingIds: string[]): string {
  const nums = existingIds
    .filter((id) => id.startsWith("CR"))
    .map((id) => parseInt(id.slice(2), 10))
    .filter((value) => !Number.isNaN(value));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `CR${String(next).padStart(3, "0")}`;
}

export function generateEnrollmentId(): string {
  return `ENR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function generateLogId(): string {
  return `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function generateSessionId(courseId: string): string {
  return `SES-${courseId}-${Date.now()}`;
}

export function generateSessionPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Ngày hiện tại theo Asia/Ho_Chi_Minh, format YYYY-MM-DD */
export function todayDateString(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: APP_TIMEZONE }).format(now);
}

export function getTodayWeekday(now = new Date()): Weekday {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
  }).format(now);
  return WEEKDAY_SHORT_TO_CODE[short] ?? "sun";
}

export function timeString(date = new Date()): string {
  return date.toLocaleTimeString("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Gộp date + HH:mm → MySQL DATETIME string */
export function combineDateAndTime(date: string, time: string): string {
  const normalized = time.trim().length === 5 ? `${time.trim()}:00` : time.trim();
  return `${date} ${normalized}`;
}

export interface SessionWindow {
  date: string;
  openedAt: string;
  expiresAt: string;
}

/** opened_at = đầu buổi, expires_at = cuối buổi theo lịch lớp */
export function buildSessionWindow(
  startTime: string,
  endTime: string,
  now = new Date()
): SessionWindow {
  const date = todayDateString(now);
  const openedAt = combineDateAndTime(date, startTime);
  const expiresAt = combineDateAndTime(date, endTime);

  if (parseMysqlDatetime(expiresAt) <= parseMysqlDatetime(openedAt)) {
    throw new Error("invalidSessionWindow");
  }

  return { date, openedAt, expiresAt };
}

export function parseMysqlDatetime(value: string): number {
  const trimmed = value.trim();
  if (trimmed.includes("T")) {
    if (trimmed.includes("+") || trimmed.endsWith("Z")) {
      return new Date(trimmed).getTime();
    }
    return new Date(`${trimmed}+07:00`).getTime();
  }
  const withSeconds = trimmed.length === 16 ? `${trimmed}:00` : trimmed;
  return new Date(`${withSeconds.replace(" ", "T")}+07:00`).getTime();
}

/** API response: 2026-06-20T16:00:00+07:00 */
export function toTimezoneIso(mysqlDatetime: string): string {
  const trimmed = mysqlDatetime.trim();
  if (trimmed.includes("T") && (trimmed.includes("+") || trimmed.endsWith("Z"))) {
    return trimmed;
  }
  const base = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withSeconds = base.length === 16 ? `${base}:00` : base;
  return `${withSeconds}+07:00`;
}

export function isSessionActive(
  session: {
    status: string;
    openedAt?: string;
    opened_at?: string;
    expiresAt?: string;
    expires_at?: string;
  },
  now = new Date()
): boolean {
  if (session.status !== "open") return false;

  const openedAt = session.openedAt ?? session.opened_at;
  const expiresAt = session.expiresAt ?? session.expires_at;
  if (!openedAt || !expiresAt) return false;

  const nowMs = now.getTime();
  return (
    nowMs >= parseMysqlDatetime(openedAt) && nowMs <= parseMysqlDatetime(expiresAt)
  );
}

export function getSessionTimeStatus(
  session: {
    status: string;
    openedAt?: string;
    opened_at?: string;
    expiresAt?: string;
    expires_at?: string;
    date?: string;
  },
  now = new Date()
): "active" | "not_started" | "expired" | "closed" {
  if (session.status !== "open") return "closed";

  const sessionDate = session.date;
  const today = todayDateString(now);
  if (sessionDate && sessionDate !== today) return "expired";

  const openedAt = session.openedAt ?? session.opened_at;
  const expiresAt = session.expiresAt ?? session.expires_at;
  if (!openedAt || !expiresAt) return "expired";

  const nowMs = now.getTime();
  if (nowMs < parseMysqlDatetime(openedAt)) return "not_started";
  if (nowMs > parseMysqlDatetime(expiresAt)) return "expired";
  return "active";
}

export function parseScheduleDays(raw: string | unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function calcAttendanceRate(
  present: number,
  late: number,
  absent: number,
  enrolled: number
): number {
  if (enrolled === 0) return 0;
  return Math.round(((present + late * 0.5) / enrolled) * 1000) / 10;
}

/** URL ảnh public (Firebase Storage, CDN, ...) */
export function isValidPhotoUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function resolvePhotoUrl(
  photoUrl?: string,
  verificationPhoto?: string
): string | undefined {
  const candidate = (photoUrl ?? verificationPhoto)?.trim();
  if (!candidate) return undefined;
  if (!isValidPhotoUrl(candidate)) {
    throw new Error("invalidPhotoUrl");
  }
  return candidate;
}
