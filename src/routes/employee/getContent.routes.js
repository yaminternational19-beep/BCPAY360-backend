import express from "express";
import { getContent } from "../../controllers/employee/getContent.controller.js";
import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js"; // if needed

const router = express.Router();

// If public content, remove authMiddleware
router.get("/get-content", verifyEmployeeToken, getContent);

export default router;