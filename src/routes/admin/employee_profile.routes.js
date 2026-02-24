import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { uploadProfilePhoto, handleMulterError } from "../../middlewares/multerConfig.js";
import { upsert_employee_profile } from "../../controllers/admin/employee_profile.controller.js";

const router = express.Router();
router.use(verifyToken);

// Upload profile with optional profile photo
router.post("/", uploadProfilePhoto, handleMulterError, upsert_employee_profile);

export default router;
