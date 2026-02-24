import db from "../models/db.js";
import { dbExec } from "../utils/dbExec.js";
import { TABLES } from "../utils/tableNames.js";

export const createHRService = async (hrData, adminId) => {
    const { company_id, branch_id, department_id, emp_id, password_hash } = hrData;

    const insertSql = `
      INSERT INTO ${TABLES.HR_USERS}
        (company_id, branch_id, department_id, emp_id, password_hash, created_by_admin_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const result = await dbExec(db, insertSql, [
        company_id,
        branch_id,
        department_id,
        emp_id,
        password_hash,
        adminId,
    ]);

    return { id: result.insertId };
};

export const listHRsService = async (company_id) => {
    const sql = `
      SELECT
        h.id,
        h.emp_id,
        h.is_active,
        b.id AS branch_id,
        b.branch_name,
        d.id AS department_id,
        d.department_name
      FROM ${TABLES.HR_USERS} h
      JOIN ${TABLES.BRANCHES} b ON b.id = h.branch_id
      JOIN ${TABLES.DEPARTMENTS} d ON d.id = h.department_id
      WHERE h.company_id = ?
      ORDER BY h.created_at DESC
    `;

    return await dbExec(db, sql, [company_id]);
};
