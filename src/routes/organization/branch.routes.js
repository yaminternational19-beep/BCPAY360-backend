import express from "express";
import {
  createBranch,
  listBranches,
  updateBranch,
  deleteBranch,
  toggleBranchStatus,
} from "../../controllers/organization/branch.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/* PROTECTED ROUTES */

router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", verifyToken, createBranch);
router.get("/", verifyToken, listBranches);
router.put("/:id", verifyToken, updateBranch);
router.patch("/:id/status", verifyToken, toggleBranchStatus);
router.delete("/:id", verifyToken, deleteBranch);

export default router;
