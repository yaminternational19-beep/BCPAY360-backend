import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "ADMIN_LEAVE_APPROVAL_CONTROLLER";

/**
 * GET PENDING LEAVE REQUESTS
 */
export const getPendingLeaves = async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res.status(401).json({
        success: false,
        message: "Company context missing"
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        elr.id,
        e.id AS employee_id,
        e.employee_code AS emp_id,
        e.full_name,

        d.department_name,

        s.shift_name,
        CONCAT(
          TIME_FORMAT(s.start_time, '%H:%i'),
          ' - ',
          TIME_FORMAT(s.end_time, '%H:%i')
        ) AS shift_timing,

        lm.leave_code,
        lm.leave_name,

        elr.from_date,
        elr.to_date,
        elr.total_days,
        elr.reason,
        elr.applied_at
      FROM employee_leave_requests elr
      JOIN employees e
        ON e.id = elr.employee_id
      LEFT JOIN departments d
        ON d.id = e.department_id
      LEFT JOIN shifts s
        ON s.id = e.shift_id
      JOIN leave_master lm
        ON lm.id = elr.leave_master_id
      WHERE elr.company_id = ?
        AND elr.status = 'PENDING'
      ORDER BY elr.applied_at ASC
      `,
      [company_id]
    );

    return res.json({
      success: true,
      meta: {
        count: rows.length
      },
      data: rows
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to get pending leaves", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


/**
 * APPROVE LEAVE
 */
export const approveLeave = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const request_id = req.params.id;
    const { id: admin_id, role, company_id } = req.user;

    await connection.beginTransaction();

    // Fetch leave request
    const [[leaveRequest]] = await connection.query(
      `
      SELECT *
      FROM employee_leave_requests
      WHERE id = ?
        AND company_id = ?
        AND status = 'PENDING'
      `,
      [request_id, company_id]
    );

    if (!leaveRequest) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Leave request not found or already processed"
      });
    }

    // Update request status
    await connection.query(
      `
      UPDATE employee_leave_requests
      SET status = 'APPROVED'
      WHERE id = ?
      `,
      [request_id]
    );

    // Insert ledger DEBIT
    await connection.query(
      `
      INSERT INTO leave_ledger (
        company_id,
        employee_id,
        leave_master_id,
        request_id,
        action_type,
        days,
        acted_by_role,
        acted_by_id,
        remarks
      ) VALUES (?,?,?,?,?,?,?,?,?)
      `,
      [
        company_id,
        leaveRequest.employee_id,
        leaveRequest.leave_master_id,
        request_id,
        'APPROVE',
        -leaveRequest.total_days,
        role,
        admin_id,
        'Leave approved'
      ]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Leave approved successfully"
    });

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error(MODULE_NAME, "Failed to approve leave", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    connection.release();
  }
};

/**
 * REJECT LEAVE
 */
export const rejectLeave = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const request_id = req.params.id;
    const { id: admin_id, role, company_id } = req.user;
    const { remarks } = req.body;

    await connection.beginTransaction();

    const [[leaveRequest]] = await connection.query(
      `
      SELECT *
      FROM employee_leave_requests
      WHERE id = ?
        AND company_id = ?
        AND status = 'PENDING'
      `,
      [request_id, company_id]
    );

    if (!leaveRequest) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Leave request not found or already processed"
      });
    }

    // Update request
    await connection.query(
      `
      UPDATE employee_leave_requests
      SET status = 'REJECTED'
      WHERE id = ?
      `,
      [request_id]
    );

    // Insert ledger REJECT entry
    await connection.query(
      `
      INSERT INTO leave_ledger (
        company_id,
        employee_id,
        leave_master_id,
        request_id,
        action_type,
        days,
        acted_by_role,
        acted_by_id,
        remarks
      ) VALUES (?,?,?,?,?,?,?,?,?)
      `,
      [
        company_id,
        leaveRequest.employee_id,
        leaveRequest.leave_master_id,
        request_id,
        'REJECT',
        0,
        role,
        admin_id,
        remarks || 'Leave rejected'
      ]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Leave rejected successfully"
    });

  } catch (error) {
    if (connection) await connection.rollback();
    logger.error(MODULE_NAME, "Failed to reject leave", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  } finally {
    connection.release();
  }
};

export const getLeaveHistory = async (req, res) => {
  try {
    const { company_id } = req.user;

    // 🔒 Hard guard
    if (!company_id) {
      return res.status(401).json({
        success: false,
        message: "Company context missing"
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        elr.id,

        e.id AS employee_id,
        e.employee_code AS emp_id,
        e.full_name,

        d.department_name,

        s.shift_name,
        CONCAT(
          TIME_FORMAT(s.start_time, '%H:%i'),
          ' - ',
          TIME_FORMAT(s.end_time, '%H:%i')
        ) AS shift_timing,

        lm.leave_code,
        lm.leave_name,

        elr.from_date,
        elr.to_date,
        elr.total_days,
        elr.status,
        elr.applied_at
      FROM employee_leave_requests elr
      JOIN employees e
        ON e.id = elr.employee_id
      LEFT JOIN departments d
        ON d.id = e.department_id
      LEFT JOIN shifts s
        ON s.id = e.shift_id
      JOIN leave_master lm
        ON lm.id = elr.leave_master_id
      WHERE elr.company_id = ?
        AND elr.status IN ('APPROVED','REJECTED','CANCELLED')
      ORDER BY elr.applied_at DESC
      `,
      [company_id]
    );

    return res.status(200).json({
      success: true,
      meta: {
        count: rows.length
      },
      data: rows
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Failed to fetch leave history", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave history"
    });
  }
};



