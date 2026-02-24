import express from "express";
import {
  getAvailableLeaveTypes,
  applyLeave,
  getLeaveHistory
} from "../../controllers/employee/leave.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Employee auth
router.use(verifyToken);
router.use(requireRole("EMPLOYEE"));

router.get("/leave/types", getAvailableLeaveTypes);
router.post("/leave/apply", applyLeave);
router.get("/leave/history", getLeaveHistory);

export default router;
