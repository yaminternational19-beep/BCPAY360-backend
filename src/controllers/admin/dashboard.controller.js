import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "ADMIN_DASHBOARD_CONTROLLER";

export const getDashboard = async (req, res) => {
  // console.time("DASHBOARD");

  try {
    const { company_id, role, id: user_id } = req.user;
    const period = req.query.period || "TODAY";

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let fromDate = new Date(today);

    if (period === "WEEK") {
      fromDate.setDate(today.getDate() - 6);
    } else if (period === "MONTH") {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === "YEAR") {
      fromDate = new Date(today.getFullYear(), 0, 1);
    }

    const fromDateSQL = fromDate.toISOString().slice(0, 10);
    const todaySQL = today.toISOString().slice(0, 10);

    /* ================= PARALLEL QUERIES ================= */

    const [
      companyRes,
      orgRes,
      employeeRes,
      leaveRes,
      salaryRes,
      branchListRes,
      branchEmpRes,
      branchSalaryRes
    ] = await Promise.all([

      // Company
      db.query(
        `SELECT id, name FROM companies WHERE id = ?`,
        [company_id]
      ),

      // Organization Summary
      db.query(`
        SELECT
          (SELECT COUNT(*) FROM branches WHERE company_id = ?) AS total_branches,
          (SELECT COUNT(*) FROM departments WHERE company_id = ?) AS total_departments,
          (SELECT COUNT(*) FROM designations WHERE company_id = ?) AS total_designations,
          (SELECT COUNT(*) FROM hr_users WHERE company_id = ?) AS total_hrs
      `, [company_id, company_id, company_id, company_id]),

      // Employee Summary
      db.query(`
        SELECT
          COUNT(*) AS total,
          SUM(employee_status='ACTIVE') AS active,
          SUM(employee_status='INACTIVE') AS inactive
        FROM employees
        WHERE company_id = ?
      `, [company_id]),

      // Leave
      db.query(`
        SELECT
          SUM(status='PENDING') AS approval_pending,
          SUM(DATE(from_date)=CURDATE()) AS today
        FROM employee_leave_requests
        WHERE company_id = ?
      `, [company_id]),

      // Salary
      db.query(`
        SELECT
          COUNT(DISTINCT pee.employee_id) AS employees_paid,
          SUM(pee.net_salary) AS total_paid
        FROM payroll_employee_entries pee
        JOIN payroll_batches pb ON pb.id = pee.payroll_batch_id
        WHERE pb.company_id = ?
        AND pb.pay_month = MONTH(CURDATE())
        AND pb.pay_year = YEAR(CURDATE())
      `, [company_id]),

      // Branch List
      db.query(
        `SELECT id, branch_name FROM branches WHERE company_id = ?`,
        [company_id]
      ),

      // Branch Employee Stats
      db.query(`
        SELECT
          branch_id,
          COUNT(*) AS total,
          SUM(employee_status='ACTIVE') AS active,
          SUM(employee_status='INACTIVE') AS inactive
        FROM employees
        WHERE company_id = ?
        GROUP BY branch_id
      `, [company_id]),

      // Branch Salary Stats
      db.query(`
        SELECT
          e.branch_id,
          COUNT(DISTINCT pee.employee_id) AS employees_paid,
          SUM(pee.net_salary) AS total_paid
        FROM payroll_employee_entries pee
        JOIN payroll_batches pb ON pb.id = pee.payroll_batch_id
        JOIN employees e ON e.id = pee.employee_id
        WHERE pb.company_id = ?
        AND pb.pay_month = MONTH(CURDATE())
        AND pb.pay_year = YEAR(CURDATE())
        GROUP BY e.branch_id
      `, [company_id])
    ]);

    /* ================= EXTRACT RESULTS ================= */

    const company = companyRes[0][0];
    const orgSummary = orgRes[0][0];
    const employeeStats = employeeRes[0][0];
    const leaveStats = leaveRes[0][0];
    const salaryStats = salaryRes[0][0];
    const branches = branchListRes[0];
    const branchEmployeeStats = branchEmpRes[0];
    const branchSalaryStats = branchSalaryRes[0];

    const totalEmployees = Number(employeeStats.total || 0);

    /* ================= ATTENDANCE ================= */

    let present = 0;
    let absent = 0;
    let unmarked = 0;

    if (period === "TODAY") {

      const [attendanceToday] = await db.query(`
        SELECT employee_id
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE e.company_id = ?
        AND DATE(a.attendance_date) = CURDATE()
      `, [company_id]);

      const checkedInIds = new Set(
        attendanceToday.map(a => a.employee_id)
      );

      const [employees] = await db.query(`
        SELECT e.id, s.end_time
        FROM employees e
        LEFT JOIN shifts s ON s.id = e.shift_id
        WHERE e.company_id = ?
      `, [company_id]);

      employees.forEach(emp => {

        if (checkedInIds.has(emp.id)) {
          present++;
        } else {
          const shiftEnd = new Date(today);
          if (emp.end_time) {
            const [h, m] = emp.end_time.split(":");
            shiftEnd.setHours(Number(h), Number(m), 0, 0);
          } else {
            shiftEnd.setHours(23, 59, 59, 999);
          }

          if (now < shiftEnd) {
            unmarked++;
          } else {
            absent++;
          }
        }
      });

    } else {

      const [[attendanceAgg]] = await db.query(`
        SELECT
          SUM(status NOT IN ('ABSENT','NOT_STARTED')) AS present,
          SUM(status='ABSENT') AS absent
        FROM attendance a
        JOIN employees e ON e.id = a.employee_id
        WHERE e.company_id = ?
        AND a.attendance_date BETWEEN ? AND ?
      `, [company_id, fromDateSQL, todaySQL]);

      present = Number(attendanceAgg.present || 0);
      absent = Number(attendanceAgg.absent || 0);
      unmarked = 0;
    }

    const presentPercentage =
      totalEmployees > 0
        ? Math.round((present / totalEmployees) * 100)
        : 0;

    /* ================= BRANCH BREAKDOWN ================= */

    const employeeMap = {};
    branchEmployeeStats.forEach(b => {
      employeeMap[b.branch_id] = b;
    });

    const salaryMap = {};
    branchSalaryStats.forEach(b => {
      salaryMap[b.branch_id] = b;
    });

    const branchBreakdown = branches.map(branch => {

      const emp = employeeMap[branch.id] || {};
      const sal = salaryMap[branch.id] || {};

      const total = Number(emp.total || 0);
      const paid = Number(sal.employees_paid || 0);

      return {
        branch_id: branch.id,
        branch_name: branch.branch_name,
        employees: {
          total,
          active: Number(emp.active || 0),
          inactive: Number(emp.inactive || 0)
        },
        salary: {
          employees_paid: paid,
          employees_remaining: total - paid,
          total_paid_amount: Number(sal.total_paid || 0),
          total_paid_formatted:
            `₹ ${Number(sal.total_paid || 0).toLocaleString("en-IN")}`
        }
      };
    });

    // console.timeEnd("DASHBOARD");

    /* ================= RESPONSE (UNCHANGED STRUCTURE) ================= */

    res.json({
      success: true,
      company: {
        id: company.id,
        name: company.name,
        logo_url: null
      },
      logged_in: { role, user_id },
      period,
      organization_summary: {
        total_branches: Number(orgSummary.total_branches || 0),
        total_departments: Number(orgSummary.total_departments || 0),
        total_designations: Number(orgSummary.total_designations || 0),
        total_hrs: Number(orgSummary.total_hrs || 0)
      },
      overview: {
        employees: {
          total: totalEmployees,
          active: Number(employeeStats.active || 0),
          inactive: Number(employeeStats.inactive || 0)
        },
        attendance: {
          present,
          absent,
          unmarked,
          present_percentage: presentPercentage
        },
        leave: {
          today: Number(leaveStats.today || 0),
          approval_pending: Number(leaveStats.approval_pending || 0)
        },
        salary: {
          employees_paid: Number(salaryStats.employees_paid || 0),
          employees_remaining:
            totalEmployees - Number(salaryStats.employees_paid || 0),
          total_paid_amount: Number(salaryStats.total_paid || 0),
          total_paid_formatted:
            `₹ ${Number(salaryStats.total_paid || 0)
              .toLocaleString("en-IN")}`
        }
      },
      branch_breakdown: branchBreakdown
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Dashboard failed", err);
    res.status(500).json({
      success: false,
      message: "Dashboard failed"
    });
  }
};