import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_TYPE_CONTROLLER";

/* ============================
   CREATE EMPLOYEE TYPE
============================ */
export const createEmployeeType = async (req, res) => {
  const { type_name, branch_id } = req.body;
  const { company_id, id: created_by_id } = req.user;

  if (!type_name?.trim() || !branch_id) {
    return res
      .status(400)
      .json({ message: "Type name and branch_id are required" });
  }

  try {
    // 1️⃣ Validate branch belongs to company
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

    // 2️⃣ Insert employee type
    const insertSql = `
      INSERT INTO ${TABLES.EMPLOYEE_TYPES} (
        company_id,
        branch_id,
        type_name,
        created_by_id
      )
      VALUES (?, ?, ?, ?)
    `;

    await dbExec(db, insertSql, [
      company_id,
      branch_id,
      type_name.trim(),
      created_by_id,
    ]);

    return res
      .status(201)
      .json({ message: "Employee Type created successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Employee Type already exists in this branch",
      });
    }

    logger.error(MODULE_NAME, "Failed to create employee type", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   LIST EMPLOYEE TYPES
   branch_id REQUIRED
============================ */
export const listEmployeeTypes = async (req, res) => {
  const { company_id } = req.user;
  const { branch_id } = req.query;

  if (!branch_id) {
    return res.status(400).json({ message: "branch_id is required" });
  }

  try {
    const sql = `
      SELECT
        id,
        type_name,
        is_active
      FROM ${TABLES.EMPLOYEE_TYPES}
      WHERE company_id = ?
        AND branch_id = ?
        AND is_active = 1
      ORDER BY type_name
    `;

    const rows = await dbExec(db, sql, [company_id, branch_id]);
    return res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list employee types", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE EMPLOYEE TYPE
============================ */
export const updateEmployeeType = async (req, res) => {
  const { id } = req.params;
  const { type_name } = req.body;
  const { company_id } = req.user;

  if (!type_name?.trim()) {
    return res.status(400).json({ message: "Type name is required" });
  }

  try {
    const sql = `
      UPDATE ${TABLES.EMPLOYEE_TYPES}
      SET type_name = ?
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [
      type_name.trim(),
      id,
      company_id,
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Employee Type not found" });
    }

    return res.json({ message: "Employee Type updated successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "Employee Type already exists in this branch",
      });
    }

    logger.error(MODULE_NAME, "Failed to update employee type", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   TOGGLE EMPLOYEE TYPE STATUS
============================ */
export const toggleEmployeeTypeStatus = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      UPDATE ${TABLES.EMPLOYEE_TYPES}
      SET is_active = IF(is_active = 1, 0, 1)
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Employee Type not found" });
    }

    return res.json({ message: "Employee Type status updated" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to toggle employee type status", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   DELETE EMPLOYEE TYPE
============================ */
export const deleteEmployeeType = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      DELETE FROM ${TABLES.EMPLOYEE_TYPES}
      WHERE id = ?
        AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Employee Type not found" });
    }

    return res.json({ message: "Employee Type deleted successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to delete employee type", err);
    return res.status(500).json({ message: "DB error" });
  }
};
