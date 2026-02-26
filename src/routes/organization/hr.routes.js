import express from "express";
import {
  createHR,
  listHRs,
  getHRById,
  updateHR,
  toggleHRStatus,
  deleteHR,
  hrPreLogin,
  hrVerifyOtp,
} from "../../controllers/organization/hr.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/* ===== PUBLIC ===== */
router.post("/pre-login", hrPreLogin);
router.post("/verify-otp", hrVerifyOtp);

/* ===== ADMIN ONLY ===== */

router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", verifyToken, createHR);
router.get("/", verifyToken, listHRs);
router.get("/:id", verifyToken, getHRById);
router.put("/:id", verifyToken, updateHR);
router.patch("/:id/status", verifyToken, toggleHRStatus);

/* ⚠️ OPTIONAL (will soft-delete later) */
router.delete("/:id", verifyToken, deleteHR);

export default router;
