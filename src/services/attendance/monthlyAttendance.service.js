import db from "../../models/db.js";

export const getMonthlyAttendance = async ({
  companyId,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
  search = "",
  departmentId = "",
  shiftId = ""
}) => {
  if (!fromDate || !toDate) {
    throw new Error("fromDate and toDate are required");
  }

  const offset = (page - 1) * limit;

  /* ================= DATE HELPERS ================= */

  const formatDate = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDate(today);

  const start = new Date(fromDate);
  const end = new Date(toDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (start > end) {
    throw new Error("Invalid date range");
  }

  const totalDays =
    Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

  /* ================= FILTER ================= */

  const conditions = [];
  const values = [companyId];

  if (search) {
    conditions.push(`(e.full_name LIKE ? OR e.employee_code LIKE ?)`);
    values.push(`%${search}%`, `%${search}%`);
  }

  if (departmentId) {
    conditions.push(`e.department_id = ?`);
    values.push(departmentId);
  }

  if (shiftId) {
    conditions.push(`e.shift_id = ?`);
    values.push(shiftId);
  }

  const whereClause =
    conditions.length ? " AND " + conditions.join(" AND ") : "";

  /* ================= EMPLOYEES ================= */

  const [employees] = await db.query(
    `
    SELECT
      e.id AS employee_id,
      e.employee_code,
      e.full_name,
      DATE_FORMAT(e.joining_date,'%Y-%m-%d') AS joining_date,
      e.branch_id,
      ep.profile_photo_path,
      dept.department_name AS department,
      sh.shift_name
    FROM employees e
    LEFT JOIN departments dept ON dept.id = e.department_id
    LEFT JOIN shifts sh ON sh.id = e.shift_id
    LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
    WHERE e.company_id = ?
      ${whereClause}
    ORDER BY e.employee_code
    LIMIT ? OFFSET ?
    `,
    [...values, Number(limit), offset]
  );

  if (!employees.length) {
    return {
      viewType: "MONTHLY",
      fromDate,
      toDate,
      data: [],
      pagination: { page, limit, total_records: 0 }
    };
  }

  const employeeIds = employees.map(e => e.employee_id);

  /* ================= HOLIDAYS ================= */

  const [holidayRows] = await db.query(
    `
    SELECT branch_id,
           DATE_FORMAT(holiday_date,'%Y-%m-%d') AS holiday_date
    FROM branch_holidays
    WHERE company_id = ?
      AND holiday_date BETWEEN ? AND ?
      AND is_active = 1
      AND applies_to_attendance = 1
    `,
    [companyId, fromDate, toDate]
  );

  const holidayMap = {};
  holidayRows.forEach(row => {
    if (!holidayMap[row.branch_id]) {
      holidayMap[row.branch_id] = new Set();
    }
    holidayMap[row.branch_id].add(row.holiday_date);
  });

  /* ================= ATTENDANCE ================= */

  const [attendanceRows] = await db.query(
    `
    SELECT
      employee_id,
      DATE_FORMAT(attendance_date,'%Y-%m-%d') AS attendance_date,
      check_in_time
    FROM attendance
    WHERE employee_id IN (?)
      AND attendance_date BETWEEN ? AND ?
    `,
    [employeeIds, fromDate, toDate]
  );

  const attendanceMap = {};
  attendanceRows.forEach(row => {
    attendanceMap[
      `${row.employee_id}_${row.attendance_date}`
    ] = row;
  });

  /* ================= BUILD MONTHLY ================= */

  const data = employees.map((emp, index) => {
    const days = {};
    const totals = {
      present: 0,
      absent: 0,
      holiday: 0,
      unmarked: 0
    };

    const joiningDateStr = emp.joining_date;

    for (let i = 0; i < totalDays; i++) {
      const current = new Date(start);
      current.setDate(start.getDate() + i);

      const dateStr = formatDate(current);
      const dayNumber = current.getDate();

      let value;

      // BEFORE JOINING
      if (dateStr < joiningDateStr) {
        value = "-";
      }

      // FUTURE
      else if (dateStr > todayStr) {
        value = "U";
        totals.unmarked++;
      }

      // HOLIDAY
      else if (
        holidayMap[emp.branch_id] &&
        holidayMap[emp.branch_id].has(dateStr)
      ) {
        value = "H";
        totals.holiday++;
      }

      // ATTENDANCE EXISTS
      else if (
        attendanceMap[`${emp.employee_id}_${dateStr}`]
      ) {
        const record =
          attendanceMap[`${emp.employee_id}_${dateStr}`];

        // 🔥 TRUE PRESENT CHECK
        if (record.check_in_time) {
          value = "P";
          totals.present++;
        } else {
          value = "A";
          totals.absent++;
        }
      }

      // NO RECORD
      else {
        value = "A";
        totals.absent++;
      }

      days[dayNumber] = value;
    }

    return {
      sl_no: offset + index + 1,
      employee_id: emp.employee_id,
      employee_code: emp.employee_code,
      name: emp.full_name,
      profile_photo: emp.profile_photo_path || null,
      department: emp.department || "-",
      shift: emp.shift_name || "-",
      days,
      totals
    };
  });

  /* ================= COUNT ================= */

  const [[{ total_records }]] = await db.query(
    `
    SELECT COUNT(*) AS total_records
    FROM employees e
    WHERE e.company_id = ?
      ${whereClause}
    `,
    values
  );

  return {
    viewType: "MONTHLY",
    fromDate,
    toDate,
    data,
    pagination: {
      page,
      limit,
      total_records
    }
  };
};