import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * LOW-LEVEL TRANSPORT LAYER
 * Handles SMTP configuration and raw sending.
 */

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Expose raw send utility
 */
export const sendMail = async ({ to, subject, html, text }) => {
    if (!to) throw new Error("Recipient 'to' is required");
    if (!subject) throw new Error("Subject is required");
    if (!html && !text) throw new Error("Email body (html or text) is required");

    return await transporter.sendMail({
        from: `"HRIS" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html
    });
};
