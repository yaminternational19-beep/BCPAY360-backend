import { sendMail } from "../../lib/mailer/mailer.js";
import { genericTemplate } from "../templates/generic.template.js";

/**
 * System Mail Service for miscellaneous emails
 */
export const sendSystemEmail = async ({ to, subject, body }) => {
    const { html, text } = genericTemplate({ subject, body });
    return await sendMail({ to, subject, html, text });
};
