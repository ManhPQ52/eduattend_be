import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authenticate, requireRole, type AuthenticatedRequest } from "../middleware/auth.js";
import {
  closeSession,
  getActiveSessionForCourse,
  getActiveSessionsForStudent,
  openSession,
  regeneratePin,
} from "../services/sessionService.js";
import { paramAsString } from "../utils/params.js";

const router = Router();

router.use(authenticate);

router.get(
  "/active",
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const courseId = req.query.courseId as string | undefined;

    if (courseId) {
      const includePin = user.role === "teacher";
      const session = await getActiveSessionForCourse(courseId, includePin);
      res.json({ session });
      return;
    }

    res.status(400).json({ message: "courseIdRequired" });
  })
);

router.get(
  "/active/me",
  requireRole("student"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json({ sessions: await getActiveSessionsForStudent(user) });
  })
);

router.post(
  "/:id/regenerate-pin",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const session = await regeneratePin(user, paramAsString(req.params.id));
    res.json({ session });
  })
);

router.patch(
  "/:id/close",
  requireRole("teacher"),
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const session = await closeSession(user, paramAsString(req.params.id));
    res.json({ session });
  })
);

export default router;

const courseSessionRouter = Router({ mergeParams: true });

courseSessionRouter.use(authenticate, requireRole("teacher"));

courseSessionRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    const courseId = paramAsString(req.params.courseId);
    const session = await openSession(user, courseId);
    res.status(201).json({ session });
  })
);

export { courseSessionRouter };
