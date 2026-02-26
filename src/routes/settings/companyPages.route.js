import express from "express";
import {
  getAllPages,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage
} from "../../controllers/settings/companyPages.content.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();


// Removed router.use(requireRole(...)) to prevent blocking shared paths.

router.get("/pages", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getAllPages);
router.get("/pages/:slug", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getPageBySlug);
router.post("/pages", verifyToken, requireRole("COMPANY_ADMIN", "HR"), createPage);
router.put("/pages/:id", verifyToken, requireRole("COMPANY_ADMIN", "HR"), updatePage);
router.delete("/pages/:id", verifyToken, requireRole("COMPANY_ADMIN", "HR"), deletePage)

export default router;
