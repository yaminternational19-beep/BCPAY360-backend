import express from "express";
import {
  createBroadcast,
  getBroadcasts,
  getBroadcastEmployees,
  deleteBroadcast
} from "../../controllers/settings/broadcast.controller.js";

import { verifyToken, requireRole } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// 🔐 Auth & role protection (same as company-faq)

// Removed router.use(requireRole(...)) to prevent blocking shared paths.

// 📢 Broadcast APIs
router.post("/broadcast", verifyToken, requireRole("COMPANY_ADMIN", "HR"), createBroadcast);
router.get("/broadcast", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getBroadcasts);
router.get("/broadcast/employees", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getBroadcastEmployees);
router.delete("/broadcast/:id", verifyToken, requireRole("COMPANY_ADMIN", "HR"), deleteBroadcast);

export default router;
