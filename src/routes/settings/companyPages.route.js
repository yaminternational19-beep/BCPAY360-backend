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

router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

router.get("/pages", getAllPages);
router.get("/pages/:slug", getPageBySlug);
router.post("/pages", createPage);
router.put("/pages/:id", updatePage);
router.delete("/pages/:id", deletePage)

export default router;
