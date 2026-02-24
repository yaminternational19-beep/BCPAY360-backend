import db from "../../models/db.js";
import dayjs from "dayjs";
// src/services/payroll/payroll.service.js

export const getEmployeesForPayroll = async (companyId, month, year) => {
  const startDate = dayjs(`${year}-${month}-01`).startOf("month").format("YYYY-MM-DD");
  const endDate = dayjs(startDate).endOf("month").format("YYYY-MM-DD");
  const daysInMonth = dayjs(startDate).daysInMonth();

  /* ===============================
     1️⃣ ACTIVE EMPLOYEES
     =============================== */

  const [employees] = await db.query(`
    SELECT
      e.id AS employee_id,
      e.employee_code,
      e.full_name,
      e.phone,
      e.joining_date,
      e.salary AS base_salary,
      e.branch_id,
       e.department_id,

      d.department_name,

      ep.bank_name,
      ep.account_number,
      ep.ifsc_code,

      COALESCE(uan.uan_number, '-') AS uan_number
    FROM employees e
    JOIN departments d ON d.id = e.department_id
    LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
    LEFT JOIN (
      SELECT employee_id, MAX(document_number) AS uan_number
      FROM employee_documents
      WHERE document_type = 'UAN'
      GROUP BY employee_id
    ) uan ON uan.employee_id = e.id
    WHERE e.company_id = ?
      AND e.employee_status = 'ACTIVE'
      AND e.joining_date <= ?
    ORDER BY e.employee_code
  `, [companyId, endDate]);

  if (!employees.length) return [];

  const empIds = employees.map(e => e.employee_id);
  const placeholders = empIds.map(() => "?").join(",");

  /* ===============================
     2️⃣ ATTENDANCE (MONTH ONLY)
     =============================== */

  const [attendance] = await db.query(`
    SELECT
      employee_id,
      SUM(
        CASE
          WHEN status IN ('CHECKED_IN','CHECKED_OUT','LATE') THEN 1
          WHEN status = 'HALF_DAY' THEN 0.5
          ELSE 0
        END
      ) AS present_days,
      SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) AS late_days,
      SUM(overtime_minutes) AS ot_minutes
    FROM attendance
    WHERE company_id = ?
      AND attendance_date BETWEEN ? AND ?
      AND employee_id IN (${placeholders})
    GROUP BY employee_id
  `, [companyId, startDate, endDate, ...empIds]);

  /* ===============================
     3️⃣ PAID LEAVES
     =============================== */

  const [leaves] = await db.query(`
    SELECT
      elr.employee_id,
      SUM(elr.total_days) AS leave_days
    FROM employee_leave_requests elr
    JOIN leave_master lm ON lm.id = elr.leave_master_id
    WHERE elr.company_id = ?
      AND elr.status = 'APPROVED'
      AND lm.is_paid = 1
      AND elr.from_date <= ?
      AND elr.to_date >= ?
      AND elr.employee_id IN (${placeholders})
    GROUP BY elr.employee_id
  `, [companyId, endDate, startDate, ...empIds]);

  /* ===============================
     4️⃣ PAYROLL STATUS (MONTH)
     =============================== */

  const [payroll] = await db.query(`
    SELECT
      pee.employee_id,
      pee.payment_status
    FROM payroll_batches pb
    JOIN payroll_employee_entries pee ON pee.payroll_batch_id = pb.id
    WHERE pb.company_id = ?
      AND pb.pay_month = ?
      AND pb.pay_year = ?
  `, [companyId, month, year]);

  /* ===============================
     5️⃣ MAP & MERGE
     =============================== */

  const attMap = toMap(attendance);
  const leaveMap = toMap(leaves);
  const payMap = toMap(payroll);

  return employees.map(emp => {
    const att = attMap[emp.employee_id] || {};
    const lv = leaveMap[emp.employee_id] || {};
    const pay = payMap[emp.employee_id];

    const present = Number(att.present_days || 0);
    const leave = Number(lv.leave_days || 0);
    const payable = present + leave;

    return {
      employee_id: emp.employee_id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      phone: emp.phone,
      branch_id: emp.branch_id,
  department_id: emp.department_id,
  department_name: emp.department_name,

      uan_number: emp.uan_number,
      base_salary: emp.base_salary,

      working_days: daysInMonth,
      present_days: present,
      leave_days: leave,
      late_days: Number(att.late_days || 0),
      ot_hours: Math.floor((att.ot_minutes || 0) / 60),

      absent_days: Math.max(daysInMonth - payable, 0),

      bank_name: emp.bank_name || "NA",
      account_number: emp.account_number || "NA",
      ifsc_code: emp.ifsc_code || "NA",

      payment_status: pay
        ? pay.payment_status
        : "NOT_GENERATED"
    };
  });
};



/* ===================== HELPERS ===================== */

function toMap(rows) {
  return Object.fromEntries(rows.map(r => [r.employee_id, r]));
}









export const createPayrollDraft = async ({
  companyId,
  month,
  year,
  employees,
  createdByRole,
  createdById
}) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [batch] = await conn.query(`
      INSERT INTO payroll_batches 
      (company_id, pay_month, pay_year, created_by_role, created_by_id)
      VALUES (?, ?, ?, ?, ?)
    `, [companyId, month, year, createdByRole, createdById]);

    for (const emp of employees) {
      // Fetch derived data
      const [[e]] = await conn.query(`
        SELECT salary FROM employees WHERE id = ?
      `, [emp.employee_id]);

      const gross = e.salary + emp.incentive;
      const net = gross - emp.other_deductions;

      await conn.query(`
        INSERT INTO payroll_employee_entries (
          payroll_batch_id,
          employee_id,
          base_salary,
          incentive,
          other_deductions,
          gross_salary,
          net_salary,
          present_days,
          late_days,
          leave_days,
          ot_hours
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
      `, [
        batch.insertId,
        emp.employee_id,
        e.salary,
        emp.incentive,
        emp.other_deductions,
        gross,
        net
      ]);
    }

    await conn.commit();
    return batch.insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
