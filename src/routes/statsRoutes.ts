import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import { getStudentStats, getTeacherTodayStats } from "../services/statsService.js";

const router = Router();

router.use(authenticate);

router.get(
  "/teacher/today",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json({ stats: await getTeacherTodayStats(user) });
  })
);

router.get(
  "/student/me",
  requireRole("student"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json(await getStudentStats(user));
  })
);

export default router;
