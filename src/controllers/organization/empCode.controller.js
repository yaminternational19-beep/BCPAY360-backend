import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMP_CODE_CONTROLLER";

export const generateEmployeeCode = async (req, res) => {
  try {
    const { branch_id, employee_code } = req.body;
    const company_id = req.user.company_id;
    const role = req.user.role;
    const userId = req.user.id;

    /* ================================
       BASIC VALIDATION
    ================================ */
    if (!branch_id) {
      return res.status(400).json({ message: "branch_id is required" });
    }

    /* ================================
       FETCH EXISTING CONFIG
    ================================ */
    const [rows] = await db.query(
      `
      SELECT id, last_employee_code, current_sequence
      FROM employee_code_configs
      WHERE company_id = ? AND branch_id = ? AND is_active = 1
      `,
      [company_id, branch_id]
    );

    /* ================================
       FETCH MODE (Branch Selected)
    ================================ */
    if (employee_code === undefined) {
      if (!rows.length) {
        return res.json({ exists: false });
      }

      return res.json({
        exists: true,
        employee_code: rows[0].last_employee_code,
      });
    }

    /* ================================
       CREATE / UPDATE MODE
    ================================ */
    if (!employee_code) {
      return res.status(400).json({ message: "employee_code is required" });
    }

    // Allow flexible formats
    // Examples: ABC, EMP-HYD, ABC2025A, ABC2025001
    if (!/^[A-Z0-9_-]+$/i.test(employee_code)) {
      return res.status(400).json({
        message: "employee_code contains invalid characters",
      });
    }

    /* ================================
       OPTIONAL NUMERIC SUFFIX HANDLING
    ================================ */
    let currentSequence = 0;
    const match = employee_code.match(/(\d+)$/);
    if (match) {
      currentSequence = parseInt(match[1], 10);
    }

    /* ================================
       CREATE
    ================================ */
    if (!rows.length) {
      await db.query(
        `
        INSERT INTO employee_code_configs
          (company_id, branch_id, last_employee_code, current_sequence, created_by_role, created_by_id)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          company_id,
          branch_id,
          employee_code,
          currentSequence,
          role,
          userId,
        ]
      );

      return res.json({ success: true, action: "created" });
    }

    /* ================================
       UPDATE
    ================================ */
    await db.query(
      `
      UPDATE employee_code_configs
      SET last_employee_code = ?, current_sequence = ?
      WHERE id = ?
      `,
      [employee_code, currentSequence, rows[0].id]
    );

    return res.json({ success: true, action: "updated" });
  } catch (error) {
    logger.error(MODULE_NAME, "Failed to generate/update employee code", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
