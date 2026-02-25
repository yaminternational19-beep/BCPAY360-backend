import express from "express";
import { getContent } from "../../controllers/employee/getContent.controller.js";
import { verifyToken } from "../../middlewares/auth.middleware.js"; // if needed

const router = express.Router();

// If public content, remove authMiddleware
router.get("/get-content", verifyToken, getContent);

export default router;