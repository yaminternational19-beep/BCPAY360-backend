import express from "express";
import { getEmployeeHome } from "../../controllers/employee/home.controller.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * EMPLOYEE HOME DASHBOARD
 * Returns attendance status, leave stats, overtime, summary
 */
router.get(
  "/home",
  verifyToken,          // must set req.user from JWT
  getEmployeeHome
);

export default router;
