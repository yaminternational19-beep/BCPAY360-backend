import express from "express";
import { getEmployeeProfile } from "../../controllers/employee/getProfile.controler.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * EMPLOYEE PROFILE
 */
router.get(
  "/profile",
  verifyToken,
  getEmployeeProfile
);

export default router;
