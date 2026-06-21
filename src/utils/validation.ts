import type { Weekday } from "../types/index.js";

const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function validateCourseInput(body: {
  code?: string;
  name?: string;
  room?: string;
  scheduleDays?: Weekday[];
  startTime?: string;
  endTime?: string;
}): string | null {
  const code = body.code?.trim();
  const name = body.name?.trim();
  const room = body.room?.trim();

  if (!code) return "courseCodeRequired";
  if (!name) return "courseNameRequired";
  if (!room) return "courseRoomRequired";
  if (!body.scheduleDays?.length) return "scheduleDaysRequired";
  if (!body.startTime || !body.endTime) return "scheduleTimeRequired";
  if (body.startTime >= body.endTime) return "invalidTimeRange";

  const invalidDay = body.scheduleDays.some((d) => !WEEKDAYS.includes(d));
  if (invalidDay) return "invalidScheduleDay";

  return null;
}

export function normalizeCourseCode(code: string): string {
  return code.trim().toUpperCase();
}
