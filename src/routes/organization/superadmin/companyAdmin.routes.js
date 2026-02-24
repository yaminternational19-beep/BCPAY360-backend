import express from "express";
import {
  createCompanyAdmin,
  companyAdminPreLogin,
  companyAdminVerifyOtp
} from "../../../controllers/organization/superadmin/companyAdmin.controller.js";

import {
  verifyToken,
  requireRole
} from "../../../middlewares/auth.middleware.js";

const router = express.Router();

/* ADMIN LOGIN */
router.post("/pre-login", companyAdminPreLogin);
router.post("/verify-otp", companyAdminVerifyOtp);

/* SUPER ADMIN */
router.post(
  "/",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  createCompanyAdmin
);



export default router;
