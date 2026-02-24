import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "ADMIN_DASHBOARD_CONTROLLER";

export const getDashboard = async (req, res) => {
  try {
    const { company_id, role, id: user_id } = req.user;
    const period = req.query.period || "TODAY";

    /* =====================================================
       DATE RANGE
    ===================================================== */
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let fromDate = new Date(today);
    let toDate = new Date(today);

    if (period === "WEEK") {
      fromDate.setDate(today.getDate() - 6);
    } else if (period === "MONTH") {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === "YEAR") {
      fromDate = new Date(today.getFullYear(), 0, 1);
    }

    const fromDateSQL = fromDate.toISOString().slice(0, 10);
    const toDateSQL = toDate.toISOString().slice(0, 10);

    /* =====================================================
       COMPANY
    ===================================================== */
    const [[company]] = await db.query(
      `SELECT id, name FROM companies WHERE id = ?`,
      [company_id]
    );

    /* =====================================================
       ALL BRANCHES (SOURCE OF TRUTH)
    ===================================================== */
    const [branches] = await db.query(
      `SELECT id, branch_name FROM branches WHERE company_id = ?`,
      [company_id]
    );

    /* =====================================================
       EMPLOYEES + SHIFT
    ===================================================== */
    const [employees] = await db.query(
      `
      SELECT
        e.id,
        e.branch_id,
        e.employee_status,
        e.joining_date,
        s.end_time AS shift_end_time
      FROM employees e
      LEFT JOIN shifts s ON s.id = e.shift_id
      WHERE e.company_id = ?
      `,
      [company_id]
    );

    /* =====================================================
       BRANCH MAP (INITIALIZE ALL BRANCHES)
    ===================================================== */
    const branchMap = {};
    for (const b of branches) {
      branchMap[b.id] = {
        branch_id: b.id,
        branch_name: b.branch_name,
        total: 0,
        active: 0,
        inactive: 0,
        employees: []
      };
    }

    for (const e of employees) {
      const b = branchMap[e.branch_id];
      if (!b) continue;

      b.total++;
      if (e.employee_status === "ACTIVE") b.active++;
      else b.inactive++;

      b.employees.push(e);
    }

    /* =====================================================
       HOLIDAYS
    ===================================================== */
    const [holidays] = await db.query(
      `
      SELECT
        branch_id,
        DATE_FORMAT(holiday_date,'%Y-%m-%d') AS holiday_date
      FROM branch_holidays
      WHERE company_id = ?
        AND is_active = 1
        AND applies_to_attendance = 1
        AND holiday_date BETWEEN ? AND ?
      `,
      [company_id, fromDateSQL, toDateSQL]
    );

    const holidayMap = {};
    for (const h of holidays) {
      if (!holidayMap[h.branch_id]) {
        holidayMap[h.branch_id] = new Set();
      }
      holidayMap[h.branch_id].add(h.holiday_date);
    }

    /* =====================================================
       ATTENDANCE RECORDS
    ===================================================== */
    const [attendanceRows] = await db.query(
      `
      SELECT
        employee_id,
        DATE_FORMAT(attendance_date,'%Y-%m-%d') AS d,
        status
      FROM attendance
      WHERE attendance_date BETWEEN ? AND ?
      `,
      [fromDateSQL, toDateSQL]
    );

    const attendanceMap = {};
    for (const a of attendanceRows) {
      attendanceMap[`${a.employee_id}_${a.d}`] = a.status;
    }

    /* =====================================================
       ATTENDANCE CALCULATION
    ===================================================== */
    const attendanceBranches = [];
    const companyAttendance = {
      total: 0,
      present: 0,
      absent: 0,
      unmarked: 0
    };

    const daysInRange =
      Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

    for (const branch of Object.values(branchMap)) {
      const totals = {
        branch_id: branch.branch_id,
        branch_name: branch.branch_name,
        total: 0,
        present: 0,
        absent: 0,
        unmarked: 0
      };

      for (const emp of branch.employees) {
        const joiningDate = emp.joining_date
          ? new Date(emp.joining_date)
          : null;
        if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

        for (let i = 0; i < daysInRange; i++) {
          const d = new Date(fromDate);
          d.setDate(fromDate.getDate() + i);
          d.setHours(0, 0, 0, 0);

          const dateKey = d.toISOString().slice(0, 10);

          if (joiningDate && d < joiningDate) continue;

          totals.total++;
          companyAttendance.total++;

          /* HOLIDAY */
          if (
            holidayMap[branch.branch_id] &&
            holidayMap[branch.branch_id].has(dateKey)
          ) {
            continue;
          }

          /* FUTURE */
          if (d > today) {
            totals.unmarked++;
            companyAttendance.unmarked++;
            continue;
          }

          /* TODAY – SHIFT NOT COMPLETED */
          if (d.getTime() === today.getTime()) {
            let shiftEnd = new Date(d);
            if (emp.shift_end_time) {
              const [h, m] = emp.shift_end_time.split(":");
              shiftEnd.setHours(h, m, 0, 0);
            } else {
              shiftEnd.setHours(23, 59, 59, 999);
            }

            if (now < shiftEnd) {
              totals.unmarked++;
              companyAttendance.unmarked++;
              continue;
            }
          }

          /* FINAL STATUS */
          const status = attendanceMap[`${emp.id}_${dateKey}`];
          if (status && status !== "ABSENT" && status !== "NOT_STARTED") {
            totals.present++;
            companyAttendance.present++;
          } else {
            totals.absent++;
            companyAttendance.absent++;
          }
        }
      }

      attendanceBranches.push(totals);
    }

    /* =====================================================
       LEAVE PENDING
    ===================================================== */
    const [[{ pending }]] = await db.query(
      `
      SELECT COUNT(*) AS pending
      FROM employee_leave_requests
      WHERE company_id = ?
        AND status = 'PENDING'
      `,
      [company_id]
    );

    /* =====================================================
       SALARY (CURRENT MONTH)
    ===================================================== */
    const [[salaryCompany]] = await db.query(
      `
      SELECT
        COUNT(pee.id) AS employees_paid,
        SUM(pee.net_salary) AS total_salary
      FROM payroll_employee_entries pee
      JOIN payroll_batches pb ON pb.id = pee.payroll_batch_id
      WHERE pb.company_id = ?
        AND pb.pay_month = MONTH(CURDATE())
        AND pb.pay_year = YEAR(CURDATE())
      `,
      [company_id]
    );

    /* =====================================================
       RESPONSE
    ===================================================== */
    res.json({
      success: true,
      company,
      logged_in: { role, user_id },
      period,

      employees: {
        company_total: {
          total: employees.length,
          active: employees.filter(e => e.employee_status === "ACTIVE").length,
          inactive: employees.filter(e => e.employee_status === "INACTIVE").length
        },
        branches: Object.values(branchMap).map(b => ({
          branch_id: b.branch_id,
          branch_name: b.branch_name,
          total: b.total,
          active: b.active,
          inactive: b.inactive
        }))
      },

      attendance: {
        company_total: companyAttendance,
        branches: attendanceBranches
      },

      leave_pending: {
        company_total: Number(pending || 0)
      },

      salary: {
        company_total: {
          employees_paid: Number(salaryCompany?.employees_paid || 0),
          total_salary: Number(salaryCompany?.total_salary || 0)
        }
      }
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Dashboard failed", err);
    res.status(500).json({
      success: false,
      message: "Dashboard failed"
    });
  }
};
