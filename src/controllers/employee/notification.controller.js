import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE = "EMPLOYEE_NOTIFICATION_CONTROLLER";

/* =====================================
   1. GET ALL NOTIFICATIONS
===================================== */
export const getNotifications = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const employee_id = req.user.id;
    const company_id = req.user.company_id;

    const [notifications] = await connection.query(
      `SELECT id, title, message, is_read, created_at
       FROM notifications
       WHERE user_type = 'EMPLOYEE'
         AND user_id = ?
         AND company_id = ?
         AND is_deleted = 0
       ORDER BY created_at DESC`,
      [employee_id, company_id]
    );

    const [[countRow]] = await connection.query(
      `SELECT COUNT(*) as unread_count
       FROM notifications
       WHERE user_type = 'EMPLOYEE'
         AND user_id = ?
         AND company_id = ?
         AND is_read = 0
         AND is_deleted = 0`,
      [employee_id, company_id]
    );

    return res.status(200).json({
      success: true,
      unread_count: countRow.unread_count,
      notifications_data: notifications
    });

  } catch (err) {
    logger.error(MODULE, "GET_ERROR", err);
    return res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
};
export const notificationAction = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const employee_id = req.user.id;
    const company_id = req.user.company_id;
    const { action, id, ids } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, message: "Action required" });
    }

    /* ===============================
       READ SINGLE
    =============================== */
    if (action === "READ" && id) {
      await connection.query(
        `UPDATE notifications
         SET is_read = 1
         WHERE id = ?
           AND user_id = ?
           AND company_id = ?
           AND user_type = 'EMPLOYEE'`,
        [id, employee_id, company_id]
      );
    }

    /* ===============================
       READ ALL
    =============================== */
    else if (action === "READ_ALL") {
      await connection.query(
        `UPDATE notifications
         SET is_read = 1
         WHERE user_id = ?
           AND company_id = ?
           AND user_type = 'EMPLOYEE'
           AND is_deleted = 0`,
        [employee_id, company_id]
      );
    }

    /* ===============================
       DELETE SINGLE
    =============================== */
    else if (action === "DELETE" && id) {
      await connection.query(
        `UPDATE notifications
         SET is_deleted = 1
         WHERE id = ?
           AND user_id = ?
           AND company_id = ?
           AND user_type = 'EMPLOYEE'`,
        [id, employee_id, company_id]
      );
    }


    /* ===============================
       DELETE ALL
    =============================== */
    else if (action === "DELETE_ALL") {
      await connection.query(
        `UPDATE notifications
         SET is_deleted = 1
         WHERE user_id = ?
           AND company_id = ?
           AND user_type = 'EMPLOYEE'
           AND is_deleted = 0`,
        [employee_id, company_id]
      );
    }

    else {
      return res.status(400).json({ success: false, message: "Invalid action" });
    }

    let message = "Action completed successfully";

if (action === "READ") message = "Notification marked as read";
else if (action === "READ_ALL") message = "All notifications marked as read";
else if (action === "DELETE") message = "Notification deleted successfully";
else if (action === "DELETE_MULTIPLE") message = "Selected notifications deleted successfully";
else if (action === "DELETE_ALL") message = "All notifications deleted successfully";

return res.status(200).json({
  success: true,
  message
});

  } catch (err) {
    logger.error(MODULE, "ACTION_ERROR", err);
    return res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
};