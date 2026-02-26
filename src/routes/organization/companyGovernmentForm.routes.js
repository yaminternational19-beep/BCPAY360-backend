import express from "express";
import {
  createGovernmentForm,
  getGovernmentForms,
  getFormDefinition,
  updateGovernmentForm,
  deleteGovernmentForm
} from "../../controllers/organization/companyGovernmentForm.controller.js";
import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/* PROTECTED - Only COMPANY_ADMIN and HR can manage government forms */

router.use(allowRoles("COMPANY_ADMIN", "HR"));

/**
 * CREATE - Add new government form metadata
 * POST /api/admin/government-forms
 * Body: { form_code, form_name, period_type, category, is_employee_specific, description }
 */
router.post("/", verifyToken, createGovernmentForm);

/**
 * GET ALL - List available forms
 * GET /api/admin/government-forms?groupByCategory=true
 */
router.get("/", verifyToken, getGovernmentForms);

/**
 * GET BY CODE - Get form definition by form_code
 * GET /api/admin/government-forms/:formCode
 */
router.get("/:formCode", verifyToken, getFormDefinition);

/**
 * UPDATE - Update form metadata or toggle status
 * PATCH /api/admin/government-forms/:id
 * Body: { action: "TOGGLE_STATUS" } OR { form_name, description, period_type, category }
 */
router.patch("/:id", verifyToken, updateGovernmentForm);

/**
 * DELETE - Remove government form
 * DELETE /api/admin/government-forms/:id
 */
router.delete("/:id", verifyToken, deleteGovernmentForm);

export default router;

