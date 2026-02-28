import db from "../../models/db.js";
import logger from "../../utils/logger.js";
import { sendNotification } from "../../utils/oneSignal.js";
const MODULE_NAME = "ADMIN_HOLIDAYS_CONTROLLER";

// export const createBranchHolidays = async (req, res) => {
//   const {
//     branch_id,
//     dates,
//     reason_type,
//     reason_text
//   } = req.body;

//   const company_id = req.user.company_id;
//   const created_by_role = req.user.role; // COMPANY_ADMIN / HR
//   const created_by_id = req.user.id;

//   // ===============================
//   // 1. Basic validation
//   // ===============================
//   if (!branch_id || !Array.isArray(dates) || dates.length === 0) {
//     return res.status(400).json({
//       message: "branch_id and dates array are required"
//     });
//   }

//   if (!reason_type || !reason_text) {
//     return res.status(400).json({
//       message: "reason_type and reason_text are required"
//     });
//   }

//   // ===============================
//   // 2. Prepare bulk insert values
//   // ===============================
//   const values = dates.map(date => {
//     const year = new Date(date).getFullYear();

//     return [
//       company_id,
//       branch_id,
//       date,
//       year,
//       reason_type,
//       reason_text,
//       created_by_role,
//       created_by_id
//     ];
//   });

//   // ===============================
//   // 3. Insert (idempotent)
//   // ===============================
//   const sql = `
//     INSERT INTO branch_holidays
//       (company_id, branch_id, holiday_date, holiday_year,
//        reason_type, reason_text,
//        created_by_role, created_by_id)
//     VALUES ?
//     ON DUPLICATE KEY UPDATE
//       reason_type = VALUES(reason_type),
//       reason_text = VALUES(reason_text),
//       is_active = 1,
//       updated_at = CURRENT_TIMESTAMP
//   `;

//   try {
//     const [result] = await db.query(sql, [values]);

//     return res.status(201).json({
//       message: "Holidays created successfully",
//       affected_rows: result.affectedRows
//     });
//   } catch (error) {
//     logger.error(MODULE_NAME, "Failed to create holidays", error);
//     return res.status(500).json({
//       message: "Failed to create holidays"
//     });
//   }
// };

export const createBranchHolidays = async (req, res) => {
  const {
    branch_id,
    dates,
    reason_type,
    reason_text
  } = req.body;

  const company_id = req.user.company_id;
  const created_by_role = req.user.role;
  const created_by_id = req.user.id;

  // ===============================
  // 1. Basic validation
  // ===============================
  if (!branch_id || !Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({
      message: "branch_id and dates array are required"
    });
  }

  if (!reason_type || !reason_text) {
    return res.status(400).json({
      message: "reason_type and reason_text are required"
    });
  }

  // ===============================
  // 2. Prepare bulk insert values
  // ===============================
  const values = dates.map(date => {
    const year = new Date(date).getFullYear();

    return [
      company_id,
      branch_id,
      date,
      year,
      reason_type,
      reason_text,
      created_by_role,
      created_by_id
    ];
  });

  // ===============================
  // 3. Insert (idempotent)
  // ===============================
  const sql = `
    INSERT INTO branch_holidays
      (company_id, branch_id, holiday_date, holiday_year,
       reason_type, reason_text,
       created_by_role, created_by_id)
    VALUES ?
    ON DUPLICATE KEY UPDATE
      reason_type = VALUES(reason_type),
      reason_text = VALUES(reason_text),
      is_active = 1,
      updated_at = CURRENT_TIMESTAMP
  `;

  try {
    const [result] = await db.query(sql, [values]);

    /* ==========================================
       🔔 SEND NOTIFICATION TO BRANCH EMPLOYEES
    ========================================== */

    const [employees] = await db.query(
      `SELECT id FROM employees 
       WHERE company_id = ? AND branch_id = ?`,
      [company_id, branch_id]
    );

    const formattedDates = dates.join(", ");

    for (const emp of employees) {
      await sendNotification({
        company_id,
        user_type: "EMPLOYEE",
        user_id: emp.id,
        title: `New Holiday Announcement`,
        message: `Holiday declared on ${formattedDates}. Reason: ${reason_text}`,
        notification_type: "BRANCH_HOLIDAY",
        reference_type: "BRANCH_HOLIDAY",
        action_url: `/employee/holidays`
      });
    }

    return res.status(201).json({
      message: "Holidays created successfully",
      affected_rows: result.affectedRows
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to create holidays", error);
    return res.status(500).json({
      message: "Failed to create holidays"
    });
  }
};
/**
 * GET holidays by branch & year
 */
export const getBranchHolidays = async (req, res) => {
  const { id, branch_id, year } = req.query;
  const company_id = req.user.company_id;

  try {
    /**
     * ===============================
     * CASE 1: GET SINGLE HOLIDAY
     * ===============================
     */
    if (id) {
      const sql = `
        SELECT
          id,
          branch_id,
          DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
          holiday_year,
          reason_type,
          reason_text,
          is_paid
        FROM branch_holidays
        WHERE id = ?
          AND company_id = ?
          AND is_active = 1
      `;

      const [rows] = await db.query(sql, [id, company_id]);

      if (rows.length === 0) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      return res.json(rows[0]);
    }

    /**
     * ===============================
     * CASE 2: GET BULK (BRANCH + YEAR)
     * ===============================
     */
    if (!branch_id || !year) {
      return res.status(400).json({
        message: "branch_id and year are required"
      });
    }

    const sql = `
      SELECT
        id,
        DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date,
        reason_type,
        reason_text,
        is_paid
      FROM branch_holidays
      WHERE company_id = ?
        AND branch_id = ?
        AND holiday_year = ?
        AND is_active = 1
      ORDER BY holiday_date
    `;

    const [rows] = await db.query(sql, [company_id, branch_id, year]);
    return res.json(rows);

  } catch (err) {
    logger.error(MODULE_NAME, "Failed to fetch holidays", err);
    return res.status(500).json({
      message: "Failed to fetch holidays"
    });
  }
};

// export const updateBranchHoliday = async (req, res) => {
//   const {
//     id,
//     branch_id,
//     year,
//     dates,
//     reason_type,
//     reason_text
//   } = req.body;

//   const company_id = req.user.company_id;

//   if (!reason_type || !reason_text) {
//     return res.status(400).json({
//       message: "reason_type and reason_text are required"
//     });
//   }

//   try {
//     // ===============================
//     // CASE 1: SINGLE UPDATE
//     // ===============================
//     if (id) {
//       const sql = `
//         UPDATE branch_holidays
//         SET
//           reason_type = ?,
//           reason_text = ?,
//           updated_at = CURRENT_TIMESTAMP
//         WHERE id = ?
//           AND company_id = ?
//           AND is_active = 1
//       `;

//       const [result] = await db.query(sql, [
//         reason_type,
//         reason_text,
//         id,
//         company_id
//       ]);

//       if (result.affectedRows === 0) {
//         return res.status(404).json({ message: "Holiday not found" });
//       }

//       return res.json({
//         message: "Holiday updated successfully (single)"
//       });
//     }

//     // ===============================
//     // CASE 2: BULK UPDATE
//     // ===============================
//     if (!branch_id || !year || !Array.isArray(dates) || dates.length === 0) {
//       return res.status(400).json({
//         message: "branch_id, year and dates are required for bulk update"
//       });
//     }

//     const sql = `
//       UPDATE branch_holidays
//       SET
//         reason_type = ?,
//         reason_text = ?,
//         updated_at = CURRENT_TIMESTAMP
//       WHERE company_id = ?
//         AND branch_id = ?
//         AND holiday_year = ?
//         AND holiday_date IN (?)
//         AND is_active = 1
//     `;

//     const [result] = await db.query(sql, [
//       reason_type,
//       reason_text,
//       company_id,
//       branch_id,
//       year,
//       dates
//     ]);

//     return res.json({
//       message: "Holidays updated successfully (bulk)",
//       affected_rows: result.affectedRows
//     });

//   } catch (err) {
//     logger.error(MODULE_NAME, "Failed to update holiday(s)", err);
//     res.status(500).json({
//       message: "Failed to update holiday(s)"
//     });
//   }
// };


export const updateBranchHoliday = async (req, res) => {
  const {
    id,
    branch_id,
    year,
    dates,
    reason_type,
    reason_text
  } = req.body;

  const company_id = req.user.company_id;

  if (!reason_type || !reason_text) {
    return res.status(400).json({
      message: "reason_type and reason_text are required"
    });
  }

  try {
    /* ===============================
       CASE 1: SINGLE UPDATE
    =============================== */
    if (id) {

      const [[holiday]] = await db.query(
        `SELECT branch_id, holiday_date
         FROM branch_holidays
         WHERE id = ?
           AND company_id = ?
           AND is_active = 1`,
        [id, company_id]
      );

      if (!holiday) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      const sql = `
        UPDATE branch_holidays
        SET
          reason_type = ?,
          reason_text = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND company_id = ?
          AND is_active = 1
      `;

      const [result] = await db.query(sql, [
        reason_type,
        reason_text,
        id,
        company_id
      ]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      /* 🔔 Notify branch employees */
      const [employees] = await db.query(
        `SELECT id FROM employees
         WHERE company_id = ?
           AND branch_id = ?`,
        [company_id, holiday.branch_id]
      );

      for (const emp of employees) {
        await sendNotification({
          company_id,
          user_type: "EMPLOYEE",
          user_id: emp.id,
          title: "Holiday Updated",
          message: `Holiday on ${holiday.holiday_date} has been updated. Reason: ${reason_text}`,
          notification_type: "BRANCH_HOLIDAY_UPDATE",
          reference_type: "BRANCH_HOLIDAY",
          action_url: `/employee/holidays`
        });
      }

      return res.json({
        message: "Holiday updated successfully (single)"
      });
    }

    /* ===============================
       CASE 2: BULK UPDATE
    =============================== */
    if (!branch_id || !year || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        message: "branch_id, year and dates are required for bulk update"
      });
    }

    const sql = `
      UPDATE branch_holidays
      SET
        reason_type = ?,
        reason_text = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
        AND branch_id = ?
        AND holiday_year = ?
        AND holiday_date IN (?)
        AND is_active = 1
    `;

    const [result] = await db.query(sql, [
      reason_type,
      reason_text,
      company_id,
      branch_id,
      year,
      dates
    ]);

    /* 🔔 Notify branch employees */
    const [employees] = await db.query(
      `SELECT id FROM employees
       WHERE company_id = ?
         AND branch_id = ?`,
      [company_id, branch_id]
    );

    const formattedDates = dates.join(", ");

    for (const emp of employees) {
      await sendNotification({
        company_id,
        user_type: "EMPLOYEE",
        user_id: emp.id,
        title: "Holiday Updated",
        message: `Holiday details updated for ${formattedDates}. Reason: ${reason_text}`,
        notification_type: "BRANCH_HOLIDAY_UPDATE",
        reference_type: "BRANCH_HOLIDAY",
        action_url: `/employee/holidays`
      });
    }

    return res.json({
      message: "Holidays updated successfully (bulk)",
      affected_rows: result.affectedRows
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update holiday(s)", err);
    res.status(500).json({
      message: "Failed to update holiday(s)"
    });
  }
};
/**
 * DELETE holiday (soft delete)
 */
export const deleteBranchHoliday = async (req, res) => {
  const { id, branch_id, year, dates } = req.body;
  const company_id = req.user.company_id;

  try {
    /**
     * ===============================
     * CASE 1: SINGLE DELETE
     * ===============================
     */
    if (id) {
      const sql = `
        UPDATE branch_holidays
        SET
          is_active = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND company_id = ?
          AND is_active = 1
      `;

      const [result] = await db.query(sql, [id, company_id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Holiday not found" });
      }

      return res.json({
        message: "Holiday removed successfully (single)"
      });
    }

    /**
     * ===============================
     * CASE 2: BULK DELETE
     * ===============================
     */
    if (!branch_id || !year || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        message: "branch_id, year and dates are required for bulk delete"
      });
    }

    const sql = `
      UPDATE branch_holidays
      SET
        is_active = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = ?
        AND branch_id = ?
        AND holiday_year = ?
        AND holiday_date IN (?)
        AND is_active = 1
    `;

    const [result] = await db.query(sql, [
      company_id,
      branch_id,
      year,
      dates
    ]);

    return res.json({
      message: "Holidays removed successfully (bulk)",
      affected_rows: result.affectedRows
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Failed to remove holiday(s)", err);
    return res.status(500).json({
      message: "Failed to remove holiday(s)"
    });
  }
};


