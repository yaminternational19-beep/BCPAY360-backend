import db from "../../models/db.js";
import { getS3SignedUrl } from "../../utils/s3Upload.util.js";

/**
 * HISTORY Attendance View (Admin)
 * Calendar-driven, branch-holiday aware, gapless
 */
export const getHistoryAttendance = async ({
  companyId,
  employeeId,
  from,
  to,
  page = 1,
  limit = 31
}) => {
  const offset = (page - 1) * limit;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* ===========================
     HELPERS
  =========================== */
  const toLocalDateTime = (d, t) =>
    new Date(`${d}T${t}+05:30`);

  const formatDate = d => d.toISOString().slice(0, 10);

  /* ===========================
     1️⃣ EMPLOYEE
  =========================== */
  const [[employee]] = await db.query(
    `
    SELECT
      e.id,
      e.employee_code,
      e.full_name,
      e.employee_status,
      e.joining_date,
      e.branch_id,
      dept.department_name AS department,
      desig.designation_name AS designation,
      sh.shift_name,
      ep.profile_photo_path
    FROM employees e
    LEFT JOIN departments dept ON dept.id = e.department_id AND dept.is_active = 1
    LEFT JOIN designations desig ON desig.id = e.designation_id AND desig.is_active = 1
    LEFT JOIN shifts sh ON sh.id = e.shift_id AND sh.is_active = 1
    LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
    WHERE e.id = ?
      AND e.company_id = ?
    `,
    [employeeId, companyId]
  );

  if (!employee) throw new Error("Employee not found");

  const joiningDate = employee.joining_date
    ? new Date(employee.joining_date)
    : null;
  if (joiningDate) joiningDate.setHours(0, 0, 0, 0);

  /* ===========================
     2️⃣ DATE RANGE
  =========================== */
  const startDate = from ? new Date(from) : new Date(joiningDate || today);
  const endDate = to ? new Date(to) : today;

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const totalDays =
    Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  /* ===========================
     3️⃣ ATTENDANCE ROWS
  =========================== */
  const [attendanceRows] = await db.query(
    `
    SELECT
      attendance_date,
      check_in_time,
      check_out_time,
      check_in_lat,
      check_in_lng,
      check_out_lat,
      check_out_lng,
      attendance_source,
      shift_id
    FROM attendance
    WHERE employee_id = ?
      AND attendance_date BETWEEN ? AND ?
    `,
    [employeeId, formatDate(startDate), formatDate(endDate)]
  );

  const attendanceMap = {};
  for (const r of attendanceRows) {
    attendanceMap[formatDate(new Date(r.attendance_date))] = r;
  }

  /* ===========================
     4️⃣ BRANCH HOLIDAYS
  =========================== */
  const [holidayRows] = await db.query(
    `
    SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date
    FROM branch_holidays
    WHERE company_id = ?
      AND branch_id = ?
      AND is_active = 1
      AND applies_to_attendance = 1
    `,
    [companyId, employee.branch_id]
  );

  const holidaySet = new Set(holidayRows.map(h => h.holiday_date));

  /* ===========================
     5️⃣ BUILD CALENDAR DATA
  =========================== */
  const fullData = [];

  for (let i = 0; i < totalDays; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);

    const dateKey = formatDate(currentDate);
    let status = "UNMARKED";
    let late_minutes = 0;
    let early_checkout_minutes = 0;
    let overtime_minutes = 0;

    const att = attendanceMap[dateKey];

    /* BEFORE JOINING */
    if (joiningDate && currentDate < joiningDate) {
      status = "-";
    }

    /* HOLIDAY */
    else if (holidaySet.has(dateKey)) {
      status = "H";
    }

    /* FUTURE */
    else if (currentDate > today) {
      status = "UNMARKED";
    }

    /* ATTENDANCE EXISTS */
    else if (att) {
      if (att.check_in_time && att.check_out_time) {
        status = "PRESENT";
      } else if (att.check_in_time) {
        status = "CHECKED_IN";
      } else {
        status = "ABSENT";
      }
    }

    /* PAST NO ATTENDANCE */
    else {
      status = "ABSENT";
    }

    fullData.push({
      date: dateKey,
      shift_name: employee.shift_name || "-",
      status,
      check_in_time: att?.check_in_time || null,
      check_out_time: att?.check_out_time || null,
      late_minutes,
      early_checkout_minutes,
      overtime_minutes,
      check_in_location:
        att?.check_in_lat && att?.check_in_lng
          ? `${att.check_in_lat}, ${att.check_in_lng}`
          : null,
      check_out_location:
        att?.check_out_lat && att?.check_out_lng
          ? `${att.check_out_lat}, ${att.check_out_lng}`
          : null,
      source: att?.attendance_source || "AUTO"
    });
  }

  /* ===========================
     PAGINATION
  =========================== */
  const pagedData = fullData
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(offset, offset + limit);

  /* ===========================
     FINAL RESPONSE
  =========================== */
  return {
    viewType: "HISTORY",
    employee: {
      id: employee.id,
      code: employee.employee_code,
      name: employee.full_name,
      profile_photo_url: await getS3SignedUrl(employee.profile_photo_path),
      department: employee.department || "-",
      designation: employee.designation || "-",
      shift: employee.shift_name || "-",
      status: employee.employee_status
    },
    data: pagedData,
    pagination: {
      page,
      limit,
      total_records: fullData.length
    }
  };
};
