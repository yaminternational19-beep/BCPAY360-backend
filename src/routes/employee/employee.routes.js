import express from "express";
import { updateEmployeeProfile } from "../../controllers/employee/employee.controller.js";
import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";
import { uploadProfilePhoto } from "../../middlewares/multerConfig.js";

const router = express.Router();

router.put(
  "/edit-profile",
  verifyEmployeeToken,
  uploadProfilePhoto,
  updateEmployeeProfile
);

export default router;