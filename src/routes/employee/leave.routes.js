import express from "express";
import {
  getAvailableLeaveTypes,
  applyLeave,
  getLeaveHistory
} from "../../controllers/employee/leave.controller.js";

import { verifyEmployeeToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Employee auth

router.get("/leave/types", verifyEmployeeToken, getAvailableLeaveTypes);
router.post("/leave/apply", verifyEmployeeToken, applyLeave);
router.get("/leave/history", verifyEmployeeToken, getLeaveHistory);

export default router;
