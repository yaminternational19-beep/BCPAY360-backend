import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "DESIGNATION_CONTROLLER";

/* ============================
   CREATE DESIGNATION
============================ */
export const createDesignation = async (req, res) => {
  const {
    department_id,
    branch_id,
    designation_name,
    designation_code,
  } = req.body;

  const { company_id, id: created_by_id } = req.user;

  if (!designation_name?.trim() || !department_id || !branch_id) {
    return res.status(400).json({
      message: "department_id, branch_id and designation_name are required",
    });
  }

  try {
    // ✅ validate department + branch belong to same company
    const validateSql = `
      SELECT 1
      FROM ${TABLES.DEPARTMENTS} d
      JOIN ${TABLES.BRANCHES} b ON b.id = ?
      WHERE d.id = ?
        AND d.company_id = ?
        AND b.company_id = ?
      LIMIT 1
    `;

    const valid = await dbExec(db, validateSql, [
      branch_id,
      department_id,
      company_id,
      company_id,
    ]);

    if (!valid.length) {
      return res.status(400).json({
        message: "Invalid department or branch for this company",
      });
    }

    const insertSql = `
      INSERT INTO ${TABLES.DESIGNATIONS} (
        company_id,
        branch_id,
        department_id,
        designation_name,
        designation_code,
        created_by_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await dbExec(db, insertSql, [
      company_id,
      branch_id,
      department_id,
      designation_name.trim(),
      designation_code || null,
      created_by_id,
    ]);

    return res
      .status(201)
      .json({ message: "Designation created successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to create designation", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Designation already exists" });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

/* ============================
   LIST DESIGNATIONS
   branch_id + department_id REQUIRED
============================ */
export const listDesignations = async (req, res) => {
  const { company_id } = req.user;
  const { department_id, branch_id } = req.query;

  if (!department_id || !branch_id) {
    return res.status(400).json({
      message: "branch_id and department_id are required",
    });
  }

  try {
    const sql = `
      SELECT
        id,
        designation_name,
        designation_code,
        is_active
      FROM ${TABLES.DESIGNATIONS}
      WHERE company_id = ?
        AND branch_id = ?
        AND department_id = ?
        AND is_active = 1
      ORDER BY designation_name
    `;

    const rows = await dbExec(db, sql, [
      company_id,
      branch_id,
      department_id,
    ]);

    return res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list designations", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ============================
   UPDATE DESIGNATION
============================ */
export const updateDesignation = async (req, res) => {
  const { id } = req.params;
  const { designation_name, designation_code } = req.body;
  const { company_id } = req.user;

  if (!designation_name?.trim()) {
    return res.status(400).json({
      message: "Designation name is required",
    });
  }

  try {
    const sql = `
      UPDATE ${TABLES.DESIGNATIONS}
      SET
        designation_name = ?,
        designation_code = ?
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [
      designation_name.trim(),
      designation_code || null,
      id,
      company_id,
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ message: "Designation updated successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update designation", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Designation already exists in this department",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

/* ============================
   TOGGLE DESIGNATION STATUS
============================ */
export const toggleDesignationStatus = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      UPDATE ${TABLES.DESIGNATIONS}
      SET is_active = IF(is_active = 1, 0, 1)
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ message: "Designation status updated" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to toggle designation status", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ============================
   DELETE DESIGNATION (HARD)
============================ */
export const deleteDesignation = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      DELETE FROM ${TABLES.DESIGNATIONS}
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ message: "Designation deleted successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to delete designation", err);
    return res.status(500).json({ message: "Server error" });
  }
};
