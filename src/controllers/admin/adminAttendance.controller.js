import { attendanceReadService } from "../../services/attendance/attendanceRead.service.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "ADMIN_ATTENDANCE_CONTROLLER";

export const getAdminAttendance = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const result = await attendanceReadService({
      companyId,

      // core
      viewType: req.query.viewType,

      // DAILY
      date: req.query.date,
      status: req.query.status,

      // HISTORY
      employeeId: req.query.employeeId,
      from: req.query.from,
      to: req.query.to,

      // MONTHLY
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,

      // FILTERS
      search: req.query.search,
      departmentId: req.query.departmentId,
      shiftId: req.query.shiftId,

      // PAGINATION
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Admin attendance failed", err);

    res.status(400).json({
      success: false,
      message: err.message || "Failed to load attendance"
    });
  }
};
