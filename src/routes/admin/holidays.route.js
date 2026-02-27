import express from "express";
import {
  createBranchHolidays,
  getBranchHolidays,
  updateBranchHoliday,
  deleteBranchHoliday
} from "../../controllers/admin/holidays.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();
router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

router.post("/branch-holidays",verifyToken, createBranchHolidays);
router.get("/branch-holidays", verifyToken, getBranchHolidays);
router.put("/branch-holidays", verifyToken, updateBranchHoliday);
router.delete("/branch-holidays", verifyToken, deleteBranchHoliday);

export default router;
