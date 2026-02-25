import express from "express";
import { allowRoles, verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

import {
   employeeLogin,
   verifyEmployeeOtp,

   sendForgotPasswordOtp,
   resendForgotPasswordOtp,
   verifyForgotPasswordOtp,
   resetEmployeePassword,

   changeEmployeePassword,
   resendEmployeeLoginOtp
} from "../../controllers/employee/employeeAuth.controller.js";

const router = express.Router();

/* -------------------------------
   AUTH – LOGIN (OTP BASED)
-------------------------------- */
router.post("/login", employeeLogin);
router.post("/verify-otp", verifyEmployeeOtp);

/* -------------------------------
   AUTH – FORGOT PASSWORD FLOW
-------------------------------- */
router.post("/forgot-password", sendForgotPasswordOtp);
router.post("/resend-forgot-otp", resendForgotPasswordOtp);
router.post("/verify-forgot-otp", verifyForgotPasswordOtp);
router.post("/reset-password", resetEmployeePassword);
router.post("/resend-login-otp", resendEmployeeLoginOtp);

/* -------------------------------
   AUTH – CHANGE PASSWORD (LOGGED IN)
-------------------------------- */
router.post(
   "/change-password",
   verifyEmployeeToken,
   allowRoles("EMPLOYEE"),
   changeEmployeePassword
);

export default router;
