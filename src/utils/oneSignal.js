import axios from "axios";

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