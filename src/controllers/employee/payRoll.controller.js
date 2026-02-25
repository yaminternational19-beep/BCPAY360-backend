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
  pee.id AS payroll_entry_id,
  pee.employee_id,

  -- Salary figures
  pee.base_salary,
  pee.gross_salary,
  pee.net_salary,
  pee.bonus,
  pee.incentive,
  pee.pf_applicable,
  pee.pf_amount,
  pee.other_deductions,

  -- Payroll period
  pb.pay_month,
  pb.pay_year,

  -- Status (source of truth)
  pee.payment_status,

  -- Credited date (only if SUCCESS)
  CASE
    WHEN pee.payment_status = 'SUCCESS' THEN pee.paid_at
    ELSE NULL
  END AS credited_on,

  -- Bank details (employee profile)
  ep.bank_name,
  ep.ifsc_code,
  ep.account_number,

  -- Payslip document (latest <= payroll month)
  efd.storage_provider,
  efd.storage_bucket,
  efd.storage_object_key,
  efd.file_path

FROM payroll_employee_entries pee

JOIN payroll_batches pb
  ON pb.id = pee.payroll_batch_id

LEFT JOIN employee_profiles ep
  ON ep.employee_id = pee.employee_id

LEFT JOIN employee_form_documents efd
  ON efd.employee_id = pee.employee_id
  AND LOWER(efd.form_code) = 'salary'
  AND efd.period_type = 'MONTH'
  AND efd.is_employee_visible = 1
  AND (
       (efd.doc_year < pb.pay_year)
       OR
       (efd.doc_year = pb.pay_year AND efd.doc_month <= pb.pay_month)
  )

WHERE pee.employee_id = ?

ORDER BY
  pb.pay_year DESC,
  pb.pay_month DESC,
  efd.doc_year DESC,
  efd.doc_month DESC;




    `, [employeeId]);

    if (!rows.length) {
      return res.json({ salary: null });
    }

    const r = rows[0];

    /* ===============================
       BUSINESS LOGIC (CLEAN)
    ================================ */

    // Incentives
    const bonusAmount = (r.bonus) > 0 ? (r.bonus) : 0;
    const incentiveAmount = Number(r.incentive) > 0 ? Number(r.incentive) : 0;

    const incentives = [];
    if (bonusAmount > 0) {
      incentives.push({ type: "BONUS", amount: bonusAmount });
    }
    if (incentiveAmount > 0) {
      incentives.push({ type: "INCENTIVE", amount: incentiveAmount });
    }

    const totalIncentives = bonusAmount + incentiveAmount;

    // Deductions
    const pfApplicable =
      Boolean(r.pf_applicable) && Number(r.pf_amount) > 0;

    const pfAmount = pfApplicable ? Number(r.pf_amount) : 0;
    const otherDeductionAmount =
      Number(r.other_deductions) > 0 ? Number(r.other_deductions) : 0;

    const deductions = [];
    if (pfApplicable) {
      deductions.push({
        type: "PROVIDENT_FUND",
        applicable: true,
        amount: pfAmount
      });
    }
    if (otherDeductionAmount > 0) {
      deductions.push({
        type: "OTHER",
        amount: otherDeductionAmount
      });
    }

    const totalDeductions = pfAmount + otherDeductionAmount;



    let payslip_url = null;

    if (
      r.storage_provider === "S3" &&
      r.storage_bucket &&
      r.storage_object_key
    ) {
      payslip_url = await getS3SignedUrl({
        bucket: r.storage_bucket,
        key: r.storage_object_key,
        expiresIn: SIGNED_URL_TTL,     // 3 days
        ...INLINE                      // view in browser
      });
    } else if (r.file_path) {
      // fallback for local storage
      payslip_url = r.file_path;
    }


    /* ===============================
       RESPONSE (DUMB & CLEAN)
    ================================ */

    return res.json({
      status: true,
      message: "Salary details fetched successfully",
      salary: {
        employee_id: r.employee_id,
        base_salary: (r.base_salary),
        gross_salary: (r.gross_salary),
        net_salary: (r.net_salary),

        total_incentives: totalIncentives,
        total_deductions: totalDeductions,

        deductions,
        incentives,

        salary_history: [
          {
            pay_month: r.pay_month,
            pay_year: r.pay_year,
            payment_status: r.payment_status,
            credited_on: r.credited_on
              ? new Date(r.credited_on).toISOString().split("T")[0]
              : null,
            bank_name: r.bank_name,
            net_salary: Number(r.net_salary),
            payslip_url
          }
        ]
      }
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Payroll API error", error);
    res.status(500).json({ message: "Failed to fetch payroll data" });
  }
};
