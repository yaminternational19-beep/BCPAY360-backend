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
router.use(verifyToken);
router.use(requireRole("COMPANY_ADMIN", "HR"));

// 📢 Broadcast APIs
router.post("/broadcast", createBroadcast);                 // create broadcast
router.get("/broadcast", getBroadcasts);                    // admin history
router.get("/broadcast/employees", getBroadcastEmployees); // resolve employee names
router.delete("/broadcast/:id", deleteBroadcast);           // delete broadcast

export default router;
