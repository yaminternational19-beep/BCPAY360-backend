import { getDailyAttendance } from "./dailyAttendance.service.js";
import { getHistoryAttendance } from "./historyAttendance.service.js";
import { getMonthlyAttendance } from "./monthlyAttendance.service.js";

/**
 * Admin Attendance Read Service
 * Toggle-based entry point
  */

/**
 * Admin Attendance Read Service
 * Central toggle-based entry point
 */
export const attendanceReadService = async ({
  viewType,
  companyId,

  /* DAILY */
  date,
  search,
  departmentId,
  shiftId,
  status,

  /* HISTORY */
  employeeId,
  from,
  to,

  /* MONTHLY / RANGE */
  fromDate,
  toDate,

  page = 1,
  limit = 20
}) => {
  if (!viewType) {
    throw new Error("viewType is required");
  }

  /* ===========================
     DAILY VIEW
  =========================== */
  if (viewType === "DAILY") {
    if (!date) {
      throw new Error("date is required for DAILY view");
    }

    return await getDailyAttendance({
      companyId,
      date,
      page,
      limit,
      search,
      departmentId,
      shiftId,
      status
    });
  }

  /* ===========================
     HISTORY VIEW (EMPLOYEE)
  =========================== */
  if (viewType === "HISTORY") {
    if (!employeeId || !from || !to) {
      throw new Error("employeeId, from, to are required for HISTORY view");
    }

    return await getHistoryAttendance({
      companyId,
      employeeId,
      from,
      to,
      page,
      limit
    });
  }

  /* ===========================
     MONTHLY / RANGE VIEW (ADMIN)
  =========================== */
  if (viewType === "MONTHLY") {
  const rangeFrom = fromDate || from;
  const rangeTo = toDate || to;

  if (!rangeFrom || !rangeTo) {
    throw new Error("fromDate and toDate are required for MONTHLY view");
  }

  return await getMonthlyAttendance({
    companyId,
    fromDate: rangeFrom,
    toDate: rangeTo,
    page: Number(page),
    limit: Number(limit),
    search,
    departmentId,
    shiftId
  });
}

  /* ===========================
     INVALID VIEW
  =========================== */
  throw new Error("Invalid viewType");
};

