import db from "../../../models/db.js";
import { dbExec } from "../../../utils/dbExec.js";
import { TABLES } from "../../../utils/tableNames.js";
import logger from "../../../utils/logger.js";

const MODULE_NAME = "SUPER_ADMIN_COMPANY_CONTROLLER";

/* ============================
   CREATE COMPANY (SUPER ADMIN)
============================ */
export const createCompany = async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ message: "Company name and email required" });
  }

  const countSql = `SELECT COUNT(*) AS count FROM ${TABLES.COMPANIES}`;

  try {
    const countRows = await dbExec(db, countSql, []);
    const companyCode = `CMP${String(countRows[0].count + 1).padStart(3, "0")}`;

    const insertSql = `
      INSERT INTO ${TABLES.COMPANIES} (company_code, name, email, created_by)
      VALUES (?, ?, ?, ?)
    `;

    const result = await dbExec(db, insertSql, [companyCode, name, email, req.user.id]);

    res.status(201).json({
      company: {
        id: result.insertId,
        company_code: companyCode,
        name,
        email
      }
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to create company", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   SUPER ADMIN – ALL COMPANIES
============================ */
export const getCompanies = async (req, res) => {
  const sql = `
    SELECT id, company_code, name, email, is_active, created_at
    FROM ${TABLES.COMPANIES}
    ORDER BY created_at DESC
  `;

  try {
    const rows = await dbExec(db, sql, []);
    res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to get companies", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   PUBLIC – ADMIN LOGIN DROPDOWN
============================ */
export const getCompaniesForLogin = async (req, res) => {
  try {
    const sql = `
      SELECT id, name
      FROM ${TABLES.COMPANIES}
      WHERE is_active = 1
      ORDER BY name
    `;

    const rows = await dbExec(db, sql, []);
    res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to get companies for login", err);
    res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE COMPANY NAME
============================ */
export const updateCompanyName = async (req, res) => {
  const companyId = req.params.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: "Company name required" });
  }

  const sql = `
    UPDATE ${TABLES.COMPANIES}
    SET name = ?
    WHERE id = ?
  `;

  try {
    const result = await dbExec(db, sql, [name, companyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json({ message: "Company name updated successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update company name", err);
    res.status(500).json({ message: "DB error" });
  }
};
