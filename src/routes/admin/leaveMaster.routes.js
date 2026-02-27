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
router.post("/leave-types", verifyToken, createLeaveType);
router.get("/leave-types", verifyToken, getLeaveTypes);
router.put("/leave-types/:id", verifyToken, updateLeaveType);
router.patch("/leave-types/:id/status", verifyToken, toggleLeaveTypeStatus);
router.delete("/leave-types/:id", verifyToken, deleteLeaveType);

export default router;
