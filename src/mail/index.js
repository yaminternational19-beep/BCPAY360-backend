import { sendOtpEmail } from "./services/otp.mail.service.js";
import { sendSalaryEmail } from "./services/salary.mail.service.js";
import { sendSystemEmail } from "./services/system.mail.service.js";

/**
 * PUBLIC MAIL API (Facaded)
 * This is the ONLY file controllers should import from.
 */

export {
    sendOtpEmail,
    sendSalaryEmail,
    sendSystemEmail
};
