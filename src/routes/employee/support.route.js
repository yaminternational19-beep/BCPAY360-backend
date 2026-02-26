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


// Create support request
router.post("/support",verifyEmployeeToken, createSupportTicket);

// Get employee’s own support requests
router.get("/support", verifyEmployeeToken, getMySupportTickets);

router.get("/support-details", verifyEmployeeToken, getContactInformation)

export default router;
