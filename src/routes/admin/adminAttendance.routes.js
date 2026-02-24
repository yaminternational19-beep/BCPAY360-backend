import express from "express";
import { verifyToken, allowRoles } from "../../middlewares/auth.middleware.js";
import { getAdminAttendance } from "../../controllers/admin/adminAttendance.controller.js";

const router = express.Router();

/* PREFLIGHT */
router.options("*", (_, res) => res.sendStatus(200));

/* 🔐 ADMIN ONLY */
router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN", "SUPER_ADMIN"));

/**
 * GET /api/admin/attendance
 * Toggle-based attendance view
 *
 * DAILY:
 *   ?viewType=DAILY&date=YYYY-MM-DD
 *
 * HISTORY:
 *   ?viewType=HISTORY&employeeId=ID&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
router.get("/", getAdminAttendance);

export default router;
