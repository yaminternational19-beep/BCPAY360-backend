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
router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN"));

router.get("/:hrId", getHRPermissions);
router.post("/:hrId", saveHRPermissions);
router.delete("/:hrId/:moduleKey", deleteHRPermission);
router.delete("/:hrId", resetHRPermissions);

export default router;
