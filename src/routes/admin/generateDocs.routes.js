import express from "express";

import { getCompanyGovernmentForm, getEmployeeSummary } from "../../controllers/admin/generateDocs.controller.js";


import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * All routes here require authentication
 */
router.use(verifyToken);

/**
 * ------------------------------------
 * Company Government Forms
 * Access: COMPANY_ADMIN, HR
 * ------------------------------------
 */
router.get(
  "/company/:formCode",
  requireRole("COMPANY_ADMIN", "HR"),
  getCompanyGovernmentForm
);

/**
 * ------------------------------------
 * Employee Summary (lifetime / monthly)
 * Access: COMPANY_ADMIN, HR
 * ------------------------------------
 */
router.get(
  "/employees/:employeeId/summary",
  requireRole("COMPANY_ADMIN", "HR"),
  getEmployeeSummary
);

export default router;
