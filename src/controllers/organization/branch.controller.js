import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "BRANCH_CONTROLLER";

/* ============================
   CREATE BRANCH
============================ */
export const createBranch = async (req, res) => {
  const {
    branch_code,
    branch_name,
    location,
    address,
    phone,
    email,
  } = req.body;

  const { company_id, id: adminId } = req.user;

  if (!branch_name?.trim()) {
    return res.status(400).json({ message: "Branch name is required" });
  }

  const sql = `
    INSERT INTO ${TABLES.BRANCHES} (
      company_id,
      branch_code,
      branch_name,
      location,
      address,
      phone,
      email,
      created_by_admin_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await dbExec(db, sql, [
      company_id,
      branch_code || null,
      branch_name.trim(),
      location || null,
      address || null,
      phone || null,
      email || null,
      adminId,
    ]);

    res.status(201).json({ message: "Branch created successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to create branch", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Branch already exists" });
    }

    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   LIST BRANCHES
============================ */
export const listBranches = async (req, res) => {
  try {
    const { company_id } = req.user;

    const sql = `
      SELECT
        id,
        branch_code,
        branch_name,
        location,
        address,
        phone,
        email,
        is_active
      FROM ${TABLES.BRANCHES}
      WHERE company_id = ?
      ORDER BY branch_name
    `;

    const rows = await dbExec(db, sql, [company_id]);
    res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list branches", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE BRANCH
============================ */
export const updateBranch = async (req, res) => {
  const { id } = req.params;
  const {
    branch_code,
    branch_name,
    location,
    address,
    phone,
    email,
  } = req.body;

  const { company_id } = req.user;

  if (!branch_name?.trim()) {
    return res.status(400).json({ message: "Branch name is required" });
  }

  const sql = `
    UPDATE ${TABLES.BRANCHES}
    SET
      branch_code = ?,
      branch_name = ?,
      location = ?,
      address = ?,
      phone = ?,
      email = ?
    WHERE id = ?
      AND company_id = ?
  `;

  try {
    const result = await dbExec(db, sql, [
      branch_code || null,
      branch_name.trim(),
      location || null,
      address || null,
      phone || null,
      email || null,
      id,
      company_id,
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.json({ message: "Branch updated successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update branch", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Branch code already exists" });
    }

    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   TOGGLE BRANCH STATUS
============================ */
export const toggleBranchStatus = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  const sql = `
    UPDATE ${TABLES.BRANCHES}
    SET is_active = IF(is_active = 1, 0, 1)
    WHERE id = ?
      AND company_id = ?
  `;

  try {
    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.json({ message: "Branch status updated" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to toggle branch status", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   DELETE BRANCH (HARD DELETE – TEMP)
============================ */
export const deleteBranch = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  const sql = `
    DELETE FROM ${TABLES.BRANCHES}
    WHERE id = ?
      AND company_id = ?
  `;

  try {
    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.json({ message: "Branch deleted successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to delete branch", err);
    res.status(500).json({ message: "DB error" });
  }
};
