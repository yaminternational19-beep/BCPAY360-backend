import db from "../models/db.js";
import logger from "../utils/logger.js";

const MODULE_NAME = "HR_PERMISSION_MIDDLEWARE";

const checkHrPermission = (module_key, action) => {
  return async (req, res, next) => {
    try {
      if (req.user.role === "COMPANY_ADMIN") return next();

      const [rows] = await db.query(
        `SELECT ${action}
         FROM hr_permissions
         WHERE hr_id = ? AND module_key = ?`,
        [req.user.id, module_key]
      );

      if (!rows.length || rows[0][action] !== 1) {
        return res.status(403).json({ message: "Access denied" });
      }

      next();
    } catch (err) {
      logger.error(MODULE_NAME, "Permission check failed", err);
      res.status(500).json({ message: "Permission check failed" });
    }
  };
};

export default checkHrPermission;
