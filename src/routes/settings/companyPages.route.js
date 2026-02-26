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


router.use(requireRole("COMPANY_ADMIN", "HR"));

router.get("/pages", verifyToken, getAllPages);
router.get("/pages/:slug", verifyToken, getPageBySlug);
router.post("/pages", verifyToken, createPage);
router.put("/pages/:id", verifyToken, updatePage);
router.delete("/pages/:id", verifyToken, deletePage)

export default router;
