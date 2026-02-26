import express from "express";
import {
  createCompanyFaq,
  getCompanyFaqs,
  updateCompanyFaq,
  deleteCompanyFaq
} from "../../controllers/settings/companyFaq.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Removed router.use(requireRole(...)) to prevent blocking shared paths.

router.post("/company-faq", verifyToken, requireRole("COMPANY_ADMIN", "HR"), createCompanyFaq);
router.get("/company-faq", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getCompanyFaqs);
router.put("/company-faq/:id", verifyToken, requireRole("COMPANY_ADMIN", "HR"), updateCompanyFaq);
router.delete("/company-faq/:id", verifyToken, requireRole("COMPANY_ADMIN", "HR"), deleteCompanyFaq);

export default router;
