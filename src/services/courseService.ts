import { execute, query, queryOne } from "../db/index.js";
import type { AuthUser, Course, Weekday } from "../types/index.js";
import { generateCourseId, parseScheduleDays } from "../utils/helpers.js";
import { normalizeCourseCode, validateCourseInput } from "../utils/validation.js";
import { AppError } from "../middleware/errorHandler.js";
import type { RowDataPacket } from "mysql2/promise";

interface CourseRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  instructor_id: string;
  instructor_name: string;
  room: string;
  schedule_days: string | unknown;
  start_time: string;
  end_time: string;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface IdRow extends RowDataPacket {
  id: string;
}

interface StudentRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
}

async function mapCourse(row: CourseRow): Promise<Course> {
  const countRow = await queryOne<CountRow>(
    `SELECT COUNT(*) as count FROM enrollments WHERE course_id = ? AND status = 'approved'`,
    [row.id]
  );

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    instructor: row.instructor_name,
    instructorId: row.instructor_id,
    room: row.room,
    scheduleDays: parseScheduleDays(row.schedule_days) as Weekday[],
    startTime: row.start_time,
    endTime: row.end_time,
    studentCount: Number(countRow?.count ?? 0),
  };
}

async function getCourseRow(courseId: string): Promise<CourseRow> {
  const row = await queryOne<CourseRow>("SELECT * FROM courses WHERE id = ?", [courseId]);
  if (!row) throw new AppError(404, "courseNotFound");
  return row;
}

async function assertCourseOwner(courseId: string, teacher: AuthUser): Promise<CourseRow> {
  const row = await getCourseRow(courseId);
  if (row.instructor_id !== teacher.id) {
    throw new AppError(403, "forbidden");
  }
  return row;
}

export async function listCourses(user: AuthUser): Promise<Course[]> {
  const rows =
    user.role === "teacher"
      ? await query<CourseRow>(
          "SELECT * FROM courses WHERE instructor_id = ? ORDER BY code",
          [user.id]
        )
      : await query<CourseRow>("SELECT * FROM courses ORDER BY code");

  return Promise.all(rows.map(mapCourse));
}

export async function getCourse(courseId: string): Promise<Course> {
  return mapCourse(await getCourseRow(courseId));
}

export async function createCourse(
  teacher: AuthUser,
  body: {
    code?: string;
    name?: string;
    room?: string;
    scheduleDays?: Weekday[];
    startTime?: string;
    endTime?: string;
  }
): Promise<Course> {
  const error = validateCourseInput(body);
  if (error) throw new AppError(400, error, error);

  const code = normalizeCourseCode(body.code!);
  const existingCode = await queryOne<IdRow>("SELECT id FROM courses WHERE code = ?", [code]);
  if (existingCode) throw new AppError(409, "courseCodeTaken", "courseCodeTaken");

  const allIds = await query<IdRow>("SELECT id FROM courses");
  const id = generateCourseId(allIds.map((r) => r.id));

  await execute(
    `INSERT INTO courses (id, code, name, instructor_id, instructor_name, room, schedule_days, start_time, end_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      code,
      body.name!.trim(),
      teacher.id,
      teacher.name,
      body.room!.trim(),
      JSON.stringify(body.scheduleDays),
      body.startTime!,
      body.endTime!,
    ]
  );

  return getCourse(id);
}

export async function updateCourse(
  teacher: AuthUser,
  courseId: string,
  body: {
    code?: string;
    name?: string;
    room?: string;
    scheduleDays?: Weekday[];
    startTime?: string;
    endTime?: string;
  }
): Promise<Course> {
  await assertCourseOwner(courseId, teacher);
  const error = validateCourseInput(body);
  if (error) throw new AppError(400, error, error);

  const code = normalizeCourseCode(body.code!);
  const duplicate = await queryOne<IdRow>(
    "SELECT id FROM courses WHERE code = ? AND id != ?",
    [code, courseId]
  );
  if (duplicate) throw new AppError(409, "courseCodeTaken", "courseCodeTaken");

  await execute(
    `UPDATE courses SET code = ?, name = ?, room = ?, schedule_days = ?, start_time = ?, end_time = ?
     WHERE id = ?`,
    [
      code,
      body.name!.trim(),
      body.room!.trim(),
      JSON.stringify(body.scheduleDays),
      body.startTime!,
      body.endTime!,
      courseId,
    ]
  );

  return getCourse(courseId);
}

export async function deleteCourse(teacher: AuthUser, courseId: string): Promise<void> {
  await assertCourseOwner(courseId, teacher);
  await execute("DELETE FROM courses WHERE id = ?", [courseId]);
}

export async function listCourseStudents(
  courseId: string
): Promise<{ id: string; name: string; email: string }[]> {
  await getCourseRow(courseId);
  return query<StudentRow>(
    `SELECT u.id, u.name, u.email
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.course_id = ? AND e.status = 'approved'
     ORDER BY u.name`,
    [courseId]
  );
}
