export type UserRole = "teacher" | "student";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type EnrollmentStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "late" | "absent";
export type RecordStatus = AttendanceStatus | "pending";
export type SessionStatus = "open" | "closed";
export type VerificationMethod = "pin" | "face" | "manual";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  redirectTo: "teacher_dash" | "student_dash";
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  instructor: string;
  instructorId: string;
  room: string;
  scheduleDays: Weekday[];
  startTime: string;
  endTime: string;
  studentCount: number;
}

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  status: EnrollmentStatus;
  requestedAt: string;
}

export interface AttendanceSession {
  id: string;
  courseId: string;
  date: string;
  pinCode: string;
  status: SessionStatus;
  openedAt: string;
  expiresAt: string;
}

export interface AttendanceLogEntry {
  id: string;
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
}

export interface AttendanceRecord {
  studentId: string;
  status: RecordStatus;
  timestamp?: string;
  notes?: string;
  verificationMethod?: VerificationMethod;
  verificationConfidence?: number;
  verificationPhoto?: string;
}

export interface CourseTodayStats {
  courseId: string;
  courseCode: string;
  courseName: string;
  enrolledCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  unmarkedCount: number;
  rate: number;
}

export interface StudentRosterItem {
  id: string;
  name: string;
  email: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
  role: UserRole;
}

/** SV check-in — ảnh upload Firebase, gửi URL cho BE */
export interface CheckInRequest {
  courseId: string;
  sessionId: string;
  pinCode: string;
  /** URL ảnh từ Firebase Storage */
  photoUrl?: string;
  /** Alias FE có thể gửi */
  verificationPhoto?: string;
  capturedAt?: string;
}
