-- Sửa phiên đang open: opened_at/expires_at theo lịch học phần (không còn +30 phút)
-- Chạy trong phpMyAdmin sau khi deploy fix session window

USE eduattend;

UPDATE attendance_sessions s
JOIN courses c ON c.id = s.course_id
SET
  s.opened_at = CONCAT(s.date, ' ', c.start_time, ':00'),
  s.expires_at = CONCAT(s.date, ' ', c.end_time, ':00')
WHERE s.status = 'open';
