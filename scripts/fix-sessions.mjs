import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "eduattend",
});

const [result] = await pool.query(`
  UPDATE attendance_sessions s
  JOIN courses c ON c.id = s.course_id
  SET
    s.opened_at = CONCAT(s.date, ' ', c.start_time, ':00'),
    s.expires_at = CONCAT(s.date, ' ', c.end_time, ':00')
  WHERE s.status = 'open'
`);

console.log("Updated rows:", result.affectedRows);

const [sessions] = await pool.query(`
  SELECT id, course_id, date, opened_at, expires_at, status
  FROM attendance_sessions
  WHERE status = 'open'
  ORDER BY opened_at DESC
`);

console.log("Open sessions after fix:");
console.log(JSON.stringify(sessions, null, 2));

await pool.end();
