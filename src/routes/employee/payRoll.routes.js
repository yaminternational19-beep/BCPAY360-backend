import express from "express";
import {
  getAllEmployeePayrollData
} from "../../controllers/employee/payRoll.controller.js";

import { verifyEmployeeToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();


router.use(requireRole("EMPLOYEE"));

router.get("/payroll", verifyEmployeeToken, getAllEmployeePayrollData);



export default router;
