/**
 * EduAttend — Types đồng bộ với Backend API v1
 * Copy file này sang FE: src/types/api.ts (hoặc merge vào types.ts)
 *
 * Base URL: /api/v1  (proxy Vite → http://localhost:8080)
 */

// ─── Enums ───────────────────────────────────────────────────────────────────

export type UserRole = "teacher" | "student";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type EnrollmentStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "late" | "absent";
export type RecordStatus = AttendanceStatus | "pending";
export type SessionStatus = "open" | "closed";
export type VerificationMethod = "pin" | "face" | "manual";

// ─── Auth ────────────────────────────────────────────────────────────────────

/** User trả về sau login/register/me — KHÔNG có password */
export interface AuthUser {
  id: string; // "TCH001" | "STU001"
  name: string; // Tiếng Việt OK, VD: "Nguyễn Văn An"
  email: string; // lowercase, bắt buộc @hust.edu.vn
  role: UserRole;
  /** BE derive từ role — FE dùng để navigate sau login */
  redirectTo: "teacher_dash" | "student_dash";
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  confirmPassword: string; // BE validate nếu gửi
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
  role: UserRole; // Phải khớp role đã chọn ở portal
}

export interface AuthResponse {
  user: AuthUser;
  token: string; // JWT, lưu localStorage/sessionStorage
}

// ─── Course ──────────────────────────────────────────────────────────────────

export interface Course {
  id: string; // "CR001"
  code: string; // UPPERCASE, VD: "IT3080"
  name: string; // VD: "Lập trình hướng đối tượng"
  instructor: string; // Tên GV hiển thị (denormalized)
  instructorId: string; // FK users — BE thêm so với FE local cũ
  room: string;
  scheduleDays: Weekday[];
  startTime: string; // "HH:mm" 24h
  endTime: string; // "HH:mm", phải > startTime
  studentCount: number; // DERIVED — số enrollment approved, không gửi khi tạo
}

export interface CourseInput {
  code: string;
  name: string;
  room: string;
  scheduleDays: Weekday[];
  startTime: string;
  endTime: string;
}

// ─── Enrollment ──────────────────────────────────────────────────────────────

export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  status: EnrollmentStatus;
  requestedAt: string; // ISO hoặc "YYYY-MM-DD HH:mm:ss" từ MySQL
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface AttendanceSession {
  id: string; // "SES-CR001-1718870400000"
  courseId: string;
  date: string; // "YYYY-MM-DD" (sv-SE locale)
  pinCode: string; // 6 chữ số — CHỈ có giá trị với teacher; SV nhận ""
  status: SessionStatus;
  openedAt: string; // ISO 8601
  expiresAt: string; // ISO 8601, openedAt + 30 phút
}

// ─── Attendance Log ──────────────────────────────────────────────────────────

export interface AttendanceLogEntry {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string; // BE thêm — FE local cũ không có
  courseCode: string;
  courseName: string;
  sessionId?: string;
  date: string; // "YYYY-MM-DD"
  timestamp: string; // "HH:mm" local
  status: AttendanceStatus;
  verificationMethod: VerificationMethod;
  verificationConfidence?: number; // 0–1, face ~0.99
  verificationPhoto?: string; // URL Firebase Storage (https://...)
}

/** Draft khi GV submit phiên — status "pending" sẽ bị BE bỏ qua */
export interface AttendanceRecord {
  studentId: string;
  status: RecordStatus;
  timestamp?: string;
  notes?: string;
  verificationMethod?: VerificationMethod;
  verificationConfidence?: number;
  verificationPhoto?: string;
}

// ─── Roster (thay students[] rỗng ở FE local) ───────────────────────────────

export interface StudentRosterItem {
  id: string;
  name: string;
  email: string;
  // FE tự derive: avatarGradient, initials từ name
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface CourseTodayStats {
  courseId: string;
  courseCode: string;
  courseName: string;
  enrolledCount: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  unmarkedCount: number;
  rate: number; // 0–100, late tính 0.5
}

export interface StudentStatsResponse {
  overallRate: number;
  courseRates: {
    courseId: string;
    courseCode: string;
    courseName: string;
    rate: number;
  }[];
}

// ─── API Error ───────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  message: string;
  code?: string; // Map sang TRANSLATIONS register errors
}

// ─── Request bodies ──────────────────────────────────────────────────────────

export interface CheckInRequest {
  courseId: string;
  sessionId: string;
  pinCode: string;
  /** URL ảnh từ Firebase Storage (bắt buộc) */
  photoUrl?: string;
  verificationPhoto?: string;
  capturedAt?: string;
}

export interface QuickMarkRequest {
  courseId: string;
  studentId: string;
  status: AttendanceStatus;
  date?: string; // "YYYY-MM-DD", mặc định hôm nay
}

export interface SessionSubmitRequest {
  courseId: string;
  sessionId: string;
  pinCode: string;
  records: AttendanceRecord[];
}

export interface PatchLogRequest {
  status: AttendanceStatus;
}
