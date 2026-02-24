import db from "../../models/db.js";
import path from "path";
import {
  uploadToS3,
  generateEmployeeS3Key,
  getS3SignedUrl,
  deleteS3Object
} from "../../utils/s3Upload.util.js";
import { S3_BUCKET_NAME } from "../../config/s3.config.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "ADMIN_FORMS_CONTROLLER";



export const getEmployeesByForm = async (req, res) => {
  try {
    const {
      formCode,
      periodType,
      financialYear,
      year,
      month,
      branchId,
      departmentId
    } = req.query;

    /* =====================
       VALIDATION
    ===================== */
    if (!formCode || !periodType) {
      return res.status(400).json({
        message: "formCode and periodType are required"
      });
    }

    if (periodType === "FY" && !financialYear) {
      return res.status(400).json({
        message: "financialYear is required for FY forms"
      });
    }

    if (periodType === "MONTH" && (!year || !month)) {
      return res.status(400).json({
        message: "year and month are required for MONTH forms"
      });
    }

    const companyId = req.user.company_id;

    /* =====================
       JOIN CONDITIONS
    ===================== */
    let joinCondition = `
      efd.employee_id = e.id
      AND efd.form_code = ?
      AND efd.period_type = ?
    `;
    const params = [formCode, periodType];

    if (periodType === "FY") {
      joinCondition += " AND efd.financial_year = ?";
      params.push(financialYear);
    } else {
      joinCondition += " AND efd.doc_year = ? AND efd.doc_month = ?";
      params.push(year, month);
    }

    /* =====================
       WHERE CONDITIONS
    ===================== */
    let whereClause = `
      WHERE e.company_id = ?
      AND e.employee_status = 'ACTIVE'
    `;
    params.push(companyId);

    if (branchId) {
      whereClause += " AND e.branch_id = ?";
      params.push(branchId);
    }

    if (departmentId) {
      whereClause += " AND e.department_id = ?";
      params.push(departmentId);
    }

    /* =====================
       FINAL QUERY
    ===================== */
    const sql = `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.full_name,
        e.phone,
        e.joining_date,

        e.branch_id,
        b.branch_name,

        e.department_id,
        d.department_name,

        efd.id AS document_id,
        efd.created_at AS uploaded_at,
        efd.storage_object_key

      FROM employees e

      LEFT JOIN branches b
        ON b.id = e.branch_id

      LEFT JOIN departments d
        ON d.id = e.department_id

      LEFT JOIN employee_form_documents efd
        ON ${joinCondition}

      ${whereClause}
      ORDER BY e.employee_code
    `;

    const [rows] = await db.query(sql, params);

    /* =====================
       RESPONSE BUILD
    ===================== */
    const available = [];
    const missing = [];

    for (const row of rows) {
      if (row.document_id && row.storage_object_key) {

        const viewUrl = await getS3SignedUrl(
          row.storage_object_key,
          3600,
          { disposition: "inline" }
        );

        const downloadUrl = await getS3SignedUrl(
          row.storage_object_key,
          3600,
          { disposition: "attachment" }
        );

        available.push({
          employee_id: row.employee_id,
          employee_code: row.employee_code,
          full_name: row.full_name,
          phone: row.phone,
          joining_date: row.joining_date,

          branch_id: row.branch_id,
          branch_name: row.branch_name,

          department_id: row.department_id,
          department_name: row.department_name,

          document_id: row.document_id,
          uploaded_at: row.uploaded_at,

          view_url: viewUrl,
          download_url: downloadUrl
        });

      } else {
        missing.push({
          employee_id: row.employee_id,
          employee_code: row.employee_code,
          full_name: row.full_name,
          phone: row.phone,
          joining_date: row.joining_date,

          branch_id: row.branch_id,
          branch_name: row.branch_name,

          department_id: row.department_id,
          department_name: row.department_name,

          document_id: null,
          uploaded_at: null,
          view_url: null,
          download_url: null
        });
      }
    }

    /* =====================
       FINAL RESPONSE
    ===================== */
    return res.json({
      summary: {
        total: rows.length,
        available: available.length,
        missing: missing.length
      },
      available,
      missing
    });

  } catch (error) {
    console.error("GET EMPLOYEE FORMS ERROR:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};


export const uploadEmployeeForm = async (req, res) => {
  try {
    const {
      employeeId,
      formCode,
      periodType,
      financialYear,
      year,
      month
    } = req.body;

    /* =====================
       BASIC VALIDATION
    ===================== */
    if (!employeeId || !formCode || !periodType) {
      return res.status(400).json({
        message: "employeeId, formCode and periodType are required"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Document file is required"
      });
    }

    if (periodType === "FY" && !financialYear) {
      return res.status(400).json({
        message: "financialYear is required for FY forms"
      });
    }

    if (periodType === "MONTH" && (!year || !month)) {
      return res.status(400).json({
        message: "year and month are required for MONTH forms"
      });
    }

    const uploaderRole = req.user.role;
    const uploaderId = req.user.id;

    /* =====================
       DUPLICATE CHECK
    ===================== */
    let checkSql = `
      SELECT id
      FROM employee_form_documents
      WHERE employee_id = ?
        AND form_code = ?
        AND period_type = ?
    `;
    const checkParams = [employeeId, formCode, periodType];

    if (periodType === "FY") {
      checkSql += " AND financial_year = ?";
      checkParams.push(financialYear);
    } else {
      checkSql += " AND doc_year = ? AND doc_month = ?";
      checkParams.push(year, month);
    }

    const [existing] = await db.query(checkSql, checkParams);

    if (existing.length > 0) {
      return res.status(409).json({
        message: "Document already uploaded for this employee and period"
      });
    }

    /* =====================
    BUILD CANONICAL S3 KEY
    ===================== */
    // 🔒 SECURITY: Resolve TARGET employee context (not Admin's)
    const [[targetEmp]] = await db.query(
      `SELECT company_id, branch_id, employee_code FROM employees WHERE id = ? AND company_id = ?`,
      [employeeId, req.user.company_id]
    );

    if (!targetEmp) {
      return res.status(404).json({ message: "Target employee not found or access denied" });
    }

    const s3Key = generateEmployeeS3Key(
      {
        companyId: targetEmp.company_id,
        branchId: targetEmp.branch_id,
        employeeCode: targetEmp.employee_code
      },
      {
        fieldname: formCode,
        originalname: req.file.originalname
      }
    );

    /* =====================
       UPLOAD TO S3
    ===================== */
    const s3Result = await uploadToS3(
      req.file.buffer,
      s3Key,
      req.file.mimetype
    );

    /* =====================
       INSERT DB RECORD
    ===================== */
    const insertSql = `
      INSERT INTO employee_form_documents (
        employee_id,
        form_code,
        period_type,
        financial_year,
        doc_year,
        doc_month,
        storage_provider,
        storage_bucket,
        storage_object_key,
        file_path,
        is_employee_visible,
        uploaded_by_role,
        uploaded_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const insertParams = [
      employeeId,
      formCode,
      periodType,
      periodType === "FY" ? financialYear : null,
      periodType === "MONTH" ? year : null,
      periodType === "MONTH" ? month : null,
      "S3",
      S3_BUCKET_NAME,
      s3Result.key,
      null,
      1,
      uploaderRole,
      uploaderId
    ];

    await db.query(insertSql, insertParams);

    return res.status(201).json({
      success: true,
      message: "Form uploaded successfully"
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to upload employee form", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};

export const replaceEmployeeForm = async (req, res) => {
  try {
    const {
      employeeId,
      formCode,
      periodType,
      financialYear,
      year,
      month
    } = req.body;

    if (!employeeId || !formCode || !periodType) {
      return res.status(400).json({
        message: "employeeId, formCode and periodType are required"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Replacement document file is required"
      });
    }

    if (periodType === "FY" && !financialYear) {
      return res.status(400).json({
        message: "financialYear is required for FY forms"
      });
    }

    if (periodType === "MONTH" && (!year || !month)) {
      return res.status(400).json({
        message: "year and month are required for MONTH forms"
      });
    }

    /* =====================
       FIND EXISTING RECORD
    ===================== */
    let findSql = `
      SELECT id, storage_object_key
      FROM employee_form_documents
      WHERE employee_id = ?
        AND form_code = ?
        AND period_type = ?
    `;
    const params = [employeeId, formCode, periodType];

    if (periodType === "FY") {
      findSql += " AND financial_year = ?";
      params.push(financialYear);
    } else {
      findSql += " AND doc_year = ? AND doc_month = ?";
      params.push(year, month);
    }

    const [[existing]] = await db.query(findSql, params);

    if (!existing) {
      return res.status(404).json({
        message: "No existing document found to replace"
      });
    }

    /* =====================
    BUILD SAME S3 KEY
    ===================== */
    // 🔒 SECURITY: Resolve TARGET employee context (not Admin's)
    const [[targetEmp]] = await db.query(
      `SELECT company_id, branch_id, employee_code FROM employees WHERE id = ? AND company_id = ?`,
      [employeeId, req.user.company_id]
    );

    if (!targetEmp) {
      return res.status(404).json({ message: "Target employee not found or access denied" });
    }

    const s3Key = generateEmployeeS3Key(
      {
        companyId: targetEmp.company_id,
        branchId: targetEmp.branch_id,
        employeeCode: targetEmp.employee_code
      },
      {
        fieldname: formCode,
        originalname: req.file.originalname
      }
    );

    /* =====================
       UPLOAD (OVERWRITE)
    ===================== */
    const s3Result = await uploadToS3(
      req.file.buffer,
      s3Key,
      req.file.mimetype
    );

    /* =====================
       UPDATE DB
    ===================== */
    await db.query(
      `
      UPDATE employee_form_documents
      SET
        storage_object_key = ?,
        storage_bucket = ?,
        updated_at = CURRENT_TIMESTAMP,
        uploaded_by_role = ?,
        uploaded_by_id = ?
      WHERE id = ?
      `,
      [
        s3Result.key,
        S3_BUCKET_NAME,
        req.user.role,
        req.user.id,
        existing.id
      ]
    );

    return res.json({
      success: true,
      message: "Form replaced successfully"
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to replace employee form", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};




export const deleteEmployeeForm = async (req, res) => {
  try {
    const {
      employeeId,
      formCode,
      periodType,
      financialYear,
      year,
      month
    } = req.body;

    if (!employeeId || !formCode || !periodType) {
      return res.status(400).json({
        message: "employeeId, formCode and periodType are required"
      });
    }

    /* =====================
       FIND DOCUMENT
    ===================== */
    let findSql = `
      SELECT id, storage_object_key
      FROM employee_form_documents
      WHERE employee_id = ?
        AND form_code = ?
        AND period_type = ?
    `;
    const params = [employeeId, formCode, periodType];

    if (periodType === "FY") {
      findSql += " AND financial_year = ?";
      params.push(financialYear);
    } else {
      findSql += " AND doc_year = ? AND doc_month = ?";
      params.push(year, month);
    }

    const [[existing]] = await db.query(findSql, params);

    if (!existing) {
      return res.status(404).json({
        message: "Document not found"
      });
    }

    /* =====================
       DELETE FROM S3
    ===================== */
    if (existing.storage_object_key) {
      await deleteS3Object(existing.storage_object_key);
    }

    /* =====================
       DELETE DB RECORD
    ===================== */
    await db.query(
      `DELETE FROM employee_form_documents WHERE id = ?`,
      [existing.id]
    );

    return res.json({
      success: true,
      message: "Form deleted successfully"
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to delete employee form", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
};
