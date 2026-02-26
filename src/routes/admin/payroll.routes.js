import express from "express";
import * as PayrollController from "../../controllers/admin/payroll.controller.js";
import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();


router.use(requireRole("COMPANY_ADMIN", "HR"));

router.get("/employees", verifyToken, PayrollController.getPayrollEmployees);
router.post("/generate", verifyToken, PayrollController.generatePayroll);

router.get("/batch", verifyToken, PayrollController.getPayrollSlipPreview);

router.post(
  "/confirm",
  verifyToken,
  PayrollController.confirmPayrollBatch
);

export default router;
