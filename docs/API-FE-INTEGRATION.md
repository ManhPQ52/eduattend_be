# EduAttend Backend — Tài liệu tích hợp API cho Frontend

> **Phiên bản:** API v1 · MySQL  
> **Base URL:** `http://localhost:8080/api/v1`  
> **FE dev proxy:** `vite.config.ts` → `'/api/v1': 'http://localhost:8080'`  
> **Types TS:** copy từ [`api-types.fe.ts`](./api-types.fe.ts)

---

## Mục lục

1. [Quy ước chung](#1-quy-ước-chung)
2. [Model dữ liệu & từng trường](#2-model-dữ-liệu--từng-trường)
3. [Auth](#3-auth)
4. [Courses](#4-courses)
5. [Enrollments](#5-enrollments)
6. [Sessions](#6-sessions)
7. [Attendance](#7-attendance)
8. [Stats](#8-stats)
9. [Ánh xạ FE screen → API](#9-ánh-xạ-fe-screen--api)
10. [Thay thế localData.ts](#10-thay-thế-localdatats)
11. [Mã lỗi đầy đủ](#11-mã-lỗi-đầy-đủ)

---

## 1. Quy ước chung

### 1.1. Request

| Quy tắc | Chi tiết |
|---------|----------|
| Content-Type | `application/json` (trừ upload ảnh multipart) |
| Auth | `Authorization: Bearer <token>` — mọi route trừ register, login, health |
| Ngôn ngữ nội dung | Tiếng Việt OK cho `name`, `course.name`, `room` — DB `utf8mb4` |
| Mã kỹ thuật | `role`, `status`, `weekday` luôn tiếng Anh (enum) |

### 1.2. Response envelope

Hầu hết API bọc dữ liệu trong key rõ ràng:

```json
{ "courses": [...] }
{ "course": { ... } }
{ "user": { ... }, "token": "..." }
{ "ok": true }
```

### 1.3. Lỗi

```json
{
  "message": "emailInvalid",
  "code": "emailInvalid"
}
```

- `message` và `code` thường giống nhau (trừ một số lỗi chỉ có `message`)
- FE map `code` → `TRANSLATIONS.registerError*` / `loginError`

### 1.4. Định dạng ngày giờ (quan trọng — giữ giống FE local)

| Field | Format | Cách tạo FE |
|-------|--------|-------------|
| `date` | `YYYY-MM-DD` | `new Date().toLocaleDateString("sv-SE")` |
| `timestamp` | `HH:mm` (24h) | `toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })` |
| `openedAt`, `expiresAt`, `requestedAt` | ISO 8601 hoặc MySQL datetime string | `new Date().toISOString()` hoặc parse từ BE |
| `startTime`, `endTime` | `"09:00"`, `"10:30"` | Input type time hoặc string |

### 1.5. ID do BE sinh

| Entity | Pattern | Ví dụ |
|--------|---------|-------|
| Teacher | `TCH` + 3 số | `TCH001` |
| Student | `STU` + 3 số | `STU001` |
| Course | `CR` + 3 số | `CR001` |
| Enrollment | `ENR-{timestamp}-{random}` | `ENR-1718870400000-123` |
| Session | `SES-{courseId}-{timestamp}` | `SES-CR001-1718870400000` |
| Log | `LOG-{timestamp}-{random}` | `LOG-1718870500000-1` |

**FE không tự sinh ID** — luôn dùng ID từ response.

---

## 2. Model dữ liệu & từng trường

### 2.1. `AuthUser`

| Trường | Kiểu | Nguồn | FE dùng thế nào |
|--------|------|-------|-----------------|
| `id` | string | BE | Key chính thay `userId` trong `appSession` |
| `name` | string | User nhập | Hiển thị dashboard, greeting |
| `email` | string | User nhập | Login, profile — luôn lowercase |
| `role` | `teacher` \| `student` | User chọn portal | Phân quyền UI |
| `redirectTo` | `teacher_dash` \| `student_dash` | BE derive | `navigate()` sau login — **không hardcode** |

**Không có:** `password` — BE không bao giờ trả password.

---

### 2.2. `Course`

| Trường | Kiểu | Gửi lên BE? | Ghi chú |
|--------|------|-------------|---------|
| `id` | string | ❌ | Response only |
| `code` | string | ✅ POST/PATCH | BE trim + UPPERCASE (`it3080` → `IT3080`) |
| `name` | string | ✅ | Tiếng Việt OK |
| `instructor` | string | ❌ | BE set = `teacher.name` lúc tạo |
| `instructorId` | string | ❌ | **Mới so với FE local** — dùng nếu cần filter sâu |
| `room` | string | ✅ | VD: `"Phòng D3-201"` |
| `scheduleDays` | `Weekday[]` | ✅ | Min 1 phần tử |
| `startTime` | string | ✅ | `"HH:mm"`, phải `< endTime` |
| `endTime` | string | ✅ | |
| `studentCount` | number | ❌ | Đếm enrollment `approved` — refresh sau duyệt SV |

**FE local thiếu `instructorId`** — thêm vào `types.ts` khi tích hợp (optional nếu chỉ dùng `instructor`).

**Quyền:**
- GV `GET /courses` → chỉ lớp mình (`instructorId === token user`)
- SV `GET /courses` → catalog tất cả lớp

---

### 2.3. `Enrollment`

| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | string | Dùng cho approve/reject URL |
| `studentId` | string | |
| `courseId` | string | Join với `Course.id` |
| `status` | enum | Xem bảng luồng bên dưới |
| `requestedAt` | string | Thời điểm gửi / gửi lại |

**Luồng `status` (FE phải cover):**

```
(chưa có) ──POST /enrollments──▶ pending
pending ──GV approve──▶ approved   ← chỉ approved mới check-in
pending ──GV reject──▶ rejected
rejected ──POST lại──▶ pending (BE update record cũ)
approved ──POST lại──▶ 409 enrollmentAlreadyApproved
pending ──POST lại──▶ 409 enrollmentAlreadyPending
```

**FE join data:** `enrollment.courseId` + `courses[]` để hiển thị tên lớp trên dashboard SV.

---

### 2.4. `AttendanceSession`

| Trường | Kiểu | Ai thấy | Ghi chú |
|--------|------|---------|---------|
| `id` | string | All | Gửi trong check-in, session-submit |
| `courseId` | string | All | |
| `date` | string | All | Hôm nay theo server locale |
| `pinCode` | string | **Teacher only** | SV: API trả `""` — SV nhập PIN thủ công, BE verify ở check-in |
| `status` | `open` \| `closed` | All | |
| `openedAt` | ISO | All | |
| `expiresAt` | ISO | All | TTL 30 phút |

**FE helper (giữ từ `types.ts`):**

```typescript
function isSessionActive(session: AttendanceSession): boolean {
  return session.status === "open" && new Date(session.expiresAt) > new Date();
}
```

**Thay `createAttendanceSession()` local:** gọi `POST /courses/:courseId/sessions`.

---

### 2.5. `AttendanceLogEntry`

| Trường | Kiểu | Ghi chú |
|--------|------|---------|
| `id` | string | PATCH override |
| `studentId`, `studentName` | string | Denormalized — hiển thị trực tiếp |
| `courseId` | string | **BE thêm** — FE local không có |
| `courseCode`, `courseName` | string | Denormalized |
| `sessionId` | string? | Có khi check-in / session-submit |
| `date` | `YYYY-MM-DD` | Unique key cùng studentId + courseId |
| `timestamp` | `HH:mm` | Giờ điểm danh |
| `status` | `present` \| `late` \| `absent` | |
| `verificationMethod` | `pin` \| `face` \| `manual` | |
| `verificationConfidence` | number? | Face ~0.99 |
| `verificationPhoto` | string? | URL tương đối — ghép `origin + photo` hoặc proxy |

**Unique:** 1 SV / 1 lớp / 1 ngày — check-in trùng → `409 alreadyCheckedIn`.

**Ảnh:** `verificationPhoto` = `/api/v1/attendance/photos/xxx.jpg`  
→ Hiển thị: `` `${API_ORIGIN}${log.verificationPhoto}` `` hoặc qua Vite proxy cùng origin.

---

### 2.6. `AttendanceRecord` (draft GV)

| Trường | Bắt buộc submit | Ghi chú |
|--------|-----------------|---------|
| `studentId` | ✅ | |
| `status` | ✅ | `pending` → **BE bỏ qua**, không ghi DB |
| `timestamp` | ❌ | Mặc định giờ hiện tại |
| `verificationMethod` | ❌ | Mặc định `manual` |
| `verificationPhoto` | ❌ | Nếu SV đã face check-in, BE **giữ** photo khi GV submit manual |

---

### 2.7. `StudentRosterItem` (thay `students[]` rỗng)

| Trường | Ghi chú |
|--------|---------|
| `id`, `name`, `email` | Từ `GET /courses/:id/students` |
| `avatarGradient`, `initials` | **FE tự derive** — BE không trả |

```typescript
// Map roster → Student UI type
const students: Student[] = roster.map(s => ({
  ...s,
  initials: getInitials(s.name),
  avatarGradient: pickGradient(s.id), // logic UI FE
}));
```

---

### 2.8. `CourseTodayStats`

| Trường | Công thức BE (giống FE) |
|--------|-------------------------|
| `rate` | `(present + late × 0.5) / enrolled × 100` |
| `unmarkedCount` | `enrolled - (present + late + absent)` |

Chỉ gồm lớp có `scheduleDays` chứa **thứ hôm nay**.

---

## 3. Auth

### `POST /auth/register`

| | |
|---|---|
| **Auth** | Không |
| **FE screen** | `RegisterScreen` |
| **Thay thế** | `createStoredUser()` + `PUT /api/local/store` |

**Body:**

```typescript
{
  name: string;           // required, trim
  email: string;          // required, @hust.edu.vn
  password: string;       // min 6
  confirmPassword: string;
  role: "teacher" | "student";
}
```

**Response 201:** `AuthResponse` — auto-login, lưu `token`, navigate `user.redirectTo`.

**Lỗi 400 `code`:** `nameRequired` | `emailInvalid` | `passwordTooShort` | `passwordMismatch` | `emailTaken` | `roleRequired`

---

### `POST /auth/login`

| | |
|---|---|
| **Auth** | Không |
| **FE screen** | `LoginScreen` |
| **Thay thế** | `authenticateUser()` |

**Body:**

```typescript
{
  email: string;
  password: string;
  role: "teacher" | "student"; // Phải khớp portal đã chọn
}
```

**Response 200:** `AuthResponse`

**Lỗi 401:** `{ "message": "loginError", "code": "loginError" }`

---

### `GET /auth/me`

| | |
|---|---|
| **Auth** | ✅ |
| **FE screen** | Khôi phục session sau F5 |
| **Thay thế** | `resolveAuthUser(userId, users)` |

**Response 200:**

```json
{ "user": { /* AuthUser */ } }
```

**Flow F5:**

```
1. Đọc token từ storage
2. GET /auth/me
3. Nếu 401 → clear token → login
4. Nếu OK → set user state, restore screen từ client state (language, selectedCourseId)
```

---

### `POST /auth/logout`

| | |
|---|---|
| **Auth** | ✅ |
| **FE** | Xóa token client-side; BE stateless JWT |

**Response:** `{ "ok": true }`

---

## 4. Courses

Tất cả routes dưới đây **cần token**.

### `GET /courses`

| Role | Kết quả |
|------|---------|
| teacher | Lớp của GV đang login |
| student | Catalog tất cả lớp |

**Response:** `{ "courses": Course[] }`

**FE screens:** `TeacherDashboard` (manage), `StudentDashboard` (browse catalog)

---

### `GET /courses/:id`

**Response:** `{ "course": Course }`

---

### `POST /courses` — teacher only

**Body:** `CourseInput` (không gửi `id`, `instructor`, `studentCount`)

**Response 201:** `{ "course": Course }`

**Lỗi:** `400` validation codes | `409 courseCodeTaken`

---

### `PATCH /courses/:id` — teacher only, owner

**Body:** `CourseInput` (full replace các field editable)

**Response:** `{ "course": Course }`

---

### `DELETE /courses/:id` — teacher only, owner

Cascade MySQL: enrollments, sessions, logs liên quan.

**Response:** `{ "ok": true }`

**FE:** Sau delete, remove khỏi local state — không cần cascade thủ công.

---

### `GET /courses/:id/students` — teacher only

**Response:**

```json
{
  "students": [
    { "id": "STU001", "name": "Nguyễn Văn An", "email": "nguyenvanan@hust.edu.vn" }
  ]
}
```

**FE screens:** `AttendanceMarking` — load roster thay `students[]` rỗng.

**Kết hợp logs hôm nay:**

```
1. GET /courses/:id/students        → danh sách SV
2. GET /attendance/logs?courseId=:id&date=today → pre-fill P/L/A
3. Merge → initialActiveRecords (logic giữ nguyên attendance.ts)
```

---

## 5. Enrollments

### `GET /enrollments?studentId=&courseId=&status=`

Filter tùy chọn — ít dùng trực tiếp trên UI.

**Response:** `{ "enrollments": Enrollment[] }`

---

### `GET /enrollments/me` — student

**Response:** `{ "enrollments": Enrollment[] }`

**FE:** `StudentDashboard` — tab "Học phần đã đăng ký" = filter `status === "approved"`.

---

### `GET /enrollments/pending` — teacher

**Response:** `{ "enrollments": Enrollment[] }`

**FE:** `TeacherDashboard` — join `courseId` với courses để hiển thị tên lớp + tên SV (cần thêm lookup user hoặc mở rộng BE sau).

> **Gap hiện tại:** Pending enrollment chỉ có `studentId`, không có `studentName`.  
> **FE workaround:** Cache users từ roster sau khi approve, hoặc yêu cầu BE bổ sung `studentName` sau.

---

### `POST /enrollments` — student

**Body:**

```json
{ "courseId": "CR001" }
```

**Response 201:** `{ "enrollment": Enrollment }`

---

### `PATCH /enrollments/:id/approve` — teacher

**Body:** không

**Response:** `{ "enrollment": Enrollment }` với `status: "approved"`

---

### `PATCH /enrollments/:id/reject` — teacher

**Response:** `{ "enrollment": Enrollment }` với `status: "rejected"`

---

## 6. Sessions

### `POST /courses/:courseId/sessions` — teacher

Mở phiên hôm nay. Nếu đã có phiên `open` còn hạn → trả phiên cũ.

**Body:** không

**Response 201:**

```json
{
  "session": {
    "id": "SES-CR001-...",
    "pinCode": "492083",
    ...
  }
}
```

**FE `AttendanceMarking` on mount:**

```typescript
const { session } = await api.post(`/courses/${courseId}/sessions`);
setActiveSession(session);
setPinDisplay(session.pinCode);
```

---

### `GET /sessions/active?courseId=CR001`

| Role | `pinCode` |
|------|-----------|
| teacher | Có (6 số) |
| student | `""` |

**Response:** `{ "session": AttendanceSession | null }`

---

### `GET /sessions/active/me` — student

Phiên mở của các lớp đã `approved`.

**Response:** `{ "sessions": AttendanceSession[] }`

**FE `StudentDashboard`:** Hiển thị nút "Bắt đầu điểm danh" nếu `sessions.length > 0` và `isSessionActive(s)`.

---

### `POST /sessions/:id/regenerate-pin` — teacher

**Response:** `{ "session": AttendanceSession }` — PIN mới + `expiresAt` +30 phút.

---

### `PATCH /sessions/:id/close` — teacher

**Response:** `{ "session": AttendanceSession }` — `status: "closed"`.

---

## 7. Attendance

### `GET /attendance/logs?courseId=&date=&studentId=`

| Role | `studentId` filter |
|------|-------------------|
| student | BE **force** = user.id (bỏ qua query) |
| teacher | Optional query |

**Response:** `{ "logs": AttendanceLogEntry[] }`

---

### `POST /attendance/check-in` — student

**Thay thế:** `POST /api/local/photo` + ghi log local.

**Điều kiện BE validate:**
1. Enrollment `approved`
2. Session `open`, chưa hết hạn
3. `pinCode` khớp
4. Chưa có log hôm nay

**Body:**

```typescript
{
  courseId: string;
  sessionId: string;
  pinCode: string;        // SV nhập ở PinCheckIn
  photoBase64?: string;   // FaceCheckIn — BE lưu ảnh + tạo log atomic
  capturedAt?: string;
}
```

**Response 201:**

```json
{
  "log": { /* AttendanceLogEntry */ },
  "photoUrl": "/api/v1/attendance/photos/..."
}
```

**FE flow `StudentCheckIn`:**

```
PinCheckIn: user nhập PIN (client validate UX only)
FaceCheckIn: capture base64 → POST /attendance/check-in (1 request)
Success → navigate student_dash
```

**Lỗi:** `400 invalidPin|sessionExpired|sessionClosed` | `403 notEnrolled` | `409 alreadyCheckedIn`

---

### `POST /attendance/quick-mark` — teacher

**FE:** `TeacherDashboard` quick action.

**Body:**

```json
{
  "courseId": "CR001",
  "studentId": "STU001",
  "status": "present",
  "date": "2026-06-20"
}
```

**Response 201:** `{ "log": AttendanceLogEntry }`

Upsert theo `(studentId, courseId, date)` — gọi lại sẽ update.

---

### `POST /attendance/session-submit` — teacher

**FE:** `AttendanceMarking` nút Submit.

**Body:**

```json
{
  "courseId": "CR001",
  "sessionId": "SES-CR001-...",
  "pinCode": "492083",
  "records": [
    { "studentId": "STU001", "status": "present", "verificationMethod": "manual" },
    { "studentId": "STU002", "status": "pending" },
    { "studentId": "STU003", "status": "absent", "verificationMethod": "manual" }
  ]
}
```

- `pinCode` = PIN phiên hiện tại (BE verify)
- `status: "pending"` → skip
- SV đã face check-in → BE giữ `verificationPhoto` + `face` method

**Response:** `{ "logs": AttendanceLogEntry[] }`

---

### `PATCH /attendance/logs/:id` — teacher

**FE:** `AttendanceLog` admin (khi gắn vào App).

**Body:** `{ "status": "late" }`

**Response:** `{ "log": AttendanceLogEntry }`

---

### `POST /attendance/photos`

**Cách 1 — JSON (tương thích plugin cũ):**

```json
{
  "studentId": "STU001",
  "studentName": "Nguyễn Văn An",
  "imageData": "data:image/jpeg;base64,..."
}
```

**Cách 2 — multipart:** field `file` (+ optional `studentId`)

**Response 201:** `PhotoUploadResponse`

> Khuyến nghị: dùng `POST /attendance/check-in` gộp ảnh + log — không cần gọi photos riêng.

---

### `GET /attendance/photos/:filename`

Trả file ảnh (không JSON). Dùng làm `src` thẻ `<img>`.

---

### `DELETE /attendance/photos/:filename` — teacher

**Response:** `{ "ok": true }`

---

## 8. Stats

### `GET /stats/teacher/today` — teacher

**Response:** `{ "stats": CourseTodayStats[] }`

**FE:** Thay tính toán client-side trên `TeacherDashboard` (optional — vẫn có thể tự tính từ logs).

---

### `GET /stats/student/me` — student

**Response:**

```json
{
  "overallRate": 85.5,
  "courseRates": [
    { "courseId": "CR001", "courseCode": "IT3080", "courseName": "...", "rate": 90 }
  ]
}
```

**FE:** `StudentDashboard` overview score.

---

## 9. Ánh xạ FE screen → API

| Screen | APIs cần gọi | State thay thế |
|--------|----------------|----------------|
| `LoginScreen` | `POST /auth/login` | `users[]` |
| `RegisterScreen` | `POST /auth/register` | `users[]` |
| `TeacherDashboard` | `GET /auth/me`, `GET /courses`, `GET /enrollments/pending`, `GET /stats/teacher/today`, `GET /attendance/logs?date=today` | `courses`, `enrollments`, `logs` |
| `AttendanceMarking` | `POST /courses/:id/sessions`, `GET /courses/:id/students`, `GET /attendance/logs?courseId&date=today`, `POST /sessions/:id/regenerate-pin`, `POST /attendance/session-submit` | `sessions`, `students`, `logs` |
| `StudentDashboard` | `GET /courses`, `GET /enrollments/me`, `GET /sessions/active/me`, `GET /attendance/logs`, `GET /stats/student/me` | `courses`, `enrollments`, `sessions`, `logs` |
| `StudentCheckIn` | `GET /sessions/active?courseId`, `POST /attendance/check-in` | local PIN verify + photo |
| F5 restore | `GET /auth/me` | `appSession.userId` |

---

## 10. Thay thế localData.ts

### Trước (monolithic)

```
GET  /api/local/store  → load all
PUT  /api/local/store  → save all
POST /api/local/photo
```

### Sau (REST)

| Local operation | API |
|-----------------|-----|
| Load users | Không load — `GET /auth/me` |
| Register | `POST /auth/register` |
| Login | `POST /auth/login` |
| Load courses | `GET /courses` |
| Save course | `POST` hoặc `PATCH /courses/:id` |
| Delete course | `DELETE /courses/:id` |
| Load enrollments | `GET /enrollments/me` hoặc `/pending` |
| Request enroll | `POST /enrollments` |
| Approve/reject | `PATCH /enrollments/:id/approve|reject` |
| Open session | `POST /courses/:id/sessions` |
| Load session PIN | `GET /sessions/active?courseId=` |
| Load students | `GET /courses/:id/students` |
| Load logs | `GET /attendance/logs?...` |
| Check-in | `POST /attendance/check-in` |
| Quick mark | `POST /attendance/quick-mark` |
| Submit session | `POST /attendance/session-submit` |
| Upload photo | Gộp trong check-in hoặc `POST /attendance/photos` |

### Skeleton `apiClient.ts` FE

```typescript
const BASE = "/api/v1";

function getToken(): string | null {
  return localStorage.getItem("eduattend_token");
}

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw { status: res.status, ...data } as ApiErrorBody & { status: number };
  }
  return data as T;
}

// Ví dụ
export const authApi = {
  login: (body: LoginRequest) =>
    api<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => api<{ user: AuthUser }>("/auth/me"),
};

export const courseApi = {
  list: () => api<{ courses: Course[] }>("/courses"),
  create: (body: CourseInput) =>
    api<{ course: Course }>("/courses", { method: "POST", body: JSON.stringify(body) }),
  students: (courseId: string) =>
    api<{ students: StudentRosterItem[] }>(`/courses/${courseId}/students`),
};
```

### Cập nhật `types.ts` FE (bắt buộc)

```typescript
// Thêm vào Course
instructorId?: string;

// Thêm vào AttendanceLogEntry
courseId?: string;
sessionId?: string;
```

---

## 11. Mã lỗi đầy đủ

| HTTP | code / message | FE xử lý |
|------|----------------|----------|
| 400 | `nameRequired` | registerErrorName |
| 400 | `emailInvalid` | registerErrorEmail |
| 400 | `passwordTooShort` | registerErrorPassword |
| 400 | `passwordMismatch` | registerErrorConfirm |
| 400 | `roleRequired` | registerErrorGeneric |
| 400 | `courseCodeRequired` | form validation |
| 400 | `courseNameRequired` | form validation |
| 400 | `invalidTimeRange` | form validation |
| 400 | `invalidPin` | pinResultError |
| 400 | `sessionExpired` | pinSessionExpired |
| 400 | `sessionClosed` | pinSessionClosed |
| 400 | `sessionCourseMismatch` | generic error |
| 400 | `courseIdRequired` | — |
| 400 | `fileRequired` | faceSaveError |
| 400 | `invalidImageData` | faceCaptureError |
| 401 | `loginError` | loginError |
| 401 | `unauthorized` | redirect login |
| 403 | `forbidden` | toast permission |
| 403 | `notEnrolled` | enrollment message |
| 404 | `courseNotFound` | — |
| 404 | `enrollmentNotFound` | — |
| 404 | `sessionNotFound` | — |
| 404 | `logNotFound` | — |
| 404 | `photoNotFound` | — |
| 409 | `emailTaken` | registerErrorTaken |
| 409 | `courseCodeTaken` | toast |
| 409 | `enrollmentAlreadyApproved` | enrollmentAlreadyApproved |
| 409 | `enrollmentAlreadyPending` | enrollmentAlreadyPending |
| 409 | `alreadyCheckedIn` | alreadyCheckedIn |
| 500 | `internalServerError` | generic |

---

## Phụ lục: Checklist tích hợp FE

- [ ] Proxy Vite `/api/v1` → `:8080`
- [ ] Copy `api-types.fe.ts` → FE types
- [ ] Tạo `apiClient.ts` + lưu JWT
- [ ] `GET /auth/me` khi app mount (F5)
- [ ] Thay mọi `localData` mutation bằng API tương ứng
- [ ] `AttendanceMarking`: load roster từ `/courses/:id/students`
- [ ] Không dựa `pinCode` từ API cho SV — chỉ nhập tay + gửi check-in
- [ ] `verificationPhoto` URL — prefix origin khi render `<img>`
- [ ] Sau approve enrollment — refresh `course.studentCount` (re-fetch courses)

---

*Tài liệu đồng bộ với codebase `eduattend_be` · cập nhật khi có thay đổi API.*
