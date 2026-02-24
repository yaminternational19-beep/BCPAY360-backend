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
router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", createHR);
router.get("/", listHRs);
router.get("/:id", getHRById);
router.put("/:id", updateHR);
router.patch("/:id/status", toggleHRStatus);

/* ⚠️ OPTIONAL (will soft-delete later) */
router.delete("/:id", deleteHR);

export default router;
