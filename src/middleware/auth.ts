import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { queryOne } from "../db/index.js";
import type { AuthUser } from "../types/index.js";
import { toAuthUser } from "../utils/helpers.js";
import { asyncMiddleware } from "./errorHandler.js";
import type { RowDataPacket } from "mysql2/promise";

export interface AuthPayload {
  userId: string;
  role: AuthUser["role"];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: AuthUser["role"];
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "unauthorized" });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    const row = await queryOne<UserRow>(
      "SELECT id, name, email, role FROM users WHERE id = ?",
      [decoded.userId]
    );

    if (!row) {
      res.status(401).json({ message: "unauthorized" });
      return;
    }

    req.user = toAuthUser(row);
    next();
  } catch {
    res.status(401).json({ message: "unauthorized" });
  }
}

export const authenticate = asyncMiddleware(authMiddleware);

export function requireRole(...roles: AuthUser["role"][]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "forbidden" });
      return;
    }
    next();
  };
}
