import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "DEACTIVATE_ACCOUNT_CONTROLLER";

export const deactivateAccount = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const employeeId = req.user.id;
    const { category, reason } = req.body;

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    /* ==============================
       VALIDATION
    ============================== */
    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Deactivation category is required"
      });
    }

    if (category === "OTHER" && !reason) {
      return res.status(400).json({
        success: false,
        message: "Reason is required when category is OTHER"
      });
    }

    await connection.beginTransaction();

    /* ==============================
       CHECK EMPLOYEE EXISTS
    ============================== */
    const [[employee]] = await connection.query(
      `SELECT id, employee_status 
       FROM employees 
       WHERE id = ?`,
      [employeeId]
    );

    if (!employee) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    if (employee.employee_status === "INACTIVE") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Account already deactivated"
      });
    }

    /* ==============================
       UPDATE EMPLOYEE STATUS
    ============================== */
    await connection.query(
      `UPDATE employees
       SET employee_status = 'INACTIVE'
       WHERE id = ?`,
      [employeeId]
    );

    /* ==============================
       INSERT DEACTIVATION REASON
    ============================== */
    await connection.query(
      `INSERT INTO employee_deactivation_reasons 
       (employee_id, category, reason)
       VALUES (?, ?, ?)`,
      [
        employeeId,
        category,
        category === "OTHER" ? reason : null
      ]
    );

    /* ==============================
       LOGOUT FROM ALL DEVICES
    ============================== */
    await connection.query(
      `DELETE FROM employee_sessions
       WHERE employee_id = ?`,
      [employeeId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Your account has been deactivated successfully. Please contact admin to reactivate your account."
    });

  } catch (error) {
    await connection.rollback();
    logger.error(MODULE_NAME, "Failed to deactivate account", error);

    return res.status(500).json({
      success: false,
      message: "Failed to deactivate account"
    });
  } finally {
    connection.release();
  }
};