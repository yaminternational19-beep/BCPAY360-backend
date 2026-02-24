import express from "express";
import {
    createCompanyFaq,
  getCompanyFaqs,
  updateCompanyFaq,
  deleteCompanyFaq
} from "../../controllers/settings/companyFaq.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

router.post("/company-faq", createCompanyFaq);
router.get("/company-faq", getCompanyFaqs);
router.put("/company-faq/:id", updateCompanyFaq);
router.delete("/company-faq/:id", deleteCompanyFaq);

export default router;
