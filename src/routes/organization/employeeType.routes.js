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




router.post("/", createEmployeeType);
router.get("/", listEmployeeTypes);
router.put("/:id", updateEmployeeType);
router.patch("/:id/status", toggleEmployeeTypeStatus);
router.delete("/:id", deleteEmployeeType);

export default router;
