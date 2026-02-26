import express from "express";
import {
  getAllSupportTickets,
  getSupportTicketById,
  respondToSupportTicket
} from "../../controllers/settings/support.controller.js";

import {
  verifyToken,
  requireRole
} from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Removed router.use(requireRole(...)) to prevent blocking shared paths.

// Get all support tickets (with filters)
router.get("/support", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getAllSupportTickets);

// Get single support ticket
router.get("/support/:id", verifyToken, requireRole("COMPANY_ADMIN", "HR"), getSupportTicketById);

// Respond & auto-close ticket
router.post("/support/:id/respond", verifyToken, requireRole("COMPANY_ADMIN", "HR"), respondToSupportTicket);

export default router;
