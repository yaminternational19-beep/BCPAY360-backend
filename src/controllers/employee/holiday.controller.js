import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "HOLIDAY_CONTROLLER";

export const getEmployeeHolidays = async (req, res) => {
  try {
    const { company_id, branch_id } = req.user;
    const { year } = req.query;

    if (!company_id || !branch_id || !year) {
      return res.status(400).json({
        message: "company_id, branch_id and year are required",
      });
    }

    const query = `
      SELECT
        holiday_date,
        reason_type,
        reason_text
      FROM branch_holidays
      WHERE company_id = ?
        AND branch_id = ?
        AND is_active = 1
        AND holiday_year = ?
      ORDER BY holiday_date ASC
    `;

    const [rows] = await db.execute(query, [
      company_id,
      branch_id,
      year,
    ]);

    const months = {
      jan: [], feb: [], mar: [], apr: [],
      may: [], jun: [], jul: [], aug: [],
      sep: [], oct: [], nov: [], dec: []
    };

    let saturday = 0;
    let sunday = 0;

    for (const row of rows) {
      const dateObj = new Date(row.holiday_date);
      const day = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
      const date = dateObj.toISOString().split("T")[0];
      const monthKey = Object.keys(months)[dateObj.getMonth()];

      const isWeekend =
        row.reason_type &&
        row.reason_type.toUpperCase().includes("WEEK");

      if (isWeekend) {
        if (day === 6) saturday = 1;
        if (day === 0) sunday = 1;
        continue; // ❌ do not include in holidays list
      }

      months[monthKey].push({
        date,
        reason_type: row.reason_type,
        reason_text: row.reason_text,
      });
    }

    const holidayCount = Object.values(months)
      .reduce((sum, m) => sum + m.length, 0);

    return res.status(200).json({
      success: true,
      count: holidayCount,
      weekend: {
        saturday,
        sunday,
      },
      months,
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to fetch holidays", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch holidays",
    });
  }
};
