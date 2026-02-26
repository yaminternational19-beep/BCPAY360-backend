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

router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", verifyToken, createDesignation);
router.get("/", verifyToken, listDesignations);
router.put("/:id", verifyToken, updateDesignation);
router.patch("/:id/status", verifyToken, toggleDesignationStatus);
router.delete("/:id", verifyToken, deleteDesignation);

export default router;
