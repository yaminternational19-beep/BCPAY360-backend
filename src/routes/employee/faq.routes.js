import express from "express";
import { getFaqs } from "../../controllers/employee/faq.controller.js";
import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/faqs", verifyEmployeeToken, getFaqs);

export default router;   // 👈 THIS IS IMPORTANT