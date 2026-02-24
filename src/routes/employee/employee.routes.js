import express from "express";
import { updateEmployeeProfile } from "../../controllers/employee/employee.controller.js";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { uploadProfilePhoto } from "../../middlewares/multerConfig.js";

const router = express.Router();

router.put(
  "/edit-profile",
  verifyToken,
  uploadProfilePhoto,
  updateEmployeeProfile
);

export default router;