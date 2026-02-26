import express from "express";
import * as PayrollController from "../../controllers/admin/payroll.controller.js";
import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();


router.get("/employees", verifyToken, requireRole("COMPANY_ADMIN", "HR"), PayrollController.getPayrollEmployees);
router.post("/generate", verifyToken, requireRole("COMPANY_ADMIN", "HR"), PayrollController.generatePayroll);

router.get("/batch", verifyToken, requireRole("COMPANY_ADMIN", "HR"), PayrollController.getPayrollSlipPreview);

router.post(
  "/confirm",
  verifyToken,
  requireRole("COMPANY_ADMIN", "HR"),
  PayrollController.confirmPayrollBatch
);

export default router;
