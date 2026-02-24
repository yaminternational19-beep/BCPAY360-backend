import express from "express";
import { getEmployeeHolidays } from "../../controllers/employee/holiday.controller.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * EMPLOYEE HOME DASHBOARD
 * Returns attendance status, leave stats, overtime, summary
 */
router.get(
  "/holidays",
  verifyToken,          // must set req.user from JWT
  getEmployeeHolidays
);

export default router;
