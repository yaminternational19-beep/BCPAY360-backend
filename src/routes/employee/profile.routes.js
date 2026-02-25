import express from "express";
import { getEmployeeProfile } from "../../controllers/employee/getProfile.controler.js";
import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * EMPLOYEE PROFILE
 */
router.get(
  "/profile",
  verifyEmployeeToken,
  getEmployeeProfile
);

export default router;
