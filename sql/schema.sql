-- ============================================================
-- EduAttend — MySQL schema for XAMPP
-- Import file này trong phpMyAdmin hoặc MySQL CLI
-- ============================================================

CREATE DATABASE IF NOT EXISTS eduattend
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE eduattend;

-- ------------------------------------------------------------
-- 1. users — Tài khoản giảng viên & sinh viên
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(20)  NOT NULL,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('teacher', 'student') NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. courses — Lớp học / học phần
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id              VARCHAR(20)  NOT NULL,
  code            VARCHAR(50)  NOT NULL,
  name            VARCHAR(255) NOT NULL,
  instructor_id   VARCHAR(20)  NOT NULL,
  instructor_name VARCHAR(255) NOT NULL,
  room            VARCHAR(100) NOT NULL,
  schedule_days   JSON         NOT NULL,
  start_time      VARCHAR(5)   NOT NULL COMMENT 'HH:mm',
  end_time        VARCHAR(5)   NOT NULL COMMENT 'HH:mm',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_code (code),
  KEY idx_courses_instructor (instructor_id),
  CONSTRAINT fk_courses_instructor
    FOREIGN KEY (instructor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. enrollments — Đăng ký học phần
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enrollments (
  id           VARCHAR(50)  NOT NULL,
  student_id   VARCHAR(20)  NOT NULL,
  course_id    VARCHAR(20)  NOT NULL,
  status       ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  requested_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enrollment_student_course (student_id, course_id),
  KEY idx_enrollments_student (student_id),
  KEY idx_enrollments_course (course_id),
  CONSTRAINT fk_enrollments_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_enrollments_course
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. attendance_sessions — Phiên điểm danh (PIN)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id         VARCHAR(60) NOT NULL,
  course_id  VARCHAR(20) NOT NULL,
  date       DATE        NOT NULL,
  pin_code   VARCHAR(6)  NOT NULL,
  status     ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  opened_at  DATETIME    NOT NULL,
  expires_at DATETIME    NOT NULL,
  PRIMARY KEY (id),
  KEY idx_sessions_course_date (course_id, date),
  CONSTRAINT fk_sessions_course
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. attendance_logs — Nhật ký điểm danh
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance_logs (
  id                      VARCHAR(50)  NOT NULL,
  student_id              VARCHAR(20)  NOT NULL,
  student_name            VARCHAR(255) NOT NULL,
  course_id               VARCHAR(20)  NOT NULL,
  course_code             VARCHAR(50)  NOT NULL,
  course_name             VARCHAR(255) NOT NULL,
  session_id              VARCHAR(60)  NULL,
  date                    DATE         NOT NULL,
  time_mark               VARCHAR(5)   NOT NULL COMMENT 'HH:mm',
  status                  ENUM('present', 'late', 'absent') NOT NULL,
  verification_method     ENUM('pin', 'face', 'manual') NOT NULL,
  verification_confidence DECIMAL(4,3) NULL,
  verification_photo      VARCHAR(500) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_log_student_course_date (student_id, course_id, date),
  KEY idx_logs_course_date (course_id, date),
  KEY idx_logs_student (student_id),
  CONSTRAINT fk_logs_student
    FOREIGN KEY (student_id) REFERENCES users(id),
  CONSTRAINT fk_logs_course
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_logs_session
    FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Dữ liệu mẫu (tùy chọn)
-- Tạo tài khoản qua API POST /api/v1/auth/register thay vì insert password thủ công.
-- ============================================================
