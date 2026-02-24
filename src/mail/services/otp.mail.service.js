import { sendMail } from "../../lib/mailer/mailer.js";
import { otpTemplate } from "../templates/otp.template.js";

/**
 * OTP Mail Service
 */
export const sendOtpEmail = async (to, otp) => {
    const { subject, html, text } = otpTemplate(otp);
    return await sendMail({ to, subject, html, text });
};
