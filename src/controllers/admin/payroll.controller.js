

// src/controllers/admin/payroll.controller.js

import db from "../../models/db.js";
import * as PayrollService from "../../services/payroll/payroll.service.js";
import dayjs from "dayjs";
import { processEmployeePayslip } from "../../services/payroll/payslip.service.js";
import { sendSalaryEmail } from "../../mail/index.js";

import { calculateSalary } from "../../services/payroll/salaryCalculator.js";
import { TABLES } from "../../utils/tableNames.js";
import { sendNotification } from "../../utils/oneSignal.js";

// src/controllers/admin/payroll.controller.js

export const getPayrollEmployees = async (req, res) => {
  try {
    const { month, year, page = 1, limit = 10 } = req.query;
    const companyId = req.user.company_id;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and Year required" });
    }

    const result = await PayrollService.getEmployeesForPayroll(
      companyId,
      Number(month),
      Number(year),
      Number(page),
      Number(limit)
    );

    res.json(result);

  } catch (err) {
    console.error("PAYROLL EMP ERROR:", err);
    res.status(500).json({ message: "Failed to fetch payroll employees" });
  }
};


export const generatePayroll = async (req, res) => {
  const { pay_month, pay_year, employees } = req.body;

  const companyId = req.user.company_id;
  const createdByRole = req.user.role;
  const createdById = req.user.id;

  const payMonth = Number(pay_month);
  const payYear = Number(pay_year);

  if (!payMonth || !payYear || !Array.isArray(employees) || !employees.length) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const daysInMonth = new Date(payYear, payMonth, 0).getDate();

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* 🔒 Verify employee ownership */
    const employeeIds = employees.map(e => e.employee_id);
    const [ownership] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM ${TABLES.EMPLOYEES}
       WHERE id IN (?) AND company_id = ?`,
      [employeeIds, companyId]
    );

    if (ownership[0].count !== employees.length) {
      throw new Error("One or more employees do not belong to your company");
    }

    /* 1️⃣ Create or reuse DRAFT batch */
    const [batch] = await conn.query(
      `
      INSERT INTO payroll_batches
      (company_id, pay_month, pay_year, created_by_role, created_by_id)
      VALUES (?, ?, ?, ?, ?)

      ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
      `,
      [companyId, payMonth, payYear, createdByRole, createdById]
    );

    const payrollBatchId = batch.insertId;

    let inserted = 0;
    let updated = 0;

    /* 2️⃣ Insert / Update payroll entries */
    for (const emp of employees) {
      const salary = calculateSalary({
        baseSalary: Number(emp.base_salary),
        presentDays: Number(emp.present_days),
        leaveDays: Number(emp.leave_days),
        otHours: Number(emp.ot_hours),
        incentive: Number(emp.incentive || 0),
        otherDeductions: Number(emp.other_deductions || 0),
        totalWorkingDays: daysInMonth,
        pfApplicable: Number(emp.pf_applicable || 0)
      });

      if (!Number.isFinite(salary.netSalary)) {
        throw new Error(`Salary calculation failed for employee ${emp.employee_id}`);
      }

      const [result] = await conn.query(
  `
  INSERT INTO payroll_employee_entries (
    payroll_batch_id,
    employee_id,
    base_salary,
    present_days,
    late_days,
    leave_days,
    ot_hours,
    incentive,
    bonus,
    other_deductions,
    pf_applicable,
    pf_amount,
    gross_salary,
    net_salary
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    base_salary = VALUES(base_salary),
    present_days = VALUES(present_days),
    late_days = VALUES(late_days),
    leave_days = VALUES(leave_days),
    ot_hours = VALUES(ot_hours),
    incentive = VALUES(incentive),
    bonus = VALUES(bonus),
    other_deductions = VALUES(other_deductions),
    pf_applicable = VALUES(pf_applicable),
    pf_amount = VALUES(pf_amount),
    gross_salary = VALUES(gross_salary),
    net_salary = VALUES(net_salary)
  `,
  [
    payrollBatchId,
    emp.employee_id,
    salary.earnedBasic,
    emp.present_days || 0,
    emp.late_days || 0,
    emp.leave_days || 0,
    emp.ot_hours || 0,
    salary.incentive,
    salary.bonus || 0,
    salary.otherDeductions,
    salary.pfApplicable,
    salary.pfAmount,
    salary.grossSalary,
    salary.netSalary
  ]
);


      result.affectedRows === 1 ? inserted++ : updated++;
    }

    await conn.commit();

    res.json({
      payroll_batch_id: payrollBatchId,
      status: "DRAFT",
      inserted,
      updated
    });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.message });
  } finally {
    conn.release();
  }
};


export const getPayrollSlipPreview = async (req, res) => {
  const companyId = req.user.company_id;
  const { pay_month, pay_year, page = 1, limit = 10 } = req.query;

  if (!pay_month || !pay_year) {
    return res.status(400).json({
      message: "pay_month and pay_year required"
    });
  }

  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);
  const offset = (parsedPage - 1) * parsedLimit;

  try {
    /* 1️⃣ Fetch payroll batch */
    const [[batch]] = await db.query(
      `
      SELECT id, pay_month, pay_year
      FROM payroll_batches
      WHERE company_id = ?
        AND pay_month = ?
        AND pay_year = ?
      `,
      [companyId, pay_month, pay_year]
    );

    if (!batch) {
      return res.json({
        batch: null,
        employees: [],
        meta: {
          total: 0,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: 0
        },
        message: "No payroll generated yet"
      });
    }

    /* 2️⃣ Get total count */
    const [[{ total }]] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM payroll_employee_entries
      WHERE payroll_batch_id = ?
        AND payment_status = 'PENDING'
      `,
      [batch.id]
    );

    /* 3️⃣ Fetch paginated employees */
    const [employees] = await db.query(
      `
      SELECT
        pee.id AS payroll_entry_id,
        e.id AS employee_id,
        e.employee_code,
        e.full_name,
        e.email,

        d.department_name AS department,
        g.designation_name AS designation,

        ep.bank_name,
        ep.account_number,
        ep.ifsc_code,

        pee.base_salary,
        pee.incentive,
        pee.bonus,
        pee.other_deductions,

        pee.pf_applicable,
        pee.pf_amount,

        pee.gross_salary,
        pee.net_salary,

        pee.payment_status
      FROM payroll_employee_entries pee
      JOIN employees e ON e.id = pee.employee_id
      JOIN departments d ON d.id = e.department_id
      JOIN designations g ON g.id = e.designation_id
      LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
      WHERE pee.payroll_batch_id = ?
        AND pee.payment_status = 'PENDING'
      ORDER BY e.employee_code
      LIMIT ? OFFSET ?
      `,
      [batch.id, parsedLimit, offset]
    );

    return res.json({
      batch,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit),
        count: employees.length
      },
      employees
    });

  } catch (err) {
    console.error("PAYROLL SLIP PREVIEW ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch payroll slip preview"
    });
  }
};




export const confirmPayrollBatch = async (req, res) => {
  const { payMonth, payYear, employeeIds = [], action } = req.body;
  const companyId = req.user.company_id;

  if (action !== "CONFIRM") {
    return res.status(400).json({
      message: "Invalid action. Use CONFIRM."
    });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* =========================================
       1️⃣ Fetch Payroll Batch
    ========================================= */
    const [[batch]] = await conn.query(
      `
      SELECT id
      FROM payroll_batches
      WHERE company_id = ?
        AND pay_month = ?
        AND pay_year = ?
      FOR UPDATE
      `,
      [companyId, payMonth, payYear]
    );

    if (!batch) {
      throw new Error("Payroll batch not found");
    }

    /* =========================================
       2️⃣ Fetch Pending Employees
    ========================================= */
    const [entries] = await conn.query(
      `
      SELECT 
        pee.id,
        pee.employee_id,
        e.email,
        e.full_name
      FROM payroll_employee_entries pee
      JOIN employees e ON e.id = pee.employee_id
      WHERE pee.payroll_batch_id = ?
        AND pee.payment_status = 'PENDING'
        ${employeeIds.length ? "AND pee.employee_id IN (?)" : ""}
      `,
      employeeIds.length
        ? [batch.id, employeeIds]
        : [batch.id]
    );

    if (entries.length === 0) {
      await conn.rollback();
      return res.json({
        message: "No pending salaries to process",
        processed: 0
      });
    }

    /* =========================================
       3️⃣ Mark As SUCCESS
    ========================================= */
    for (const row of entries) {
      await conn.query(
        `
        UPDATE payroll_employee_entries
        SET payment_status = 'SUCCESS',
            paid_at = NOW()
        WHERE id = ?
        `,
        [row.id]
      );
    }

    await conn.commit();

    /* =========================================
       4️⃣ Send Emails + Notifications (AFTER COMMIT)
    ========================================= */

    const monthName = dayjs(
      `${payYear}-${payMonth}-01`
    ).format("MMMM YYYY");

    for (const row of entries) {

      // 📧 Salary Email (non-blocking)
      setImmediate(() => {
        sendSalaryEmail({
          to: row.email,
          name: row.full_name,
          month: payMonth,
          year: payYear
        });
      });

      // 🔔 In-App + Push Notification
      await sendNotification({
        company_id: companyId,
        user_type: "EMPLOYEE",
        user_id: row.employee_id,
        title: `Salary Credited – ${monthName}`,
        message: `Your salary for ${monthName} has been successfully credited.`,
        notification_type: "PAYROLL",
        reference_type: "PAYROLL_BATCH",
        reference_id: batch.id,
        action_url: `/employee/payroll/${payYear}/${payMonth}`
      });
    }

    return res.json({
      message: "Payroll processed successfully",
      processed: entries.length
    });

  } catch (err) {
    await conn.rollback();
    return res.status(400).json({
      message: err.message
    });
  } finally {
    conn.release();
  }
};


