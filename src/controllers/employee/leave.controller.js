import db from "../../models/db.js";
import logger from "../../utils/logger.js";
import { sendNotification } from "../../services/notification.service.js";

const MODULE_NAME = "LEAVE_CONTROLLER";

/**
 * GET AVAILABLE LEAVE TYPES (EMPLOYEE)
 */
export const getAvailableLeaveTypes = async (req, res) => {
  try {
    const { company_id } = req.user;

    const [rows] = await db.query(
      `
      SELECT
        id,
        leave_code,
        leave_name,
        annual_quota,
        is_paid,
        allow_carry_forward,
        max_carry_forward,
        half_day_allowed,
        document_required
      FROM leave_master
      WHERE company_id = ?
      AND is_active = 1
      ORDER BY leave_name
      `,
      [company_id]
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to get available leave types", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 * APPLY LEAVE (EMPLOYEE)
 */
export const applyLeave = async (req, res) => {
  try {
    const {
      leave_master_id,
      from_date,
      to_date,
      total_days,
      reason
    } = req.body;

    const { id: employee_id, company_id } = req.user;

    // ===============================
    // 1️⃣ Basic validation
    // ===============================
    if (!leave_master_id || !from_date || !to_date || !total_days) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing"
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fromDate = new Date(from_date);
    const toDate = new Date(to_date);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(0, 0, 0, 0);

    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: "From date cannot be greater than to date"
      });
    }

    if (fromDate < today || toDate < today) {
      return res.status(400).json({
        success: false,
        message: "You cannot apply leave for past dates"
      });
    }

    const appliedTotal = Number(total_days);
    if (appliedTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid total days"
      });
    }

    // ===============================
    // 2️⃣ Fetch employee branch
    // ===============================
    const [[employee]] = await db.query(
      `
      SELECT branch_id
      FROM employees
      WHERE id = ?
        AND company_id = ?
      `,
      [employee_id, company_id]
    );

    if (!employee?.branch_id) {
      return res.status(400).json({
        success: false,
        message: "Employee branch not found"
      });
    }

    const { branch_id } = employee;

    // ===============================
    // 3️⃣ Validate leave type
    // ===============================
    const [[leaveType]] = await db.query(
      `
      SELECT id
      FROM leave_master
      WHERE id = ?
        AND company_id = ?
        AND is_active = 1
      `,
      [leave_master_id, company_id]
    );

    if (!leaveType) {
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive leave type"
      });
    }

    // ===============================
    // 4️⃣ Overlap check
    // ===============================
    const [[overlap]] = await db.query(
      `
      SELECT COUNT(*) AS count
      FROM employee_leave_requests
      WHERE employee_id = ?
        AND status IN ('PENDING','APPROVED')
        AND from_date <= ?
        AND to_date >= ?
      `,
      [employee_id, toDate, fromDate]
    );

    if (overlap.count > 0) {
      return res.status(409).json({
        success: false,
        message: "Leave already applied for selected dates"
      });
    }

    // ===============================
    // 5️⃣ HOLIDAY-ONLY CALCULATION
    // ===============================
    const [[holidayResult]] = await db.query(
      `
      SELECT COUNT(*) AS holiday_count
      FROM branch_holidays
      WHERE company_id = ?
        AND branch_id = ?
        AND is_active = 1
        AND applies_to_attendance = 1
        AND holiday_date BETWEEN ? AND ?
      `,
      [company_id, branch_id, fromDate, toDate]
    );

    const holidayCount = holidayResult.holiday_count || 0;
    const usedDays = appliedTotal - holidayCount;

    if (usedDays <= 0) {
      return res.status(400).json({
        success: false,
        message: "All selected days are holidays"
      });
    }

    // ===============================
    // 6️⃣ Insert leave request
    // ===============================
    // await db.query(
    //   `
    //   INSERT INTO employee_leave_requests (
    //     company_id,
    //     branch_id,
    //     employee_id,
    //     leave_master_id,
    //     from_date,
    //     to_date,
    //     total_days,
    //     reason
    //   ) VALUES (?,?,?,?,?,?,?,?)
    //   `,
    //   [
    //     company_id,
    //     branch_id,
    //     employee_id,
    //     leave_master_id,
    //     fromDate,
    //     toDate,
    //     usedDays,
    //     reason || null
    //   ]
    // );


    const [leaveResult] = await db.query(
  `
  INSERT INTO employee_leave_requests (
    company_id,
    branch_id,
    employee_id,
    leave_master_id,
    from_date,
    to_date,
    total_days,
    reason
  ) VALUES (?,?,?,?,?,?,?,?)
  `,
  [
    company_id,
    branch_id,
    employee_id,
    leave_master_id,
    fromDate,
    toDate,
    usedDays,
    reason || null
  ]
);
const leaveRequestId = leaveResult.insertId;

await sendNotification({
  company_id,
  branch_id,
  user_type: "EMPLOYEE",
  user_id: employee_id,
  title: "Leave Request Submitted",
  message: "Your leave request has been submitted successfully.",
  notification_type: "LEAVE",
  reference_id: leaveRequestId,
  reference_type: "LEAVE_REQUEST"
});

    return res.json({
      success: true,
      message: "Leave request submitted successfully",
      used_days: usedDays
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to apply leave", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};




/**
 * LEAVE HISTORY (EMPLOYEE)
 */
export const getLeaveHistory = async (req, res) => {
  try {
    const { id: employee_id } = req.user;

    const [rows] = await db.query(
      `
      SELECT
        elr.id,
        lm.leave_code,
        lm.leave_name,
        elr.from_date,
        elr.to_date,
        elr.total_days,
        elr.status,
        elr.applied_at
      FROM employee_leave_requests elr
      JOIN leave_master lm
        ON lm.id = elr.leave_master_id
      WHERE elr.employee_id = ?
      ORDER BY elr.applied_at DESC
      `,
      [employee_id]
    );

    return res.json({
      success: true,
      data: rows
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to get leave history", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


