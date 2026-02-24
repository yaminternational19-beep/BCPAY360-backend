import express from "express";
import * as PayrollController from "../../controllers/admin/payroll.controller.js";
import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

router.get("/employees", PayrollController.getPayrollEmployees);
router.post("/generate", PayrollController.generatePayroll);

router.get("/batch", PayrollController.getPayrollSlipPreview);

router.post(
  "/confirm",
  PayrollController.confirmPayrollBatch
);

export default router;
