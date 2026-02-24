import express from "express";
import {
  createLeaveType,
  getLeaveTypes,
  updateLeaveType,
  toggleLeaveTypeStatus,
  deleteLeaveType
} from "../../controllers/admin/leaveMaster.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Auth
router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

// CRUD
router.post("/leave-types", createLeaveType);
router.get("/leave-types", getLeaveTypes);
router.put("/leave-types/:id", updateLeaveType);
router.patch("/leave-types/:id/status", toggleLeaveTypeStatus);
router.delete("/leave-types/:id", deleteLeaveType);

export default router;
