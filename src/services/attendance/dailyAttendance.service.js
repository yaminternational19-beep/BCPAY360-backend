import db from "../../models/db.js";
import { getS3SignedUrl } from "../../utils/s3Upload.util.js";

/**
 * DAILY Attendance View (Admin)
 * Date-driven, shift-aware, history-consistent
 */
export const getDailyAttendance = async ({
  companyId,
  date,
  page = 1,
  limit = 20,
  search = "",
  branchId = "",
  departmentId = "",
  shiftId = "",
  status = ""
}) => {
  const offset = (page - 1) * limit;
  const now = new Date(); // IST

  /* ===========================
     DATE CONTEXT
  =========================== */
  const selectedDate = new Date(date);
  selectedDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isPast = selectedDate < today;
  const isToday = selectedDate.getTime() === today.getTime();
  const isFuture = selectedDate > today;

  /* ===========================
     HELPERS
  =========================== */
  const toLocalDateTime = (d, t) =>
    new Date(`${d}T${t}+05:30`);

  /* ===========================
     FILTER CONDITIONS
  =========================== */
  const conditions = [];
  const values = [date, companyId];

  if (search) {
    conditions.push(`(e.full_name LIKE ? OR e.employee_code LIKE ?)`);
    values.push(`%${search}%`, `%${search}%`);
  }

  if (branchId) {
    conditions.push(`e.branch_id = ?`);
    values.push(branchId);
  }

  if (departmentId) {
    conditions.push(`e.department_id = ?`);
    values.push(departmentId);
  }

  if (shiftId) {
    conditions.push(`e.shift_id = ?`);
    values.push(shiftId);
  }

  const whereClause = conditions.length
    ? " AND " + conditions.join(" AND ")
    : "";

  /* ===========================
     MAIN QUERY
  =========================== */
  const [rows] = await db.query(
    `
    SELECT
      e.id AS employee_id,
      e.employee_code,
      e.full_name,
      ep.profile_photo_path,
      dept.department_name AS department,
      desig.designation_name AS designation,
      sh.shift_name,
      sh.start_time AS shift_start_time,
      sh.end_time AS shift_end_time,
      sh.grace_minutes,
      a.check_in_time,
      a.check_out_time,
      a.attendance_source
    FROM employees e
    LEFT JOIN attendance a
      ON a.employee_id = e.id
     AND a.attendance_date = ?
    LEFT JOIN departments dept ON dept.id = e.department_id AND dept.is_active = 1
    LEFT JOIN designations desig ON desig.id = e.designation_id AND desig.is_active = 1
    LEFT JOIN shifts sh ON sh.id = e.shift_id AND sh.is_active = 1
    LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
    WHERE e.company_id = ?
      AND e.employee_status = 'ACTIVE'
      ${whereClause}
    ORDER BY e.employee_code
    LIMIT ? OFFSET ?
    `,
    [...values, Number(limit), offset]
  );

  /* ===========================
     BUSINESS LOGIC
  =========================== */
  const computedData = await Promise.all(
    rows.map(async (row, index) => {
      let statusComputed = "UNMARKED";
      let late_minutes = 0;
      let early_checkout_minutes = 0;
      let overtime_minutes = 0;

      let shiftStart = row.shift_start_time
        ? toLocalDateTime(date, row.shift_start_time)
        : null;

      let shiftEnd = row.shift_end_time
        ? toLocalDateTime(date, row.shift_end_time)
        : null;

      if (shiftStart && shiftEnd && shiftEnd <= shiftStart) {
        shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60000);
      }

      const shiftEndWithGrace =
        shiftEnd && row.grace_minutes
          ? new Date(shiftEnd.getTime() + row.grace_minutes * 60000)
          : shiftEnd;

      /* FUTURE */
      if (isFuture) {
        statusComputed = "UNMARKED";
      }

      /* CHECK-IN EXISTS */
      else if (row.check_in_time) {
        const checkIn = toLocalDateTime(date, row.check_in_time);

        if (shiftStart && checkIn > shiftStart) {
          const diff = Math.floor((checkIn - shiftStart) / 60000);
          late_minutes = Math.max(0, diff - (row.grace_minutes || 0));
        }

        if (!row.check_out_time) {
          statusComputed = "CHECKED_IN";
        } else {
          const checkOut = toLocalDateTime(date, row.check_out_time);
          statusComputed = "PRESENT";

          if (shiftEnd && checkOut < shiftEnd) {
            early_checkout_minutes = Math.floor(
              (shiftEnd - checkOut) / 60000
            );
          }

          if (shiftEnd && checkOut > shiftEnd) {
            overtime_minutes = Math.floor(
              (checkOut - shiftEnd) / 60000
            );
          }
        }
      }

      /* NO CHECK-IN */
      else {
        if (isPast) {
          statusComputed = "ABSENT";
        } else if (isToday && shiftEndWithGrace && now > shiftEndWithGrace) {
          statusComputed = "ABSENT";
        } else {
          statusComputed = "UNMARKED";
        }
      }

      return {
        sl_no: offset + index + 1,
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        name: row.full_name,
        profile_photo_url: await getS3SignedUrl(row.profile_photo_path),
        department: row.department || "-",
        designation: row.designation || "-",
        shift_name: row.shift_name || "-",
        shift_start_time: row.shift_start_time,
        shift_end_time: row.shift_end_time,
        status: statusComputed,
        check_in_time: row.check_in_time,
        check_out_time: row.check_out_time,
        late_minutes,
        early_checkout_minutes,
        overtime_minutes,
        source: row.attendance_source || "AUTO"
      };
    })
  );

  /* ===========================
     SUMMARY (JS-DRIVEN)
  =========================== */
  const summaryComputed = {
    total: computedData.length,
    present: 0,
    checked_in: 0,
    unmarked: 0
  };

  for (const row of computedData) {
    if (row.status === "PRESENT") summaryComputed.present++;
    else if (row.status === "CHECKED_IN") summaryComputed.checked_in++;
    else if (row.status === "UNMARKED") summaryComputed.unmarked++;
  }

  /* ===========================
     STATUS FILTER
  =========================== */
  const finalData = status
    ? computedData.filter(d => d.status === status)
    : computedData;

  /* ===========================
     PAGINATION COUNT
  =========================== */
  const [[{ total_records }]] = await db.query(
    `
    SELECT COUNT(*) AS total_records
    FROM employees
    WHERE company_id = ?
      AND employee_status = 'ACTIVE'
    `,
    [companyId]
  );

  /* ===========================
     FINAL RESPONSE
  =========================== */
  return {
    viewType: "DAILY",
    date,
    summary: summaryComputed,
    data: finalData,
    pagination: {
      page,
      limit,
      total_records
    }
  };
};
