import express from "express";
import {
  approveLeave,
  rejectLeave,
  getPendingLeaves,
  getLeaveHistory
} from "../../controllers/admin/leaveApproval.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();


router.get("/pending", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getPendingLeaves);
router.post("/:id/approve", verifyToken, requireRole("COMPANY_ADMIN", "HR"), approveLeave);
router.post("/:id/reject", verifyToken, requireRole("COMPANY_ADMIN", "HR"), rejectLeave);
router.get(
  "/leave-history",
  verifyToken,
  requireRole("COMPANY_ADMIN", "HR"),
  getLeaveHistory
);


export default router;
