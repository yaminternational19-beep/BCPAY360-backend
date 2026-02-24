import express from "express";
import {
  approveLeave,
  rejectLeave,
  getPendingLeaves,
  getLeaveHistory
} from "../../controllers/admin/leaveApproval.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

router.get("/pending", getPendingLeaves);
router.post("/:id/approve", approveLeave);
router.post("/:id/reject", rejectLeave);
router.get(
  "/leave-history",
  verifyToken,
  requireRole("COMPANY_ADMIN", "HR"),
  getLeaveHistory
);


export default router;
