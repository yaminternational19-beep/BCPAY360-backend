import express from "express";
import {
  superAdminLogin,
  sendSuperAdminOTP,
  superAdminLogout,
  getCompanySummary,
  updateCompanyName,
  updateCompanyStatus,
  updateCompanyAdminEmail,
  getCompanyAdmins,
  updateCompanyAdminStatus,
  getCompaniesWithoutAdmin
} from "../../../controllers/organization/superadmin/superAdmin.controller.js";

import { verifyToken, requireRole } from "../../../middlewares/auth.middleware.js";

const router = express.Router();

/* AUTH */
router.post("/login", superAdminLogin);
router.post("/send-otp", sendSuperAdminOTP);
router.post(
  "/logout",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  superAdminLogout
);

/* COMPANY */
router.get(
  "/companies/:id/summary",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  getCompanySummary
);

router.put(
  "/companies/:id",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  updateCompanyName
);

router.patch(
  "/companies/:id/status",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  updateCompanyStatus
);

/* COMPANY ADMINS */
router.get(
  "/companies/:id/admins",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  getCompanyAdmins
);

router.put(
  "/company-admins/:id",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  updateCompanyAdminEmail
);

router.patch(
  "/company-admins/:id/status",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  updateCompanyAdminStatus
);

router.get(
  "/companies/without-admin",
  verifyToken,
  requireRole("SUPER_ADMIN"),
  getCompaniesWithoutAdmin
);


export default router;
