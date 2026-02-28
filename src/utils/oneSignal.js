import axios from "axios";
import db from "../models/db.js";
export const sendOneSignalPush = async (
  playerIds,
  title,
  message,
  data = {}
) => {
  if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
    return null;
  }

  if (!process.env.ONESIGNAL_APP_ID || !process.env.ONESIGNAL_REST_API_KEY) {
    console.error("OneSignal credentials missing in .env");
    return null;
  }

  try {
    const response = await axios.post(
      "https://onesignal.com/api/v1/notifications",
      {
        app_id: process.env.ONESIGNAL_APP_ID.trim(),
        include_player_ids: playerIds,
        headings: { en: title },
        contents: { en: message },
        data
      },
      {
        headers: {
          Authorization: `Basic ${process.env.ONESIGNAL_REST_API_KEY.trim()}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("Push sent:", response.data);
    return response.data;

  } catch (error) {
    console.error(
      "OneSignal Error:",
      error.response?.data || error.message
    );
    return null;
  }
};

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

  
  try {

    const [result] = await db.query(
      `INSERT INTO notifications
       (company_id, branch_id, user_type, user_id,
        title, message, notification_type,
        reference_id, reference_type, action_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    if (user_type === "EMPLOYEE") {

      const [devices] = await db.query(
        `SELECT player_id FROM employee_devices
         WHERE employee_id = ?
         AND is_active = 1`,
        [user_id]
      );

      const isValidUUID = (id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const playerIds = devices
  .map(d => d.player_id)
  .filter(id => id && isValidUUID(id));
      // console.log("Sending push to:", playerIds);
      const pushResponse = await sendOneSignalPush(
        playerIds,
        title,
        message,
        {
          notification_id: notificationId,
          reference_id,
          reference_type,
          action_url
        }
      );

      if (pushResponse) {
        await db.query(
          `UPDATE notifications
           SET is_push_sent = 1,
               push_sent_at = NOW()
           WHERE id = ?`,
          [notificationId]
        );
      }
    }

  } catch (error) {
    console.error("SEND_NOTIFICATION_ERROR:", error);
  }
};