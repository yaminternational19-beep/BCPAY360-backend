import express from "express";
import { verifyToken, allowRoles } from "../../middlewares/auth.middleware.js";
import {
  getEmployeesByForm,
  uploadEmployeeForm,
  replaceEmployeeForm,
  deleteEmployeeForm
} from "../../controllers/admin/adminForms.controller.js";

import {
  uploadDocument,
  handleMulterError
} from "../../middlewares/multerConfig.js";

const router = express.Router();

/* PREFLIGHT */
router.options("*", (_, res) => res.sendStatus(200));

/* 🔐 AUTH */

// Remove router.use(allowRoles(...)) because it blocks other routers on /api/admin

/* =====================
   LIST EMPLOYEES BY FORM
===================== */
router.get("/", verifyToken, allowRoles("COMPANY_ADMIN", "SUPER_ADMIN", "HR"), getEmployeesByForm);

/* =====================
   UPLOAD (NEW)
===================== */
router.post(
  "/upload",
  verifyToken,
  allowRoles("COMPANY_ADMIN", "SUPER_ADMIN", "HR"),
  uploadDocument,
  handleMulterError,
  uploadEmployeeForm
);

/* =====================
   REPLACE (EXISTING)
===================== */
router.put(
  "/replace",
  verifyToken,
  allowRoles("COMPANY_ADMIN", "SUPER_ADMIN", "HR"),
  uploadDocument,        // ✅ REQUIRED
  handleMulterError,     // ✅ REQUIRED
  replaceEmployeeForm
);

/* =====================
   DELETE
===================== */
router.delete(
  "/delete",
  verifyToken,
  allowRoles("COMPANY_ADMIN", "SUPER_ADMIN", "HR"),
  deleteEmployeeForm
);

export default router;
