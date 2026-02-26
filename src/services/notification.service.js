import db from "../models/db.js";
import { sendOneSignalPush } from "../utils/oneSignal.js";

export const sendNotification = async ({
  company_id,
  branch_id = null,
  user_type,
  user_id,
  title,
  message,
  notification_type = null,
  reference_id = null,
  reference_type = null,
  action_url = null
}) => {
  const connection = await db.getConnection();

  try {
    /* -----------------------------
       1️⃣ INSERT INTO DATABASE
    ----------------------------- */
    const [result] = await connection.query(
      `
      INSERT INTO notifications
      (company_id, branch_id, user_type, user_id,
       title, message, notification_type,
       reference_id, reference_type, action_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        company_id,
        branch_id,
        user_type,
        user_id,
        title,
        message,
        notification_type,
        reference_id,
        reference_type,
        action_url
      ]
    );

    const notificationId = result.insertId;

    /* -----------------------------
       2️⃣ FETCH ACTIVE PLAYER IDS
    ----------------------------- */
    let playerIds = [];

    if (user_type === "EMPLOYEE") {
      const [devices] = await connection.query(
        `
        SELECT player_id
        FROM employee_devices
        WHERE employee_id = ?
          AND is_active = 1
          AND player_id IS NOT NULL
        `,
        [user_id]
      );

      playerIds = devices.map(d => d.player_id);
    }

    /* -----------------------------
       3️⃣ SEND PUSH
    ----------------------------- */
    if (playerIds.length > 0) {
      await sendOneSignalPush(playerIds, title, message, {
        notification_id: notificationId
      });

      await connection.query(
        `
        UPDATE notifications
        SET is_push_sent = 1,
            push_sent_at = NOW()
        WHERE id = ?
        `,
        [notificationId]
      );
    }

    return true;

  } catch (error) {
    console.error("Notification service error:", error);
    return false;
  } finally {
    connection.release();
  }
};