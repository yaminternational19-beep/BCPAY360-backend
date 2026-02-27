import db from "../../models/db.js";
import { getS3SignedUrl } from "../../utils/s3Upload.util.js";

export const getHistoryAttendance = async ({
  companyId,
  employeeId,
  from,
  to
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatDate = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const todayStr = formatDate(today);

  /* ================= EMPLOYEE ================= */

  const [[employee]] = await db.query(
    `
    SELECT
      e.id,
      e.employee_code,
      e.full_name,
      e.employee_status,
      DATE_FORMAT(e.joining_date,'%Y-%m-%d') AS joining_date,
      e.branch_id,
      dept.department_name AS department,
      desig.designation_name AS designation,
      sh.shift_name,
      ep.profile_photo_path
    FROM employees e
    LEFT JOIN departments dept ON dept.id = e.department_id
    LEFT JOIN designations desig ON desig.id = e.designation_id
    LEFT JOIN shifts sh ON sh.id = e.shift_id
    LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
    WHERE e.id = ?
      AND e.company_id = ?
    `,
    [employeeId, companyId]
  );

  if (!employee) {
    throw new Error("Employee not found");
  }

  const joiningDateStr = employee.joining_date;

  /* ================= DATE RANGE ================= */

  let startDate = from
    ? new Date(from)
    : new Date(joiningDateStr);

  let endDate = to
    ? new Date(to)
    : today;

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (startDate > endDate) {
    throw new Error("Invalid date range");
  }

  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);

  const totalDays =
    Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  /* ================= ATTENDANCE ================= */

  const [attendanceRows] = await db.query(
    `
    SELECT
      DATE_FORMAT(attendance_date,'%Y-%m-%d') AS attendance_date,
      status,
      check_in_time,
      check_out_time,
      check_in_lat,
      check_in_lng,
      check_out_lat,
      check_out_lng,
      attendance_source
    FROM attendance
    WHERE employee_id = ?
      AND attendance_date BETWEEN ? AND ?
    `,
    [employeeId, startStr, endStr]
  );

  const attendanceMap = {};
  attendanceRows.forEach(row => {
    attendanceMap[row.attendance_date] = row;
  });

  /* ================= HOLIDAYS ================= */

  const [holidayRows] = await db.query(
    `
    SELECT DATE_FORMAT(holiday_date,'%Y-%m-%d') AS holiday_date
    FROM branch_holidays
    WHERE company_id = ?
      AND branch_id = ?
      AND is_active = 1
      AND applies_to_attendance = 1
    `,
    [companyId, employee.branch_id]
  );

  const holidaySet = new Set(
    holidayRows.map(h => h.holiday_date)
  );

  /* ================= BUILD CALENDAR ================= */

  const data = [];

  for (let i = 0; i < totalDays; i++) {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + i);

    const dateStr = formatDate(current);
    const att = attendanceMap[dateStr];

    let status;

    // BEFORE JOINING
    if (dateStr < joiningDateStr) {
      status = "-";
    }

    // FUTURE
    else if (dateStr > todayStr) {
      status = "UNMARKED";
    }

    // HOLIDAY
    else if (holidaySet.has(dateStr)) {
      status = "H";
    }

    // ATTENDANCE EXISTS
    else if (att) {
      if (
        att.status === "CHECKED_OUT" ||
        att.status === "LATE" ||
        att.status === "HALF_DAY"
      ) {
        status = "PRESENT";
      } else {
        status = "ABSENT";
      }
    }

    // NO RECORD
    else {
      status = "ABSENT";
    }

    data.push({
      date: dateStr,
      shift_name: employee.shift_name || "-",
      status,
      check_in_time: att?.check_in_time || null,
      check_out_time: att?.check_out_time || null,
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

  /* ================= RESPONSE ================= */

  return {
    success: true,
    viewType: "HISTORY",
    employee: {
      id: employee.id,
      code: employee.employee_code,
      name: employee.full_name,
      profile_photo_url: employee.profile_photo_path
        ? await getS3SignedUrl(employee.profile_photo_path)
        : null,
      department: employee.department || "-",
      designation: employee.designation || "-",
      shift: employee.shift_name || "-",
      status: employee.employee_status
    },
    data
  };
};