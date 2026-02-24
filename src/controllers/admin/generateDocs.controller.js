import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "GENERATE_DOCS_CONTROLLER";

/**
 * GET company government form (latest active version)
 * Used for:
 *  - Form preview
 *  - Document generation (Form-11, Form-12, Form-16, etc.)
 * 
 * NOTE: Forms are now DB-driven metadata entities.
 * Frontend should render forms based on form_code.
 */

export const getCompanyGovernmentForm = async (req, res) => {
  const { formCode } = req.params;
  const { company_id, role } = req.user;

  if (!formCode) {
    return res.status(400).json({
      success: false,
      message: "Form code is required"
    });
  }

  try {
    const [rows] = await db.query(
      `
      SELECT
        id,
        company_id,
        form_code,
        form_name,
        period_type,
        category,
        is_employee_specific,
        description,
        version,
        status,
        uploaded_by_role,
        uploaded_by_id,
        created_at,
        updated_at
      FROM company_government_forms
      WHERE company_id = ?
        AND form_code = ?
        AND status = 'ACTIVE'
      ORDER BY version DESC, created_at DESC
      LIMIT 1
      `,
      [company_id, formCode]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Form not found or inactive"
      });
    }

    if (role === "EMPLOYEE") {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const form = rows[0];

    return res.status(200).json({
      success: true,
      data: {
        id: form.id,
        formCode: form.form_code,
        formName: form.form_name,
        periodType: form.period_type,
        category: form.category,
        isEmployeeSpecific: Boolean(form.is_employee_specific),
        description: form.description,
        version: form.version,
        status: form.status,
        audit: {
          uploadedByRole: form.uploaded_by_role,
          uploadedById: form.uploaded_by_id,
          createdAt: form.created_at,
          updatedAt: form.updated_at
        }
      }
    });
  } catch (error) {
    logger.error(MODULE_NAME, "Error fetching government form", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch government form"
    });
  }
};


/**
 * Employee Summary Controller
 * - Lifetime data by default
 * - Monthly filtered data if month/year provided
 */

export const getEmployeeSummary = async (req, res) => {
  const { employeeId } = req.params;
  const { month, year } = req.query;
  const { company_id } = req.user;

  if (!employeeId) {
    return res.status(400).json({
      success: false,
      message: "employeeId is required"
    });
  }

  const isMonthly = month && year;

  try {
    /* =================================================
       1. EMPLOYEE + PROFILE + ORG
    ================================================= */
    const [[employee]] = await db.query(
      `
      SELECT
        e.id,
        e.employee_code,
        e.full_name,
        e.email,
        e.phone,
        e.employee_status,
        e.joining_date,
        e.confirmation_date,
        e.salary,
        e.ctc_annual,

        p.gender,
        p.dob,
        p.marital_status,
        p.aadhaar_number,
        p.pan_number,
        p.uan_number,
        p.esic_number,

        b.branch_name,
        d.department_name,
        des.designation_name
      FROM employees e
      LEFT JOIN employee_profiles p ON p.employee_id = e.id
      JOIN branches b ON b.id = e.branch_id
      JOIN departments d ON d.id = e.department_id
      JOIN designations des ON des.id = e.designation_id
      WHERE e.id = ?
        AND e.company_id = ?
      `,
      [employeeId, company_id]
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    /* =================================================
       2. ATTENDANCE SUMMARY
    ================================================= */
    const attendanceWhere = isMonthly
      ? `AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`
      : "";

    const attendanceParams = isMonthly
      ? [employeeId, month, year]
      : [employeeId];

    const [[attendance]] = await db.query(
      `
      SELECT
        COUNT(*) AS total_days,
        SUM(
          CASE
            WHEN status IN ('CHECKED_IN','CHECKED_OUT','LATE') THEN 1
            WHEN status = 'HALF_DAY' THEN 0.5
            ELSE 0
          END
        ) AS present_days,
        SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
        SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) AS late_days,
        SUM(overtime_minutes) AS overtime_minutes
      FROM attendance
      WHERE employee_id = ?
      ${attendanceWhere}
      `,
      attendanceParams
    );

    /* =================================================
       3. PAID LEAVE SUMMARY
    ================================================= */
    const leaveWhere = isMonthly
      ? `AND elr.from_date <= LAST_DAY(?) AND elr.to_date >= ?`
      : "";

    const leaveParams = isMonthly
      ? [employeeId, `${year}-${month}-01`, `${year}-${month}-01`]
      : [employeeId];

    const [leaves] = await db.query(
      `
      SELECT
        lm.leave_name,
        SUM(elr.total_days) AS total_days
      FROM employee_leave_requests elr
      JOIN leave_master lm ON lm.id = elr.leave_master_id
      WHERE elr.employee_id = ?
        AND elr.status = 'APPROVED'
        AND lm.is_paid = 1
      ${leaveWhere}
      GROUP BY lm.leave_name
      `,
      leaveParams
    );

    /* =================================================
       4. PAYROLL (JOIN payroll_batches)
    ================================================= */
    const payrollWhere = isMonthly
      ? `AND pb.pay_month = ? AND pb.pay_year = ?`
      : "";

    const payrollParams = isMonthly
      ? [employeeId, month, year]
      : [employeeId];

    const [[payroll]] = await db.query(
      `
      SELECT
        pee.base_salary,
        pee.present_days,
        pee.leave_days,
        pee.ot_hours,
        pee.pf_amount,
        pee.incentive,
        pee.other_deductions,
        pee.gross_salary,
        pee.net_salary,
        pee.payment_status,
        pb.pay_month,
        pb.pay_year
      FROM payroll_employee_entries pee
      JOIN payroll_batches pb ON pb.id = pee.payroll_batch_id
      WHERE pee.employee_id = ?
      ${payrollWhere}
      ORDER BY pb.pay_year DESC, pb.pay_month DESC
      LIMIT 1
      `,
      payrollParams
    );

    /* =================================================
       FINAL RESPONSE
    ================================================= */
    return res.status(200).json({
      success: true,
      scope: isMonthly ? "MONTHLY" : "LIFETIME",
      filter: isMonthly ? { month, year } : null,

      employee,
      attendance: attendance || {
        total_days: 0,
        present_days: 0,
        absent_days: 0,
        late_days: 0,
        overtime_minutes: 0
      },
      leaves,
      payroll: payroll || null
    });
  } catch (error) {
    logger.error(MODULE_NAME, "Employee summary error", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employee summary"
    });
  }
};


