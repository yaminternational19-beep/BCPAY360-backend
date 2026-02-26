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

router.use(requireRole("COMPANY_ADMIN", "HR"));

// 📢 Broadcast APIs
router.post("/broadcast", verifyToken, createBroadcast);                 // create broadcast
router.get("/broadcast", verifyToken, getBroadcasts);                    // admin history
router.get("/broadcast/employees", verifyToken, getBroadcastEmployees); // resolve employee names
router.delete("/broadcast/:id", verifyToken, deleteBroadcast);           // delete broadcast

export default router;
