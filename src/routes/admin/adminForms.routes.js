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
router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN", "SUPER_ADMIN", "HR"));

/* =====================
   LIST EMPLOYEES BY FORM
===================== */
router.get("/", getEmployeesByForm);

/* =====================
   UPLOAD (NEW)
===================== */
router.post(
  "/upload",
  uploadDocument,
  handleMulterError,
  uploadEmployeeForm
);

/* =====================
   REPLACE (EXISTING)
===================== */
router.put(
  "/replace",
  uploadDocument,        // ✅ REQUIRED
  handleMulterError,     // ✅ REQUIRED
  replaceEmployeeForm
);

/* =====================
   DELETE
===================== */
router.delete(
  "/delete",
  deleteEmployeeForm
);

export default router;
