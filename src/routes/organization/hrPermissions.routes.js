import express from "express";
import {
  getHRPermissions,
  saveHRPermissions,
  deleteHRPermission,
  resetHRPermissions,
} from "../../controllers/organization/hrPermissions.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/* 🔐 ADMIN ONLY */

router.use(allowRoles("COMPANY_ADMIN"));

router.get("/:hrId", verifyToken, getHRPermissions);
router.post("/:hrId", verifyToken, saveHRPermissions);
router.delete("/:hrId/:moduleKey", verifyToken, deleteHRPermission);
router.delete("/:hrId", verifyToken, resetHRPermissions);

export default router;
