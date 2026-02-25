import express from "express";
import {
  createSupportTicket,
  getMySupportTickets,
  getContactInformation
} from "../../controllers/employee/support.controller.js";

import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * EMPLOYEE – HELP & SUPPORT
 */
router.use(verifyEmployeeToken);

// Create support request
router.post("/support", createSupportTicket);

// Get employee’s own support requests
router.get("/support", getMySupportTickets);

router.get("/support-details", getContactInformation)

export default router;
