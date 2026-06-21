import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import { initDb } from "./db/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/authRoutes.js";
import courseRoutes from "./routes/courseRoutes.js";
import enrollmentRoutes from "./routes/enrollmentRoutes.js";
import sessionRoutes, { courseSessionRouter } from "./routes/sessionRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";

export async function createApp() {
  await initDb();

  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "15mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "eduattend-be", database: "mysql" });
  });

  const api = express.Router();
  api.use("/auth", authRoutes);
  api.use("/courses", courseRoutes);
  api.use("/courses/:courseId/sessions", courseSessionRouter);
  api.use("/enrollments", enrollmentRoutes);
  api.use("/sessions", sessionRoutes);
  api.use("/attendance", attendanceRoutes);
  api.use("/stats", statsRoutes);

  app.use("/api/v1", api);
  app.use(errorHandler);

  return app;
}
