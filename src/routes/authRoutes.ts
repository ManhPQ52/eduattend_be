import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { authenticate } from "../middleware/auth.js";
import { loginUser, registerUser } from "../services/authService.js";
import type { LoginRequest, RegisterRequest } from "../types/index.js";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body as RegisterRequest);
    res.status(201).json(result);
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.body as LoginRequest);
    res.json(result);
  })
);

router.post(
  "/logout",
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json({ ok: true });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    res.json({ user });
  })
);

export default router;
