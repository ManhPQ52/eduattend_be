import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  approveEnrollment,
  listEnrollments,
  listMyEnrollments,
  listPendingForTeacher,
  rejectEnrollment,
  requestEnrollment,
} from "../services/enrollmentService.js";
import type { EnrollmentStatus } from "../types/index.js";
import { paramAsString } from "../utils/params.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const enrollments = await listEnrollments({
      studentId: req.query.studentId as string | undefined,
      courseId: req.query.courseId as string | undefined,
      status: req.query.status as EnrollmentStatus | undefined,
    });
    res.json({ enrollments });
  })
);

router.get(
  "/me",
  requireRole("student"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json({ enrollments: await listMyEnrollments(user) });
  })
);

router.get(
  "/pending",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json({ enrollments: await listPendingForTeacher(user) });
  })
);

router.post(
  "/",
  requireRole("student"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const enrollment = await requestEnrollment(user, req.body.courseId);
    res.status(201).json({ enrollment });
  })
);

router.patch(
  "/:id/approve",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const enrollment = await approveEnrollment(user, paramAsString(req.params.id));
    res.json({ enrollment });
  })
);

router.patch(
  "/:id/reject",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const enrollment = await rejectEnrollment(user, paramAsString(req.params.id));
    res.json({ enrollment });
  })
);

export default router;
