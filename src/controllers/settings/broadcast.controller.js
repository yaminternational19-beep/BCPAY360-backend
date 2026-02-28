import db from "../../models/db.js";
import { sendNotification } from "../../utils/oneSignal.js";
/**
 * =====================================================
 * CREATE BROADCAST
 * POST /api/admin/broadcast
 * =====================================================
 */
// export const createBroadcast = async (req, res) => {
//   try {
//     const company_id = req.user.company_id;
//     const created_by_role = req.user.role; // COMPANY_ADMIN | HR
//     const created_by_id = req.user.id;

//     const {
//       audience_type,
//       branch_id = null,
//       employee_ids = null,
//       message
//     } = req.body;

//     // ---- basic validation ----
//     if (!audience_type || !message) {
//       return res.status(422).json({
//         message: "audience_type and message are required"
//       });
//     }

//     // ---- audience-specific validation ----
//     if (audience_type === "BRANCH" && !branch_id) {
//       return res.status(422).json({
//         message: "branch_id is required for BRANCH broadcast"
//       });
//     }

//     if (audience_type === "EMPLOYEE") {
//       if (
//         !branch_id ||
//         !Array.isArray(employee_ids) ||
//         employee_ids.length === 0
//       ) {
//         return res.status(422).json({
//           message: "branch_id and employee_ids are required for EMPLOYEE broadcast"
//         });
//       }
//     }

//     // ---- normalize storage ----
//     const finalBranchId =
//       audience_type === "ALL" ? null : branch_id;

//     const finalEmployeeIds =
//       audience_type === "EMPLOYEE"
//         ? JSON.stringify(employee_ids)
//         : null;

//     await db.query(
//       `INSERT INTO broadcasts
//        (company_id, branch_id, audience_type, message,
//         employee_ids, created_by_role, created_by_id)
//        VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         company_id,
//         finalBranchId,
//         audience_type,
//         message,
//         finalEmployeeIds,
//         created_by_role,
//         created_by_id
//       ]
//     );

//     res.status(201).json({
//       message: "Broadcast created successfully"
//     });
//   } catch (err) {
//     console.error("Create Broadcast Error:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };


export const createBroadcast = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const created_by_role = req.user.role;
    const created_by_id = req.user.id;

    const {
      audience_type,
      branch_id = null,
      employee_ids = null,
      message
    } = req.body;

    // ---- basic validation ----
    if (!audience_type || !message) {
      return res.status(422).json({
        message: "audience_type and message are required"
      });
    }

    if (audience_type === "BRANCH" && !branch_id) {
      return res.status(422).json({
        message: "branch_id is required for BRANCH broadcast"
      });
    }

    if (audience_type === "EMPLOYEE") {
      if (
        !branch_id ||
        !Array.isArray(employee_ids) ||
        employee_ids.length === 0
      ) {
        return res.status(422).json({
          message: "branch_id and employee_ids are required for EMPLOYEE broadcast"
        });
      }
    }

    const finalBranchId =
      audience_type === "ALL" ? null : branch_id;

    const finalEmployeeIds =
      audience_type === "EMPLOYEE"
        ? JSON.stringify(employee_ids)
        : null;

    const [result] = await db.query(
      `INSERT INTO broadcasts
       (company_id, branch_id, audience_type, message,
        employee_ids, created_by_role, created_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        finalBranchId,
        audience_type,
        message,
        finalEmployeeIds,
        created_by_role,
        created_by_id
      ]
    );

    const broadcastId = result.insertId;

    /* ==========================================
       🔔 SEND NOTIFICATIONS BASED ON AUDIENCE
    ========================================== */

    let targetEmployees = [];

    if (audience_type === "ALL") {
      const [employees] = await db.query(
        `SELECT id FROM employees WHERE company_id = ?`,
        [company_id]
      );
      targetEmployees = employees;
    }

    if (audience_type === "BRANCH") {
      const [employees] = await db.query(
        `SELECT id FROM employees 
         WHERE company_id = ? AND branch_id = ?`,
        [company_id, branch_id]
      );
      targetEmployees = employees;
    }

    if (audience_type === "EMPLOYEE") {
      targetEmployees = employee_ids.map(id => ({ id }));
    }

    for (const emp of targetEmployees) {
      await sendNotification({
        company_id,
        user_type: "EMPLOYEE",
        user_id: emp.id,
        title: "Company Announcement",
        message: message.length > 180
          ? message.substring(0, 180) + "..."
          : message,
        notification_type: "BROADCAST",
        reference_id: broadcastId,
        reference_type: "BROADCAST",
        action_url: `/employee/broadcasts/${broadcastId}`
      });
    }

    /* ========================================== */

    res.status(201).json({
      message: "Broadcast created successfully"
    });

  } catch (err) {
    console.error("Create Broadcast Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
/**
 * =====================================================
 * GET ALL BROADCASTS (ADMIN HISTORY)
 * GET /api/admin/broadcast
 * =====================================================
 */
export const getBroadcasts = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const [rows] = await db.query(
      `SELECT
         id,
         message,
         audience_type,
         branch_id,
         employee_ids,
         created_by_role,
         created_by_id,
         created_at
       FROM broadcasts
       WHERE company_id = ?
       ORDER BY created_at DESC`,
      [company_id]
    );

    res.json(rows);
  } catch (err) {
    console.error("Get Broadcasts Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * =====================================================
 * GET EMPLOYEE NAMES (FOR UI DISPLAY)
 * POST /api/admin/broadcast/employees
 * =====================================================
 */
export const getBroadcastEmployees = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const [rows] = await db.query(
      `SELECT
         id,
         employee_code,
         full_name,
         branch_id
       FROM employees
       WHERE company_id = ?
       AND employee_status = 'ACTIVE'
       ORDER BY full_name ASC`,
      [company_id]
    );

    res.json(rows);
  } catch (err) {
    console.error("Get Company Employees Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * =====================================================
 * DELETE BROADCAST
 * DELETE /api/admin/broadcast/:id
 * =====================================================
 */
export const deleteBroadcast = async (req, res) => {
  try {
    const { id } = req.params;
    const company_id = req.user.company_id;

    const [result] = await db.query(
      `DELETE FROM broadcasts
       WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "Broadcast not found or access denied"
      });
    }

    res.json({ message: "Broadcast deleted successfully" });
  } catch (err) {
    console.error("Delete Broadcast Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
