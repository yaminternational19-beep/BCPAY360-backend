import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "DEPARTMENT_CONTROLLER";

/* ============================
   CREATE DEPARTMENT
============================ */
export const createDepartment = async (req, res) => {
  const { department_name, branch_id } = req.body;
  const { company_id, id: adminId } = req.user;

  if (!department_name?.trim() || !branch_id) {
    return res
      .status(400)
      .json({ message: "Department name and branch_id are required" });
  }

  const validateSql =
    `SELECT id FROM ${TABLES.BRANCHES} WHERE id = ? AND company_id = ?`;

  try {
    const rows = await dbExec(db, validateSql, [branch_id, company_id]);

    if (!rows.length) {
      return res
        .status(400)
        .json({ message: "Invalid branch for this company" });
    }

    const sql = `
      INSERT INTO ${TABLES.DEPARTMENTS}
        (company_id, branch_id, department_name, created_by_admin_id)
      VALUES (?, ?, ?, ?)
    `;

    await dbExec(db, sql, [company_id, branch_id, department_name.trim(), adminId]);

    res.status(201).json({ message: "Department created successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Department already exists in this branch" });
    }

    logger.error(MODULE_NAME, "Failed to create department", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   LIST DEPARTMENTS (ADMIN)
   branch_id REQUIRED
============================ */
export const listDepartments = async (req, res) => {
  const { company_id } = req.user;
  const { branch_id } = req.query;

  if (!branch_id) {
    return res.status(400).json({ message: "branch_id is required" });
  }

  const sql = `
    SELECT id, department_name, branch_id
    FROM ${TABLES.DEPARTMENTS}
    WHERE company_id = ?
      AND branch_id = ?
      AND is_active = 1
    ORDER BY department_name
  `;

  try {
    const rows = await dbExec(db, sql, [company_id, branch_id]);
    res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list departments", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE DEPARTMENT
============================ */
export const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { department_name } = req.body;
  const { company_id } = req.user;

  if (!department_name?.trim()) {
    return res.status(400).json({ message: "Department name required" });
  }

  const sql = `
    UPDATE ${TABLES.DEPARTMENTS}
    SET department_name = ?
    WHERE id = ?
      AND company_id = ?
  `;

  try {
    const result = await dbExec(db, sql, [department_name.trim(), id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ message: "Department updated successfully" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Department already exists in this branch" });
    }

    logger.error(MODULE_NAME, "Failed to update department", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   DELETE DEPARTMENT (HARD)
============================ */
export const deleteDepartment = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  const sql = `
    DELETE FROM ${TABLES.DEPARTMENTS}
    WHERE id = ?
      AND company_id = ?
  `;

  try {
    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ message: "Department deleted successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to delete department", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   PUBLIC LIST (LOGIN / HR)
============================ */
export const listDepartmentsPublic = async (req, res) => {
  const { company_id } = req.user; // 🔒 SECURITY: Always use token context

  if (!company_id) {
    return res.status(401).json({ message: "Unauthorized: Company context missing" });
  }

  const sql = `
    SELECT id, department_name
    FROM ${TABLES.DEPARTMENTS}
    WHERE company_id = ?
      AND is_active = 1
    ORDER BY department_name
  `;

  try {
    const rows = await dbExec(db, sql, [company_id]);
    res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list departments (public)", err);
    res.status(500).json({ message: "DB error" });
  }
};
