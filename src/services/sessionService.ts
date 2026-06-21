import { execute, query, queryOne } from "../db/index.js";
import type { AttendanceSession, AuthUser } from "../types/index.js";
import {
  buildSessionWindow,
  generateSessionId,
  generateSessionPin,
  getSessionTimeStatus,
  getTodayWeekday,
  isSessionActive,
  parseScheduleDays,
  todayDateString,
  toTimezoneIso,
} from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import type { RowDataPacket } from "mysql2/promise";

interface SessionRow extends RowDataPacket {
  id: string;
  course_id: string;
  date: string;
  pin_code: string;
  status: "open" | "closed";
  opened_at: string;
  expires_at: string;
}

interface CourseScheduleRow extends RowDataPacket {
  id: string;
  instructor_id: string;
  start_time: string;
  end_time: string;
  schedule_days: string | unknown;
}

function mapSession(row: SessionRow, includePin = true): AttendanceSession {
  return {
    id: row.id,
    courseId: row.course_id,
    date: row.date,
    pinCode: includePin ? row.pin_code : "",
    status: row.status,
    openedAt: toTimezoneIso(row.opened_at),
    expiresAt: toTimezoneIso(row.expires_at),
  };
}

async function getCourseSchedule(courseId: string): Promise<CourseScheduleRow> {
  const course = await queryOne<CourseScheduleRow>(
    "SELECT id, instructor_id, start_time, end_time, schedule_days FROM courses WHERE id = ?",
    [courseId]
  );
  if (!course) throw new AppError(404, "courseNotFound");
  return course;
}

async function assertTeacherOwnsCourse(courseId: string, teacher: AuthUser): Promise<void> {
  const course = await getCourseSchedule(courseId);
  if (course.instructor_id !== teacher.id) throw new AppError(403, "forbidden");
}

function assertCourseScheduledToday(course: CourseScheduleRow): void {
  const scheduleDays = parseScheduleDays(course.schedule_days);
  const today = getTodayWeekday();
  if (!scheduleDays.includes(today)) {
    throw new AppError(400, "courseNotScheduledToday", "courseNotScheduledToday");
  }
}

function resolveSessionWindow(course: CourseScheduleRow): {
  date: string;
  openedAt: string;
  expiresAt: string;
} {
  try {
    return buildSessionWindow(course.start_time, course.end_time);
  } catch {
    throw new AppError(400, "invalidSessionWindow", "invalidSessionWindow");
  }
}

async function getSessionRow(sessionId: string): Promise<SessionRow> {
  const row = await queryOne<SessionRow>(
    "SELECT * FROM attendance_sessions WHERE id = ?",
    [sessionId]
  );
  if (!row) throw new AppError(404, "sessionNotFound");
  return row;
}

export async function openSession(
  teacher: AuthUser,
  courseId: string
): Promise<AttendanceSession> {
  const course = await getCourseSchedule(courseId);
  if (course.instructor_id !== teacher.id) throw new AppError(403, "forbidden");

  assertCourseScheduledToday(course);
  const { date, openedAt, expiresAt } = resolveSessionWindow(course);

  const existing = await queryOne<SessionRow>(
    `SELECT * FROM attendance_sessions WHERE course_id = ? AND date = ? AND status = 'open'`,
    [courseId, date]
  );

  if (existing) {
    await execute(
      `UPDATE attendance_sessions SET opened_at = ?, expires_at = ? WHERE id = ?`,
      [openedAt, expiresAt, existing.id]
    );
    return mapSession({ ...existing, opened_at: openedAt, expires_at: expiresAt }, true);
  }

  const id = generateSessionId(courseId);
  const pinCode = generateSessionPin();

  await execute(
    `INSERT INTO attendance_sessions (id, course_id, date, pin_code, status, opened_at, expires_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    [id, courseId, date, pinCode, openedAt, expiresAt]
  );

  return mapSession(
    {
      id,
      course_id: courseId,
      date,
      pin_code: pinCode,
      status: "open",
      opened_at: openedAt,
      expires_at: expiresAt,
    } as SessionRow,
    true
  );
}

export async function regeneratePin(
  teacher: AuthUser,
  sessionId: string
): Promise<AttendanceSession> {
  const row = await getSessionRow(sessionId);
  await assertTeacherOwnsCourse(row.course_id, teacher);

  const pinCode = generateSessionPin();

  await execute(
    `UPDATE attendance_sessions SET pin_code = ?, status = 'open' WHERE id = ?`,
    [pinCode, sessionId]
  );

  return mapSession({ ...row, pin_code: pinCode, status: "open" }, true);
}

export async function closeSession(
  teacher: AuthUser,
  sessionId: string
): Promise<AttendanceSession> {
  const row = await getSessionRow(sessionId);
  await assertTeacherOwnsCourse(row.course_id, teacher);
  await execute("UPDATE attendance_sessions SET status = 'closed' WHERE id = ?", [sessionId]);
  return mapSession({ ...row, status: "closed" }, true);
}

export async function getActiveSessionForCourse(
  courseId: string,
  includePin: boolean
): Promise<AttendanceSession | null> {
  const date = todayDateString();
  const row = await queryOne<SessionRow>(
    `SELECT * FROM attendance_sessions WHERE course_id = ? AND date = ? AND status = 'open'
     ORDER BY opened_at DESC LIMIT 1`,
    [courseId, date]
  );

  if (!row || !isSessionActive(row)) return null;
  return mapSession(row, includePin);
}

export async function getActiveSessionsForStudent(
  student: AuthUser
): Promise<AttendanceSession[]> {
  const date = todayDateString();
  const rows = await query<SessionRow>(
    `SELECT s.* FROM attendance_sessions s
     JOIN enrollments e ON e.course_id = s.course_id
     WHERE e.student_id = ? AND e.status = 'approved'
       AND s.date = ? AND s.status = 'open'
     ORDER BY s.opened_at DESC`,
    [student.id, date]
  );

  return rows.filter((row) => isSessionActive(row)).map((row) => mapSession(row, false));
}

export async function validateSessionForCheckIn(
  sessionId: string,
  courseId: string,
  pinCode: string
): Promise<SessionRow> {
  const row = await getSessionRow(sessionId);

  if (row.course_id !== courseId) throw new AppError(400, "sessionCourseMismatch");
  if (row.status !== "open") throw new AppError(400, "sessionClosed");

  const today = todayDateString();
  if (row.date !== today) throw new AppError(400, "sessionExpired", "sessionExpired");

  const timeStatus = getSessionTimeStatus(row);
  if (timeStatus === "not_started") {
    throw new AppError(400, "sessionNotStarted", "sessionNotStarted");
  }
  if (timeStatus === "expired") {
    throw new AppError(400, "sessionExpired", "sessionExpired");
  }

  if (row.pin_code !== pinCode) throw new AppError(400, "invalidPin");

  return row;
}

export async function validateSessionForTeacherSubmit(
  sessionId: string,
  courseId: string,
  pinCode: string,
  teacher: AuthUser
): Promise<SessionRow> {
  const row = await validateSessionForCheckIn(sessionId, courseId, pinCode);
  await assertTeacherOwnsCourse(courseId, teacher);
  return row;
}
