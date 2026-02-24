import db from "../../models/db.js";

// src/services/payroll/payslip.service.js

/**
 * Store payslip + payment logs
 */
export const processEmployeePayslip = async ({
  conn,
  row,
  batch
}) => {
  // 1️⃣ Check for existing record
  const [[existing]] = await conn.query(`
    SELECT id FROM employee_payslips
    WHERE payroll_employee_entry_id = ?
  `, [row.id]);

  if (existing) {
    throw new Error(`Payslip record already exists for ${row.employee_code}`);
  }

  // 2️⃣ Insert minimal record into employee_payslips (No storage logic)
  await conn.query(`
    INSERT INTO employee_payslips (
      payroll_employee_entry_id,
      pay_month,
      pay_year,
      email_sent
    ) VALUES (?, ?, ?, 0)
  `, [
    row.id,
    batch.pay_month,
    batch.pay_year
  ]);

  // 3️⃣ Payment log
  await conn.query(`
    INSERT INTO payroll_payment_logs (
      payroll_employee_entry_id,
      bank_name,
      account_number,
      status,
      message
    ) VALUES (?, ?, ?, 'SUCCESS', 'Salary credited')
  `, [
    row.id,
    row.bank_name,
    row.account_number
  ]);

  // 4️⃣ Update entry status
  await conn.query(`
    UPDATE payroll_employee_entries
    SET payment_status = 'SUCCESS'
    WHERE id = ?
  `, [row.id]);
};
