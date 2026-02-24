import express from "express";
import {
  getAllEmployeePayrollData
} from "../../controllers/employee/payRoll.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Employee auth
router.use(verifyToken);
router.use(requireRole("EMPLOYEE"));

router.get("/payroll", getAllEmployeePayrollData);



export default router;
