import { execute, query, queryOne } from "../db/index.js";
import type { AuthUser, Enrollment, EnrollmentStatus } from "../types/index.js";
import { generateEnrollmentId } from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { getCourse } from "./courseService.js";
import type { RowDataPacket } from "mysql2/promise";

interface EnrollmentRow extends RowDataPacket {
  id: string;
  student_id: string;
  course_id: string;
  status: EnrollmentStatus;
  requested_at: string;
}

interface InstructorRow extends RowDataPacket {
  instructor_id: string;
}

interface StatusRow extends RowDataPacket {
  status: string;
}

function mapEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    studentId: row.student_id,
    courseId: row.course_id,
    status: row.status,
    requestedAt: row.requested_at,
  };
}

export async function listEnrollments(filters: {
  studentId?: string;
  courseId?: string;
  status?: EnrollmentStatus;
}): Promise<Enrollment[]> {
  const conditions: string[] = [];
  const params: (string | EnrollmentStatus)[] = [];

  if (filters.studentId) {
    conditions.push("student_id = ?");
    params.push(filters.studentId);
  }
  if (filters.courseId) {
    conditions.push("course_id = ?");
    params.push(filters.courseId);
  }
  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<EnrollmentRow>(
    `SELECT * FROM enrollments ${where} ORDER BY requested_at DESC`,
    params
  );

  return rows.map(mapEnrollment);
}

export async function listMyEnrollments(student: AuthUser): Promise<Enrollment[]> {
  return listEnrollments({ studentId: student.id });
}

export async function listPendingForTeacher(teacher: AuthUser): Promise<Enrollment[]> {
  const rows = await query<EnrollmentRow>(
    `SELECT e.* FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE c.instructor_id = ? AND e.status = 'pending'
     ORDER BY e.requested_at ASC`,
    [teacher.id]
  );

  return rows.map(mapEnrollment);
}

export async function requestEnrollment(
  student: AuthUser,
  courseId: string
): Promise<Enrollment> {
  await getCourse(courseId);

  const existing = await queryOne<EnrollmentRow>(
    "SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?",
    [student.id, courseId]
  );

  if (existing) {
    if (existing.status === "approved") {
      throw new AppError(409, "enrollmentAlreadyApproved", "enrollmentAlreadyApproved");
    }
    if (existing.status === "pending") {
      throw new AppError(409, "enrollmentAlreadyPending", "enrollmentAlreadyPending");
    }
    if (existing.status === "rejected") {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      await execute(
        "UPDATE enrollments SET status = 'pending', requested_at = ? WHERE id = ?",
        [now, existing.id]
      );
      return mapEnrollment({ ...existing, status: "pending", requested_at: now });
    }
  }

  const id = generateEnrollmentId();
  const requestedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
  await execute(
    `INSERT INTO enrollments (id, student_id, course_id, status, requested_at) VALUES (?, ?, ?, 'pending', ?)`,
    [id, student.id, courseId, requestedAt]
  );

  return { id, studentId: student.id, courseId, status: "pending", requestedAt };
}

async function assertTeacherOwnsEnrollment(
  enrollmentId: string,
  teacher: AuthUser
): Promise<EnrollmentRow> {
  const row = await queryOne<EnrollmentRow>(
    "SELECT * FROM enrollments WHERE id = ?",
    [enrollmentId]
  );
  if (!row) throw new AppError(404, "enrollmentNotFound");

  const course = await queryOne<InstructorRow>(
    "SELECT instructor_id FROM courses WHERE id = ?",
    [row.course_id]
  );
  if (!course || course.instructor_id !== teacher.id) {
    throw new AppError(403, "forbidden");
  }
  return row;
}

export async function approveEnrollment(
  teacher: AuthUser,
  enrollmentId: string
): Promise<Enrollment> {
  const row = await assertTeacherOwnsEnrollment(enrollmentId, teacher);
  await execute("UPDATE enrollments SET status = 'approved' WHERE id = ?", [enrollmentId]);
  return mapEnrollment({ ...row, status: "approved" });
}

export async function rejectEnrollment(
  teacher: AuthUser,
  enrollmentId: string
): Promise<Enrollment> {
  const row = await assertTeacherOwnsEnrollment(enrollmentId, teacher);
  await execute("UPDATE enrollments SET status = 'rejected' WHERE id = ?", [enrollmentId]);
  return mapEnrollment({ ...row, status: "rejected" });
}

export async function assertApprovedEnrollment(
  studentId: string,
  courseId: string
): Promise<void> {
  const row = await queryOne<StatusRow>(
    `SELECT status FROM enrollments WHERE student_id = ? AND course_id = ? AND status = 'approved'`,
    [studentId, courseId]
  );
  if (!row) throw new AppError(403, "notEnrolled");
}
