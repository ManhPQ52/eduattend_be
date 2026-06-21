import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  createCourse,
  deleteCourse,
  getCourse,
  listCourseStudents,
  listCourses,
  updateCourse,
} from "../services/courseService.js";
import { paramAsString } from "../utils/params.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json({ courses: await listCourses(user) });
  })
);

router.get(
  "/:id/students",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    res.json({ students: await listCourseStudents(paramAsString(req.params.id)) });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json({ course: await getCourse(paramAsString(req.params.id)) });
  })
);

router.post(
  "/",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const course = await createCourse(user, req.body);
    res.status(201).json({ course });
  })
);

router.patch(
  "/:id",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const course = await updateCourse(user, paramAsString(req.params.id), req.body);
    res.json({ course });
  })
);

router.delete(
  "/:id",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    await deleteCourse(user, paramAsString(req.params.id));
    res.json({ ok: true });
  })
);

export default router;
