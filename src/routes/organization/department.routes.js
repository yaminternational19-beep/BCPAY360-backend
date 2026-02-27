import express from "express";
import {
  createDepartment,
  listDepartments,
  updateDepartment,
  deleteDepartment,
  listDepartmentsPublic,
} from "../../controllers/organization/department.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/public", verifyToken, listDepartmentsPublic);

/* PROTECTED */
router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", verifyToken, createDepartment);
router.get("/", verifyToken, listDepartments);
router.put("/:id", verifyToken, updateDepartment);
router.delete("/:id", verifyToken, deleteDepartment);

export default router;
