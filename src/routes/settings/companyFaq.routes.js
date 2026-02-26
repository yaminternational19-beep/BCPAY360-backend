import express from "express";
import {
    createCompanyFaq,
  getCompanyFaqs,
  updateCompanyFaq,
  deleteCompanyFaq
} from "../../controllers/settings/companyFaq.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(requireRole("COMPANY_ADMIN", "HR"));

router.post("/company-faq", verifyToken, createCompanyFaq);
router.get("/company-faq", verifyToken, getCompanyFaqs);
router.put("/company-faq/:id", verifyToken, updateCompanyFaq);
router.delete("/company-faq/:id", verifyToken, deleteCompanyFaq);

export default router;
