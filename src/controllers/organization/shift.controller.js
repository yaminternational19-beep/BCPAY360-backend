import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "SHIFT_CONTROLLER";

/* ============================
   CREATE SHIFT
============================ */
export const createShift = async (req, res) => {
  const {
    shift_name,
    start_time,
    end_time,
    description,
    branch_id,
  } = req.body;

  const { company_id, id: created_by_id } = req.user;

  if (!shift_name?.trim() || !start_time || !end_time || !branch_id) {
    return res.status(400).json({
      message: "Shift name, start time, end time, and branch_id are required",
    });
  }

  try {
    // 1️⃣ Validate branch
    const validateSql =
      `SELECT id FROM ${TABLES.BRANCHES} WHERE id = ? AND company_id = ?`;
    const branchRows = await dbExec(db, validateSql, [
      branch_id,
      company_id,
    ]);

    if (!branchRows.length) {
      return res
        .status(400)
        .json({ message: "Invalid branch for this company" });
    }

    // 2️⃣ Insert shift
    const insertSql = `
      INSERT INTO ${TABLES.SHIFTS} (
        company_id,
        branch_id,
        shift_name,
        start_time,
        end_time,
        description,
        created_by_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await dbExec(db, insertSql, [
      company_id,
      branch_id,
      shift_name.trim(),
      start_time,
      end_time,
      description || null,
      created_by_id,
    ]);

    return res.status(201).json({
      message: "Shift created successfully",
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Shift already exists in this branch" });
    }

    logger.error(MODULE_NAME, "Failed to create shift", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   LIST SHIFTS
   branch_id REQUIRED
============================ */
export const listShifts = async (req, res) => {
  const { company_id } = req.user;
  const { branch_id } = req.query;

  if (!branch_id) {
    return res.status(400).json({ message: "branch_id is required" });
  }

  try {
    const sql = `
      SELECT
        id,
        shift_name,
        start_time,
        end_time,
        description,
        is_active
      FROM ${TABLES.SHIFTS}
      WHERE company_id = ?
        AND branch_id = ?
        AND is_active = 1
      ORDER BY shift_name
    `;

    const rows = await dbExec(db, sql, [company_id, branch_id]);
    return res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list shifts", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE SHIFT
============================ */
export const updateShift = async (req, res) => {
  const { id } = req.params;
  const { shift_name, start_time, end_time, description } = req.body;
  const { company_id } = req.user;

  if (!shift_name?.trim() || !start_time || !end_time) {
    return res.status(400).json({
      message: "Shift name, start time, and end time are required",
    });
  }

  try {
    const sql = `
      UPDATE ${TABLES.SHIFTS}
      SET
        shift_name = ?,
        start_time = ?,
        end_time = ?,
        description = ?
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [
      shift_name.trim(),
      start_time,
      end_time,
      description || null,
      id,
      company_id,
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Shift not found" });
    }

    return res.json({ message: "Shift updated successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Shift already exists in this branch" });
    }

    logger.error(MODULE_NAME, "Failed to update shift", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   TOGGLE SHIFT STATUS
============================ */
export const toggleShiftStatus = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      UPDATE ${TABLES.SHIFTS}
      SET is_active = IF(is_active = 1, 0, 1)
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Shift not found" });
    }

    return res.json({ message: "Shift status updated" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to toggle shift status", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   DELETE SHIFT
============================ */
export const deleteShift = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      DELETE FROM ${TABLES.SHIFTS}
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Shift not found" });
    }

    return res.json({ message: "Shift deleted successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to delete shift", err);
    return res.status(500).json({ message: "DB error" });
  }
};
