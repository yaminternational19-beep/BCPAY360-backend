import express from "express";
import { deactivateAccount } from "../../controllers/employee/deactivateAccount.controller.js";
import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/deactivate", verifyEmployeeToken, deactivateAccount);

export default router;   // 👈 THIS IS IMPORTANT