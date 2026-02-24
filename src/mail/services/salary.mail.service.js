import db from "../../models/db.js";
import { sendMail } from "../../lib/mailer/mailer.js";
import { salaryTemplate } from "../templates/salary.template.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "SALARY_MAIL_SERVICE";

/**
 * Salary Mail Service
 */
export const sendSalaryEmail = async ({ to, name, month, year, payrollEntryId }) => {
    if (!to) {
        logger.warn(MODULE_NAME, "Salary email skipped: no email provided");
        return;
    }

    const monthName = new Date(year, month - 1).toLocaleString("en-IN", {
        month: "long"
    });

    const { subject, html } = salaryTemplate({ name, monthName, year });

    try {
        await sendMail({ to, subject, html });
        logger.info(MODULE_NAME, `Salary email sent to ${to}`);

        // Update email_sent flag in DB
        if (payrollEntryId) {
            await db.query(`
                UPDATE employee_payslips 
                SET email_sent = 1 
                WHERE payroll_employee_entry_id = ?
            `, [payrollEntryId]);
        }
    } catch (error) {
        logger.error(MODULE_NAME, "Salary email failed", error);
        // Do NOT throw to prevent batch failure
    }
};
