import { query, queryOne } from "../db/index.js";
import type { AuthUser, CourseTodayStats } from "../types/index.js";
import { calcAttendanceRate, parseScheduleDays, todayDateString } from "../utils/helpers.js";
import { listLogs } from "./attendanceService.js";
import type { RowDataPacket } from "mysql2/promise";

const WEEKDAY_MAP = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface CourseScheduleRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  schedule_days: string | unknown;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface CourseRateRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
}

interface StatusRow extends RowDataPacket {
  status: string;
}

function isCourseScheduledToday(scheduleDays: string[]): boolean {
  const today = WEEKDAY_MAP[new Date().getDay()];
  return scheduleDays.includes(today);
}

export async function getTeacherTodayStats(teacher: AuthUser): Promise<CourseTodayStats[]> {
  const date = todayDateString();
  const courses = await query<CourseScheduleRow>(
    "SELECT id, code, name, schedule_days FROM courses WHERE instructor_id = ?",
    [teacher.id]
  );

  const stats: CourseTodayStats[] = [];

  for (const course of courses) {
    if (!isCourseScheduledToday(parseScheduleDays(course.schedule_days))) continue;

    const enrolled = await queryOne<CountRow>(
      `SELECT COUNT(*) as count FROM enrollments WHERE course_id = ? AND status = 'approved'`,
      [course.id]
    );
    const enrolledCount = Number(enrolled?.count ?? 0);

    const logs = await listLogs({ courseId: course.id, date });
    const presentCount = logs.filter((l) => l.status === "present").length;
    const lateCount = logs.filter((l) => l.status === "late").length;
    const absentCount = logs.filter((l) => l.status === "absent").length;
    const marked = presentCount + lateCount + absentCount;
    const unmarkedCount = Math.max(0, enrolledCount - marked);

    stats.push({
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      enrolledCount,
      presentCount,
      lateCount,
      absentCount,
      unmarkedCount,
      rate: calcAttendanceRate(presentCount, lateCount, absentCount, enrolledCount),
    });
  }

  return stats;
}

export async function getStudentStats(student: AuthUser): Promise<{
  overallRate: number;
  courseRates: { courseId: string; courseCode: string; courseName: string; rate: number }[];
}> {
  const enrollments = await query<CourseRateRow>(
    `SELECT c.id, c.code, c.name FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.status = 'approved'`,
    [student.id]
  );

  const courseRates = [];

  for (const course of enrollments) {
    const logs = await query<StatusRow>(
      `SELECT status FROM attendance_logs WHERE student_id = ? AND course_id = ?`,
      [student.id, course.id]
    );

    const total = logs.length;
    if (total === 0) {
      courseRates.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        rate: 0,
      });
      continue;
    }

    const present = logs.filter((l) => l.status === "present").length;
    const late = logs.filter((l) => l.status === "late").length;
    const rate = calcAttendanceRate(present, late, 0, total);

    courseRates.push({
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      rate,
    });
  }

  const overallRate =
    courseRates.length === 0
      ? 0
      : Math.round(
          (courseRates.reduce((sum, c) => sum + c.rate, 0) / courseRates.length) * 10
        ) / 10;

  return { overallRate, courseRates };
}
