import express from "express";
import {
    createEmployeeType,
    listEmployeeTypes,
    updateEmployeeType,
    deleteEmployeeType,
    toggleEmployeeTypeStatus,
} from "../../controllers/organization/employeeType.controller.js";
import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN"));




router.post("/", verifyToken, createEmployeeType);
router.get("/", verifyToken, listEmployeeTypes);
router.put("/:id", verifyToken, updateEmployeeType);
router.patch("/:id/status", verifyToken, toggleEmployeeTypeStatus);
router.delete("/:id", verifyToken, deleteEmployeeType);

export default router;
