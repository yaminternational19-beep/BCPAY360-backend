import express from "express";
import {
  approveLeave,
  rejectLeave,
  getPendingLeaves,
  getLeaveHistory
} from "../../controllers/admin/leaveApproval.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();


router.use(requireRole("COMPANY_ADMIN", "HR"));

router.get("/pending", verifyToken, getPendingLeaves);
router.post("/:id/approve", verifyToken, approveLeave);
router.post("/:id/reject", verifyToken, rejectLeave);
router.get(
  "/leave-history",
  verifyToken,
  requireRole("COMPANY_ADMIN", "HR"),
  getLeaveHistory
);


export default router;
