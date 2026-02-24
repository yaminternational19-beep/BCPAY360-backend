import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "HR_PERMISSIONS_CONTROLLER";

/* =====================================================
   GET HR PERMISSIONS
===================================================== */
export const getHRPermissions = async (req, res) => {
  const { hrId } = req.params;
  const { company_id } = req.user;

  try {
    // validate HR
    const hr = await dbExec(
      db,
      `SELECT id, branch_id
       FROM ${TABLES.HR_USERS}
       WHERE id=? AND company_id=?
       LIMIT 1`,
      [hrId, company_id]
    );

    if (!hr.length) {
      return res.status(404).json({ message: "HR not found" });
    }

    const sql = `
      SELECT module_key, allowed
      FROM ${TABLES.HR_PERMISSIONS}
      WHERE hr_id=? AND company_id=?
      ORDER BY module_key
    `;

    const permissions = await dbExec(db, sql, [hrId, company_id]);
    return res.json(permissions);
  } catch (err) {
    logger.error(MODULE_NAME, "Database error", err);
    return res.status(500).json({ message: "DB error" });
  }
};


/* =====================================================
   SAVE / UPDATE HR PERMISSIONS (UPSERT)
===================================================== */
export const saveHRPermissions = async (req, res) => {
  const { hrId } = req.params;
  const { permissions, branch_id } = req.body;
  const { company_id } = req.user;

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ message: "permissions array required" });
  }

  try {
    // validate HR
    const hr = await dbExec(
      db,
      `SELECT id FROM ${TABLES.HR_USERS}
       WHERE id=? AND company_id=? AND branch_id=?`,
      [hrId, company_id, branch_id]
    );

    if (!hr.length) {
      return res.status(400).json({ message: "Invalid HR or branch" });
    }

    // 1️⃣ delete old permissions
    await dbExec(
      db,
      `DELETE FROM ${TABLES.HR_PERMISSIONS}
       WHERE hr_id=? AND company_id=?`,
      [hrId, company_id]
    );

    // 2️⃣ insert new permissions
    if (permissions.length) {
      const values = permissions.map(p => [
        company_id,
        branch_id,
        hrId,
        p.module_key,
        p.allowed ? 1 : 0,
      ]);

      const sql = `
        INSERT INTO ${TABLES.HR_PERMISSIONS}
        (company_id, branch_id, hr_id, module_key, allowed)
        VALUES ?
      `;

      await db.query(sql, [values]);
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to save HR permissions", err);
    return res.status(500).json({ message: "Save failed" });
  }
};


/* =====================================================
   DELETE SINGLE MODULE PERMISSION
===================================================== */
export const deleteHRPermission = async (req, res) => {
  const { hrId, moduleKey } = req.params;
  const { company_id } = req.user;

  try {
    const result = await dbExec(
      db,
      `DELETE FROM ${TABLES.HR_PERMISSIONS}
       WHERE hr_id=? AND module_key=? AND company_id=?`,
      [hrId, moduleKey, company_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Permission not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error(MODULE_NAME, "Database error", err);
    return res.status(500).json({ message: "DB error" });
  }
};


/* =====================================================
   RESET ALL HR PERMISSIONS
===================================================== */
export const resetHRPermissions = async (req, res) => {
  const { hrId } = req.params;
  const { company_id } = req.user;

  try {
    const result = await dbExec(
      db,
      `DELETE FROM ${TABLES.HR_PERMISSIONS}
       WHERE hr_id=? AND company_id=?`,
      [hrId, company_id]
    );

    return res.json({
      success: true,
      deleted: result.affectedRows,
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to reset HR permissions", err);
    return res.status(500).json({ message: "Reset failed" });
  }
};

