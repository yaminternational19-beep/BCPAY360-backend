import express from "express";
import {
  createDesignation,
  listDesignations,
  updateDesignation,
  deleteDesignation,
  toggleDesignationStatus,
} from "../../controllers/organization/designation.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/* PROTECTED */
router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", createDesignation);
router.get("/", listDesignations);
router.put("/:id", updateDesignation);
router.patch("/:id/status", toggleDesignationStatus);
router.delete("/:id", deleteDesignation);

export default router;
