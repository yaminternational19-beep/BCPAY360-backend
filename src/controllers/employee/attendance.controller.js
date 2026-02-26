import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "ATTENDANCE_CONTROLLER";

/* ===============================
  HELPERS
================================ */

const getTodayDate = () =>
  new Date().toISOString().split("T")[0];

const getCurrentTime = () =>
  new Date().toLocaleTimeString("en-GB", { hour12: false });

const timeToMinutes = (timeString) => {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  return hours * 60 + minutes + seconds / 60;
};

const diffMinutes = (a, b) =>
  Math.floor((b - a) / 60000);

const isBeforeJoining = (joiningDate) => {
  const today = getTodayDate();
  return today < joiningDate;
};


/* ===============================
  CHECK IN
================================ */

export const checkIn = async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { latitude, longitude, device_type } = req.body;
    const employeeId = req.user.id;
    const employeeCode = req.user.employee_code;
    const ipAddress = req.ip || null;

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    const today = getTodayDate();
    const nowTime = getCurrentTime();
    const source = req.headers["x-client-source"] || "WEB";

    await conn.beginTransaction();

    /* 1️⃣ Lock today row */
    const [rows] = await conn.query(
      `SELECT * FROM attendance
       WHERE employee_id = ? AND attendance_date = ?
       FOR UPDATE`,
      [employeeId, today]
    );




    if (rows.length && rows[0].check_in_time) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "You have already checked in today"
      });
    }

    /* 2️⃣ Fetch shift */
    const [[emp]] = await conn.query(
      `SELECT e.company_id,
          e.branch_id,
          e.joining_date,
          s.id shift_id,
          s.start_time shift_start,
          s.end_time shift_end
   FROM employees e
   JOIN shifts s ON s.id = e.shift_id
   WHERE e.id = ?`,
      [employeeId]
    );


    if (!emp) throw new Error("Shift not configured");

    if (today < emp.joining_date) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: "Attendance not allowed before joining date"
      });
    }

    const nowMin = timeToMinutes(nowTime);
    const shiftStartMin = timeToMinutes(emp.shift_start);

    /* 🚫 No early check-in */
    if (nowMin < shiftStartMin) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: "Check-in allowed only after shift start"
      });
    }

    /* ⏱ Late logic: after 30 mins only */
    let status = "CHECKED_IN";
    if (nowMin > shiftStartMin + 30) {
      status = "LATE";
    }

    let attendanceId;

    /* 3️⃣ Insert or update */
    if (!rows.length) {
      const [result] = await conn.query(
        `INSERT INTO attendance (
          company_id,
          branch_id,
          employee_id,
          attendance_date,
          check_in_time,
          shift_id,
          shift_start,
          shift_end,
          check_in_lat,
          check_in_lng,
          check_in_source,
          status,
          is_checked_in_session
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          emp.company_id,
          emp.branch_id,
          employeeId,
          today,
          nowTime,
          emp.shift_id,
          emp.shift_start,
          emp.shift_end,
          latitude,
          longitude,
          source,
          status
        ]
      );
      attendanceId = result.insertId;
    } else {
      attendanceId = rows[0].id;
      await conn.query(
        `UPDATE attendance
         SET check_in_time = ?, check_in_lat = ?, check_in_lng = ?,
             check_in_source = ?, status = ?, is_checked_in_session = 1
         WHERE id = ? AND check_in_time IS NULL`,
        [nowTime, latitude, longitude, source, status, attendanceId]
      );
    }

    /* 4️⃣ Audit */
    await conn.query(
      `INSERT INTO attendance_logs (
        attendance_id, actor_role, actor_id,
        action, source, device_type, new_data, ip_address
      ) VALUES (?, 'EMPLOYEE', ?, 'CHECK_IN', ?, ?, ?, ?)`,
      [
        attendanceId,
        employeeId,
        source,
        device_type?.toUpperCase() || "UNKNOWN",
        JSON.stringify({ check_in_time: nowTime, status }),
        ipAddress
      ]
    );

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Checked in successfully",
      data: {
        attendance_id: attendanceId,
        employee_id: employeeId,
        employee_code: employeeCode,
        check_in_time: nowTime,
        status,
        is_checked_in_session: 1
      }
    });
  } catch (err) {
    if (conn) await conn.rollback();
    logger.error(MODULE_NAME, "Check-in failed", err);
    return res.status(500).json({
      success: false,
      message: "Unable to check in"
    });
  } finally {
    conn.release();
  }
};


/* ===============================
  CHECK OUT
================================ */

export const checkOut = async (req, res) => {
  const conn = await db.getConnection();

  try {
    const { latitude, longitude, device_type } = req.body;
    const employeeId = req.user.id;
    const employeeCode = req.user.employee_code;
    const ipAddress = req.ip || null;

    if (latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    const today = getTodayDate();
    const nowTime = getCurrentTime();
    const source = req.headers["x-client-source"] || "WEB";

    await conn.beginTransaction();

    /* 1️⃣ Lock row */
    const [[att]] = await conn.query(
      `SELECT * FROM attendance
       WHERE employee_id = ? AND attendance_date = ?
       FOR UPDATE`,
      [employeeId, today]
    );

    if (!att || !att.check_in_time) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "You have not checked in yet"
      });
    }

    if (att.check_out_time) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "You have already checked out"
      });
    }

    /* 2️⃣ Worked minutes */
    let workedMinutes =
      Math.max(1, Math.floor(
        timeToMinutes(nowTime) - timeToMinutes(att.check_in_time)
      ));

    if (workedMinutes < 0) workedMinutes += 1440;

    /* 3️⃣ Overtime */
    let overtimeMinutes = 0;
    const shiftEndMin = timeToMinutes(att.shift_end);
    const checkOutMin = timeToMinutes(nowTime);

    if (checkOutMin > shiftEndMin) {
      overtimeMinutes = checkOutMin - shiftEndMin;
    }
    const [[emp]] = await conn.query(
      `SELECT joining_date FROM employees WHERE id = ?`,
      [employeeId]
    );

    if (today < emp.joining_date) {
      await conn.rollback();
      return res.status(403).json({
        success: false,
        message: "Attendance not allowed before joining date"
      });
    }


    /* 4️⃣ FINAL STATUS */
    let finalStatus;
    if (workedMinutes < att.min_work_minutes) {
      finalStatus = "HALF_DAY";
    } else if (workedMinutes < att.full_day_minutes) {
      finalStatus = "HALF_DAY";
    } else {
      finalStatus = "CHECKED_OUT";
    }

    /* 5️⃣ Update */
    await conn.query(
      `UPDATE attendance
       SET check_out_time = ?,
           worked_minutes = ?,
           overtime_minutes = ?,
           check_out_lat = ?,
           check_out_lng = ?,
           check_out_source = ?,
           status = ?,
           is_checked_in_session = 0
       WHERE id = ?`,
      [
        nowTime,
        workedMinutes,
        overtimeMinutes,
        latitude,
        longitude,
        source,
        finalStatus,
        att.id
      ]
    );

    /* 6️⃣ Audit */
    await conn.query(
      `INSERT INTO attendance_logs (
        attendance_id, actor_role, actor_id,
        action, source, device_type, new_data, ip_address
      ) VALUES (?, 'EMPLOYEE', ?, 'CHECK_OUT', ?, ?, ?, ?)`,
      [
        att.id,
        employeeId,
        source,
        device_type?.toUpperCase() || "UNKNOWN",
        JSON.stringify({
          check_out_time: nowTime,
          worked_minutes: workedMinutes,
          overtime_minutes: overtimeMinutes,
          status: finalStatus
        }),
        ipAddress
      ]
    );

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: "Checked out successfully",
      data: {
        attendance_id: att.id,
        employee_id: employeeId,
        employee_code: employeeCode,
        check_in_time: att.check_in_time,
        check_out_time: nowTime,
        worked_minutes: workedMinutes,
        overtime_minutes: overtimeMinutes,
        is_checked_in_session: 0,
        status: finalStatus
      }
    });
  } catch (err) {
    if (conn) await conn.rollback();
    logger.error(MODULE_NAME, "Check-out failed", err);
    return res.status(500).json({
      success: false,
      message: "Unable to check out"
    });
  } finally {
    conn.release();
  }
};





/* ===============================
  MY ATTENDANCE LIST
================================ */

export const getMyAttendance = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const today = getTodayDate();

    let { from, to } = req.query;

    /* -------------------------------
       DEFAULT RANGE
    -------------------------------- */
    if (!from || !to) {
      from = today;
      to = today;
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: "Dates must be in YYYY-MM-DD format"
      });
    }

    if (from > to) {
      return res.status(400).json({
        success: false,
        message: "'from' date cannot be after 'to' date"
      });
    }


    const [[emp]] = await db.query(
      `
  SELECT e.joining_date, s.end_time
  FROM employees e
  JOIN shifts s ON s.id = e.shift_id
  WHERE e.id = ?
  `,
      [employeeId]
    );

    const nowMin = timeToMinutes(getCurrentTime());
    const shiftEndMin = timeToMinutes(emp.end_time);

    if (
      today >= emp.joining_date &&
      nowMin > shiftEndMin
    ) {
      const [[existing]] = await db.query(
        `
  SELECT id
  FROM attendance
  WHERE employee_id = ?
    AND attendance_date = ?
    AND check_in_time IS NOT NULL
  `,
        [employeeId, today]
      );


      if (!existing) {
        await db.query(
          `
      INSERT INTO attendance (
        employee_id,
        attendance_date,
        status,
        worked_minutes,
        overtime_minutes
      ) VALUES (?, ?, 'ABSENT', 0, 0)
      `,
          [employeeId, today]
        );
      }
    }


    /* -------------------------------
       1️⃣ TODAY ATTENDANCE (DATE SAFE)
    -------------------------------- */
    const [[todayAttendance]] = await db.query(
      `
      SELECT
        id,
        DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
        check_in_time,
        check_out_time,
        worked_minutes,
        overtime_minutes,
        status
      FROM attendance
      WHERE employee_id = ?
        AND attendance_date = ?
      `,
      [employeeId, today]
    );

    const permissions = {
      can_check_in: !todayAttendance || !todayAttendance.check_in_time,
      can_check_out:
        !!todayAttendance?.check_in_time &&
        !todayAttendance?.check_out_time
    };

    /* If no row for today → return UNMARKED */
    let todayData;

    if (today < emp.joining_date) {
      todayData = {
        attendance_date: today,
        check_in_time: null,
        check_out_time: null,
        worked_minutes: 0,
        overtime_minutes: 0,
        status: "-"
      };
    } else {
      todayData = todayAttendance || {
        attendance_date: today,
        check_in_time: null,
        check_out_time: null,
        worked_minutes: 0,
        overtime_minutes: 0,
        status: "UNMARKED"
      };
    }


    /* -------------------------------
       2️⃣ ATTENDANCE LIST (DATE SAFE)
    -------------------------------- */
  //   const [records] = await db.query(
  //     `
  // SELECT
  //   DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
  //   check_in_time,
  //   check_out_time,
  //   worked_minutes,
  //   overtime_minutes,
  //   status
  // FROM attendance
  // WHERE employee_id = ?
  //   AND attendance_date >= ?
  //   AND attendance_date BETWEEN ? AND ?
  // ORDER BY attendance_date DESC
  // `,
  //     [employeeId, emp.joining_date, from, to]
  //   );


    /* -------------------------------
       3️⃣ SUMMARY
    -------------------------------- */
  //   const [[summary]] = await db.query(
  //     `
  // SELECT
  //   SUM(
  //     CASE
  //       WHEN status IN ('CHECKED_OUT','LATE') THEN 1
  //       WHEN status = 'HALF_DAY' THEN 0.5
  //       ELSE 0
  //     END
  //   ) AS present_days,

  //   SUM(status = 'LATE')     AS late_days,
  //   SUM(status = 'HALF_DAY') AS half_days,
  //   SUM(status = 'ABSENT')   AS absent_days,

  //   SUM(worked_minutes)   AS total_worked_minutes,
  //   SUM(overtime_minutes) AS total_overtime_minutes
  // FROM attendance
  // WHERE employee_id = ?
  //   AND attendance_date >= ?
  //   AND attendance_date BETWEEN ? AND ?
  // `,
  //     [employeeId, emp.joining_date, from, to]
  //   );





  // 1️⃣ Fix date range boundaries
const fromDate = new Date(from);
const joiningDate = new Date(emp.joining_date);
const todayDate = new Date(today);
const toDate = new Date(to);

// Start = later of joining or requested from
const rangeStartDate = fromDate > joiningDate ? fromDate : joiningDate;

// End = earlier of today or requested to
const rangeEndDate = toDate < todayDate ? toDate : todayDate;

// If joining date is after today → no records
if (rangeStartDate > rangeEndDate) {
  return res.status(200).json({
    success: true,
    data: {
      today: [todayData],
      list: [
        {
          range: { from, to },
          total_days: 0,
          records: []
        }
      ],
      total_days_summary: {
        total_days: 0,
        present_days: 0,
        late_days: 0,
        half_days: 0,
        absent_days: 0,
        total_worked_minutes: 0,
        total_overtime_minutes: 0
      }
    }
  });
}

// 2️⃣ Fetch DB records only within valid range
const [recordsFromDB] = await db.query(
  `
  SELECT
    DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
    check_in_time,
    check_out_time,
    worked_minutes,
    overtime_minutes,
    status
  FROM attendance
  WHERE employee_id = ?
    AND attendance_date BETWEEN ? AND ?
  ORDER BY attendance_date ASC
  `,
  [employeeId, rangeStartDate, rangeEndDate]
);

// 3️⃣ Convert DB records to map
const recordMap = {};
recordsFromDB.forEach(r => {
  recordMap[r.attendance_date] = r;
});

// 4️⃣ Generate attendance from joining → today only
const records = [];
let current = new Date(rangeStartDate);

while (current <= rangeEndDate) {
 const year = current.getFullYear();
const month = String(current.getMonth() + 1).padStart(2, "0");
const day = String(current.getDate()).padStart(2, "0");
const dateStr = `${year}-${month}-${day}`;

  records.push(
    recordMap[dateStr] || {
      attendance_date: dateStr,
      check_in_time: null,
      check_out_time: null,
      worked_minutes: 0,
      overtime_minutes: 0,
      status: "ABSENT"
    }
  );

  current.setDate(current.getDate() + 1);
}

let present_days = 0;
let late_days = 0;
let half_days = 0;
let absent_days = 0;
let total_worked_minutes = 0;
let total_overtime_minutes = 0;

records.forEach(r => {
  if (r.status === "LATE") {
    present_days += 1;
    late_days += 1;
  } else if (r.status === "CHECKED_OUT") {
    present_days += 1;
  } else if (r.status === "HALF_DAY") {
    present_days += 0.5;
    half_days += 1;
  } else if (r.status === "ABSENT") {
    absent_days += 1;
  }

  total_worked_minutes += r.worked_minutes || 0;
  total_overtime_minutes += r.overtime_minutes || 0;
});
    /* -------------------------------
       FINAL RESPONSE
    -------------------------------- */
    return res.status(200).json({
      success: true,
      data: {
        today: [
          todayData,

        ],
        list: [
          {
            range: { from, to },
            total_days: records.length,
            records
          }
        ],
        // total_days_summary: {
        //   total_days: records.length,
        //   present_days: Number(summary.present_days) || 0,
        //   late_days: Number(summary.late_days) || 0,
        //   half_days: Number(summary.half_days) || 0,
        //   absent_days: Number(summary.absent_days) || 0,
        //   total_worked_minutes: Number(summary.total_worked_minutes) || 0,
        //   total_overtime_minutes: Number(summary.total_overtime_minutes) || 0
        // }

        total_days_summary: {
          total_days: records.length,
          present_days: Number(present_days) || 0,
          late_days: Number(late_days) || 0,
          half_days: Number(half_days) || 0,
          absent_days: Number(absent_days) || 0,
          total_worked_minutes: Number(total_worked_minutes) || 0,
          total_overtime_minutes: Number(total_overtime_minutes) || 0
        }
      }
    });


  } catch (err) {
    logger.error(MODULE_NAME, "Failed to fetch attendance dashboard", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch attendance dashboard"
    });
  }
};








/* ===============================
  ATTENDANCE SUMMARY (EMPLOYEE)
================================ */


export const raiseAttendanceRequest = async (req, res) => {
  const conn = await db.getConnection();

  try {
    const employeeId = req.user.id;
    const {
      attendance_date,
      requested_status,
      reason,
    } = req.body;

    if (!attendance_date || !requested_status || !reason) {
      return res.status(400).json({
        message: "attendance_date, requested_status and reason are required",
      });
    }

    await conn.beginTransaction();

    /* 1️⃣ Fetch attendance */
    const [[attendance]] = await conn.query(
      `
        SELECT *
        FROM attendance
        WHERE employee_id = ?
          AND attendance_date = ?
        FOR UPDATE
        `,
      [employeeId, attendance_date]
    );

    if (!attendance) {
      await conn.rollback();
      return res.status(404).json({
        message: "Attendance record not found for this date",
      });
    }

    /* 2️⃣ Prevent duplicate pending request */
    const [[existing]] = await conn.query(
      `
        SELECT id
        FROM attendance_logs
        WHERE attendance_id = ?
          AND approval_status = 'PENDING'
        `,
      [attendance.id]
    );

    if (existing) {
      await conn.rollback();
      return res.status(400).json({
        message: "Attendance request already pending",
      });
    }

    /* 3️⃣ Insert request log */
    await conn.query(
      `
        INSERT INTO attendance_logs
        (
          attendance_id,
          actor_role,
          actor_id,
          action,
          source,
          new_data,
          reason,
          approval_status
        )
        VALUES
        (?, 'EMPLOYEE', ?, 'ADMIN_EDIT', 'WEB', ?, ?, 'PENDING')
        `,
      [
        attendance.id,
        employeeId,
        JSON.stringify({
          status: requested_status,
        }),
        reason,
      ]
    );

    await conn.commit();

    res.json({
      message: "Attendance request raised successfully",
    });

  } catch (err) {
    await conn.rollback();
    logger.error(MODULE_NAME, "Failed to raise attendance request", err);
    res.status(500).json({
      message: "Failed to raise attendance request",
    });
  } finally {
    conn.release();
  }
};