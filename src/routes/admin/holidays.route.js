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

router.post("/branch-holidays", createBranchHolidays);
router.get("/branch-holidays", getBranchHolidays);
router.put("/branch-holidays", updateBranchHoliday);
router.delete("/branch-holidays", deleteBranchHoliday);

export default router;
