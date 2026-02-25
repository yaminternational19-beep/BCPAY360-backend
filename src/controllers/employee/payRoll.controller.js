import db from "../../models/db.js";
import { getS3SignedUrl } from "../../utils/s3Upload.util.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "PAYROLL_CONTROLLER";
const SIGNED_URL_TTL = 259200; // 3 days
const INLINE = { disposition: "attachment" };

export const getAllEmployeePayrollData = async (req, res) => {
  try {
    const employeeId = req.user.id;

    const [rows] = await db.query(`
      SELECT
        pee.employee_id,
        pee.base_salary,
        pee.gross_salary,
        pee.net_salary,
        pee.bonus,
        pee.incentive,
        pee.pf_applicable,
        pee.pf_amount,
        pee.other_deductions,

        pb.pay_month,
        pb.pay_year,

        pee.payment_status,
        CASE
          WHEN pee.payment_status = 'SUCCESS' THEN pee.paid_at
          ELSE NULL
        END AS credited_on,

        ep.bank_name,

        efd.storage_provider,
        efd.storage_object_key

      FROM payroll_employee_entries pee
      JOIN payroll_batches pb
        ON pb.id = pee.payroll_batch_id

      LEFT JOIN employee_profiles ep
        ON ep.employee_id = pee.employee_id

      LEFT JOIN employee_form_documents efd
        ON efd.employee_id = pee.employee_id
        AND LOWER(efd.form_code) = 'salary'
        AND efd.period_type = 'MONTH'
        AND efd.doc_year = pb.pay_year
        AND efd.doc_month = pb.pay_month
        AND efd.is_employee_visible = 1

      WHERE pee.employee_id = ?
      ORDER BY pb.pay_year DESC, pb.pay_month DESC
    `, [employeeId]);

    if (!rows.length) {
      return res.json({
        status: true,
        salary: null
      });
    }

    const salaryHistory = [];

    for (const r of rows) {

      let viewUrl = null;
      let downloadUrl = null;

      if (r.storage_provider === "S3" && r.storage_object_key) {
        viewUrl = await getS3SignedUrl(
          r.storage_object_key,
          SIGNED_URL_TTL,
          { disposition: "inline" }
        );

        downloadUrl = await getS3SignedUrl(
          r.storage_object_key,
          SIGNED_URL_TTL,
          { disposition: "attachment" }
        );
      }

      const bonusAmount = Number(r.bonus) > 0 ? Number(r.bonus) : 0;
      const incentiveAmount = Number(r.incentive) > 0 ? Number(r.incentive) : 0;

      const pfAmount =
        Boolean(r.pf_applicable) && Number(r.pf_amount) > 0
          ? Number(r.pf_amount)
          : 0;

      const otherDeductionAmount =
        Number(r.other_deductions) > 0
          ? Number(r.other_deductions)
          : 0;

      salaryHistory.push({
        pay_month: r.pay_month,
        pay_year: r.pay_year,
        payment_status: r.payment_status,
        credited_on: r.credited_on
          ? new Date(r.credited_on).toISOString().split("T")[0]
          : null,
        bank_name: r.bank_name,
        net_salary: Number(r.net_salary),

        incentives: [
          ...(bonusAmount > 0 ? [{ type: "BONUS", amount: bonusAmount }] : []),
          ...(incentiveAmount > 0 ? [{ type: "INCENTIVE", amount: incentiveAmount }] : [])
        ],

        deductions: [
          ...(pfAmount > 0 ? [{ type: "PROVIDENT_FUND", amount: pfAmount }] : []),
          ...(otherDeductionAmount > 0 ? [{ type: "OTHER", amount: otherDeductionAmount }] : [])
        ],

        total_incentives: bonusAmount + incentiveAmount,
        total_deductions: pfAmount + otherDeductionAmount,

        view_url: viewUrl,
        download_url: downloadUrl
      });
    }

    return res.json({
      status: true,
      message: "Salary details fetched successfully",
      salary_history: salaryHistory
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Payroll API error", error);
    res.status(500).json({ message: "Failed to fetch payroll data" });
  }
};
