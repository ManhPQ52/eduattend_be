import bcrypt from "bcryptjs";
import { execute, query, queryOne } from "../db/index.js";
import type { AuthUser, LoginRequest, RegisterRequest } from "../types/index.js";
import {
  generateUserId,
  isValidHustEmail,
  normalizeEmail,
  toAuthUser,
} from "../utils/helpers.js";
import { AppError } from "../middleware/errorHandler.js";
import { signToken } from "../middleware/auth.js";
import type { RowDataPacket } from "mysql2/promise";

interface UserIdRow extends RowDataPacket {
  id: string;
}

interface UserAuthRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: AuthUser["role"];
  password_hash: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: AuthUser["role"];
}

export async function validateRegisterInput(input: RegisterRequest): Promise<string | null> {
  const name = input.name?.trim();
  const email = normalizeEmail(input.email ?? "");

  if (!name) return "nameRequired";
  if (!isValidHustEmail(email)) return "emailInvalid";
  if (!input.password || input.password.length < 6) return "passwordTooShort";
  if (input.confirmPassword !== undefined && input.password !== input.confirmPassword) {
    return "passwordMismatch";
  }
  if (!input.role || !["teacher", "student"].includes(input.role)) return "roleRequired";

  const existing = await queryOne<UserIdRow>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return "emailTaken";

  return null;
}

export async function registerUser(
  input: RegisterRequest
): Promise<{ user: AuthUser; token: string }> {
  const errorCode = await validateRegisterInput(input);
  if (errorCode) {
    throw new AppError(400, errorCode, errorCode);
  }

  const allIds = await query<UserIdRow>("SELECT id FROM users");
  const id = generateUserId(input.role, allIds.map((r) => r.id));
  const email = normalizeEmail(input.email);
  const passwordHash = bcrypt.hashSync(input.password, 10);

  await execute(
    `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
    [id, input.name.trim(), email, passwordHash, input.role]
  );

  const user = toAuthUser({
    id,
    name: input.name.trim(),
    email,
    role: input.role,
  });

  const token = signToken({ userId: user.id, role: user.role });
  return { user, token };
}

export async function loginUser(
  input: LoginRequest
): Promise<{ user: AuthUser; token: string }> {
  const email = normalizeEmail(input.email ?? "");
  const row = await queryOne<UserAuthRow>(
    "SELECT id, name, email, role, password_hash FROM users WHERE email = ?",
    [email]
  );

  if (!row || !bcrypt.compareSync(input.password ?? "", row.password_hash)) {
    throw new AppError(401, "loginError", "loginError");
  }

  if (row.role !== input.role) {
    throw new AppError(401, "loginError", "loginError");
  }

  const user = toAuthUser(row);
  const token = signToken({ userId: user.id, role: user.role });
  return { user, token };
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const row = await queryOne<UserRow>(
    "SELECT id, name, email, role FROM users WHERE id = ?",
    [userId]
  );
  return row ? toAuthUser(row) : null;
}
