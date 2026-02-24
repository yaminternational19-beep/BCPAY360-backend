import express from "express";
import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";
import { uploadEmployeeFiles, handleMulterError } from "../../middlewares/multerConfig.js";

import {
  create_employee,
  list_employees,
  get_employee_by_id,
  update_employee,
  toggle_employee_status,
  activate_employee,
  delete_employee,
  getLastEmployeeCode,
  update_employee_by_code,
  getAvailableCompanyForms
} from "../../controllers/admin/employee.controller.js";

const router = express.Router();

router.use(verifyToken);

router.get("/last-code", allowRoles("COMPANY_ADMIN", "HR"), getLastEmployeeCode);

// File uploads for employee creation and update
router.post("/", allowRoles("COMPANY_ADMIN", "HR"), uploadEmployeeFiles, handleMulterError, create_employee);
router.get("/", allowRoles("COMPANY_ADMIN", "HR"), list_employees);
router.get("/:id", allowRoles("COMPANY_ADMIN", "HR", "EMPLOYEE"), get_employee_by_id);
router.put("/:id", allowRoles("COMPANY_ADMIN", "HR"), uploadEmployeeFiles, handleMulterError, update_employee);
router.put("/code/:employee_code", allowRoles("COMPANY_ADMIN", "HR"), uploadEmployeeFiles, handleMulterError, update_employee_by_code);
router.patch("/:id/status", allowRoles("COMPANY_ADMIN", "HR"), toggle_employee_status);
router.patch("/:id/activate", allowRoles("COMPANY_ADMIN", "HR"), activate_employee);
router.delete("/:id", allowRoles("COMPANY_ADMIN"), delete_employee);
router.get("/company/forms/available", allowRoles("COMPANY_ADMIN", "HR"), getAvailableCompanyForms);





export default router;
