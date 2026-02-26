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

router.use(requireRole("COMPANY_ADMIN", "HR"));

// Get all support tickets (with filters)
router.get("/support", verifyToken,   getAllSupportTickets);

// Get single support ticket
router.get("/support/:id", verifyToken, getSupportTicketById);

// Respond & auto-close ticket
router.post("/support/:id/respond", verifyToken, respondToSupportTicket);

export default router;
