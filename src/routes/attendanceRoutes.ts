import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  listLogs,
  patchLog,
  quickMark,
  sessionSubmit,
  studentCheckIn,
} from "../services/attendanceService.js";
import type { AttendanceStatus, CheckInRequest } from "../types/index.js";
import { paramAsString } from "../utils/params.js";

const router = Router();

router.use(authenticate);

router.get(
  "/logs",
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const logs = await listLogs({
      courseId: req.query.courseId as string | undefined,
      date: req.query.date as string | undefined,
      studentId:
        user.role === "student"
          ? user.id
          : (req.query.studentId as string | undefined),
    });
    res.json({ logs });
  })
);

router.post(
  "/check-in",
  requireRole("student"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const result = await studentCheckIn(user, req.body as CheckInRequest);
    res.status(201).json(result);
  })
);

router.post(
  "/quick-mark",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const log = await quickMark(user, req.body);
    res.status(201).json({ log });
  })
);

router.post(
  "/session-submit",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const logs = await sessionSubmit(user, req.body);
    res.json({ logs });
  })
);

router.patch(
  "/logs/:id",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const log = await patchLog(
      user,
      paramAsString(req.params.id),
      req.body.status as AttendanceStatus
    );
    res.json({ log });
  })
);

export default router;
