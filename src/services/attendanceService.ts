import { execute, query, queryOne } from "../db/index.js";
import type {
  AttendanceLogEntry,
  AttendanceRecord,
  AttendanceStatus,
  AuthUser,
  CheckInRequest,
  VerificationMethod,
} from "../types/index.js";
import { generateLogId, resolvePhotoUrl, timeString, todayDateString } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { assertApprovedEnrollment } from "./enrollmentService.js";
import {
  validateSessionForCheckIn,
  validateSessionForTeacherSubmit,
} from "./sessionService.js";
import type { RowDataPacket } from "mysql2/promise";

interface LogRow extends RowDataPacket {
  id: string;
  student_id: string;
  student_name: string;
  course_id: string;
  course_code: string;
  course_name: string;
  session_id: string | null;
  date: string;
  time_mark: string;
  status: AttendanceStatus;
  verification_method: VerificationMethod;
  verification_confidence: number | null;
  verification_photo: string | null;
}

interface CourseInfoRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  instructor_id: string;
}

interface StudentInfoRow extends RowDataPacket {
  id: string;
  name: string;
}

function mapLog(row: LogRow): AttendanceLogEntry {
  const entry: AttendanceLogEntry = {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    courseId: row.course_id,
    courseCode: row.course_code,
    courseName: row.course_name,
    date: row.date,
    timestamp: row.time_mark,
    status: row.status,
    verificationMethod: row.verification_method,
  };
  if (row.session_id) entry.sessionId = row.session_id;
  if (row.verification_confidence != null) {
    entry.verificationConfidence = Number(row.verification_confidence);
  }
  if (row.verification_photo) entry.verificationPhoto = row.verification_photo;
  return entry;
}

async function getCourseInfo(courseId: string): Promise<CourseInfoRow> {
  const course = await queryOne<CourseInfoRow>(
    "SELECT id, code, name, instructor_id FROM courses WHERE id = ?",
    [courseId]
  );
  if (!course) throw new AppError(404, "courseNotFound");
  return course;
}

async function getStudentInfo(studentId: string): Promise<StudentInfoRow> {
  const student = await queryOne<StudentInfoRow>(
    "SELECT id, name FROM users WHERE id = ? AND role = 'student'",
    [studentId]
  );
  if (!student) throw new AppError(404, "studentNotFound");
  return student;
}

async function getExistingLog(
  studentId: string,
  courseId: string,
  date: string
): Promise<LogRow | undefined> {
  return queryOne<LogRow>(
    `SELECT * FROM attendance_logs WHERE student_id = ? AND course_id = ? AND date = ?`,
    [studentId, courseId, date]
  );
}

async function upsertLog(params: {
  studentId: string;
  studentName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  sessionId?: string;
  date: string;
  timestamp: string;
  status: AttendanceStatus;
  verificationMethod: VerificationMethod;
  verificationConfidence?: number;
  verificationPhoto?: string;
  preserveFaceEvidence?: boolean;
}): Promise<AttendanceLogEntry> {
  const existing = await getExistingLog(params.studentId, params.courseId, params.date);

  if (existing) {
    let method = params.verificationMethod;
    let confidence = params.verificationConfidence;
    let photo = params.verificationPhoto;

    if (
      params.preserveFaceEvidence &&
      existing.verification_method === "face" &&
      existing.verification_photo
    ) {
      method = "face";
      confidence = existing.verification_confidence ?? confidence ?? undefined;
      photo = existing.verification_photo ?? photo;
    }

    await execute(
      `UPDATE attendance_logs
       SET status = ?, time_mark = ?, verification_method = ?,
           verification_confidence = ?, verification_photo = ?, session_id = COALESCE(?, session_id)
       WHERE id = ?`,
      [
        params.status,
        params.timestamp,
        method,
        confidence ?? null,
        photo ?? null,
        params.sessionId ?? null,
        existing.id,
      ]
    );

    return mapLog({
      ...existing,
      status: params.status,
      time_mark: params.timestamp,
      verification_method: method,
      verification_confidence: confidence ?? null,
      verification_photo: photo ?? null,
      session_id: params.sessionId ?? existing.session_id,
    });
  }

  const id = generateLogId();
  await execute(
    `INSERT INTO attendance_logs
     (id, student_id, student_name, course_id, course_code, course_name, session_id, date, time_mark,
      status, verification_method, verification_confidence, verification_photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.studentId,
      params.studentName,
      params.courseId,
      params.courseCode,
      params.courseName,
      params.sessionId ?? null,
      params.date,
      params.timestamp,
      params.status,
      params.verificationMethod,
      params.verificationConfidence ?? null,
      params.verificationPhoto ?? null,
    ]
  );

  return mapLog({
    id,
    student_id: params.studentId,
    student_name: params.studentName,
    course_id: params.courseId,
    course_code: params.courseCode,
    course_name: params.courseName,
    session_id: params.sessionId ?? null,
    date: params.date,
    time_mark: params.timestamp,
    status: params.status,
    verification_method: params.verificationMethod,
    verification_confidence: params.verificationConfidence ?? null,
    verification_photo: params.verificationPhoto ?? null,
  } as LogRow);
}

export async function listLogs(filters: {
  courseId?: string;
  date?: string;
  studentId?: string;
}): Promise<AttendanceLogEntry[]> {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.courseId) {
    conditions.push("course_id = ?");
    params.push(filters.courseId);
  }
  if (filters.date) {
    conditions.push("date = ?");
    params.push(filters.date);
  }
  if (filters.studentId) {
    conditions.push("student_id = ?");
    params.push(filters.studentId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<LogRow>(
    `SELECT * FROM attendance_logs ${where} ORDER BY date DESC, time_mark DESC`,
    params
  );

  return rows.map(mapLog);
}

export async function studentCheckIn(
  student: AuthUser,
  body: CheckInRequest
): Promise<{ log: AttendanceLogEntry; photoUrl?: string }> {
  await assertApprovedEnrollment(student.id, body.courseId);
  await validateSessionForCheckIn(body.sessionId, body.courseId, body.pinCode);

  const date = todayDateString();
  const existing = await getExistingLog(student.id, body.courseId, date);
  if (existing) {
    throw new AppError(409, "alreadyCheckedIn", "alreadyCheckedIn");
  }

  const course = await getCourseInfo(body.courseId);
  const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();

  let photoUrl: string | undefined;
  try {
    photoUrl = resolvePhotoUrl(body.photoUrl, body.verificationPhoto);
  } catch {
    throw new AppError(400, "invalidPhotoUrl", "invalidPhotoUrl");
  }

  if (!photoUrl) {
    throw new AppError(400, "photoUrlRequired", "photoUrlRequired");
  }

  const log = await upsertLog({
    studentId: student.id,
    studentName: student.name,
    courseId: course.id,
    courseCode: course.code,
    courseName: course.name,
    sessionId: body.sessionId,
    date,
    timestamp: timeString(capturedAt),
    status: "present",
    verificationMethod: "face",
    verificationConfidence: 0.99,
    verificationPhoto: photoUrl,
  });

  return { log, photoUrl };
}

export async function quickMark(
  teacher: AuthUser,
  body: { courseId: string; studentId: string; status: AttendanceStatus; date?: string }
): Promise<AttendanceLogEntry> {
  const course = await getCourseInfo(body.courseId);
  if (course.instructor_id !== teacher.id) throw new AppError(403, "forbidden");

  const student = await getStudentInfo(body.studentId);
  await assertApprovedEnrollment(body.studentId, body.courseId);

  const date = body.date ?? todayDateString();
  const now = new Date();

  return upsertLog({
    studentId: student.id,
    studentName: student.name,
    courseId: course.id,
    courseCode: course.code,
    courseName: course.name,
    date,
    timestamp: timeString(now),
    status: body.status,
    verificationMethod: "manual",
    preserveFaceEvidence: true,
  });
}

export async function sessionSubmit(
  teacher: AuthUser,
  body: {
    courseId: string;
    sessionId: string;
    pinCode: string;
    records: AttendanceRecord[];
  }
): Promise<AttendanceLogEntry[]> {
  await validateSessionForTeacherSubmit(
    body.sessionId,
    body.courseId,
    body.pinCode,
    teacher
  );
  const course = await getCourseInfo(body.courseId);
  const date = todayDateString();
  const results: AttendanceLogEntry[] = [];

  for (const record of body.records) {
    if (record.status === "pending") continue;

    const student = await getStudentInfo(record.studentId);
    await assertApprovedEnrollment(record.studentId, body.courseId);

    const log = await upsertLog({
      studentId: student.id,
      studentName: student.name,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      sessionId: body.sessionId,
      date,
      timestamp: record.timestamp ?? timeString(),
      status: record.status as AttendanceStatus,
      verificationMethod: record.verificationMethod ?? "manual",
      verificationConfidence: record.verificationConfidence,
      verificationPhoto: record.verificationPhoto,
      preserveFaceEvidence: true,
    });
    results.push(log);
  }

  return results;
}

export async function patchLog(
  user: AuthUser,
  logId: string,
  status: AttendanceStatus
): Promise<AttendanceLogEntry> {
  const row = await queryOne<LogRow>("SELECT * FROM attendance_logs WHERE id = ?", [logId]);
  if (!row) throw new AppError(404, "logNotFound");

  if (user.role === "teacher") {
    const course = await getCourseInfo(row.course_id);
    if (course.instructor_id !== user.id) throw new AppError(403, "forbidden");
  }

  await execute("UPDATE attendance_logs SET status = ? WHERE id = ?", [status, logId]);
  return mapLog({ ...row, status });
}
