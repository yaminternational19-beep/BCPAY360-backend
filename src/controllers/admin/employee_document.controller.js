import db from "../../models/db.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import { uploadToS3, getS3SignedUrl, generateEmployeeS3Key } from "../../utils/s3Upload.util.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_DOCUMENT_CONTROLLER";

export const add_employee_document = async (req, res) => {
  const { employee_id, document_type, document_number } = req.body;

  
  try {
    // Validate required fields
    if (!employee_id || !document_type) {
      return res.status(400).json({
        message: "employee_id and document_type are required"
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        message: "No file uploaded. Please attach a document."
      });
    }

    // Resolve employee context for path building
    // 🔒 SECURITY: Verify company ownership
    const [[empRow]] = await db.query(
      `SELECT company_id, branch_id, employee_code 
       FROM ${TABLES.EMPLOYEES} 
       WHERE id = ? AND company_id = ?`,
      [employee_id, req.user.company_id]
    );

    if (!empRow) {
      return res.status(403).json({
        message: "Forbidden: You do not have permission to manage documents for this employee"
      });
    }

    const { company_id, branch_id, employee_code } = empRow;

    // Build path
    const fullKey = generateEmployeeS3Key(
      {
        companyId: empRow.company_id,
        branchId: empRow.branch_id,
        employeeCode: empRow.employee_code
      },
      {
        fieldname: document_type,
        originalname: req.file.originalname
      }
    );

    // Upload file to S3
    const uploadResult = await uploadToS3(
      req.file.buffer,
      fullKey,
      req.file.mimetype
    );

    const s3Url = uploadResult.url;
    const s3Key = uploadResult.key;

    // Store Relative Key in both paths for internal consistency
    await db.query(
      `INSERT INTO ${TABLES.EMPLOYEE_DOCUMENTS}
       (employee_id, document_type, document_number, file_path, storage_provider, storage_bucket, storage_object_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        employee_id,
        document_type,
        document_number || null,
        s3Key, // Store key here too
        "S3",
        process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME,
        s3Key
      ]
    );

    res.status(201).json({
      message: "Document uploaded successfully",
      file_url: s3Url
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to add employee document", err);
    res.status(500).json({ message: "Failed to upload document" });
  }
};

export const list_employee_documents = async (req, res) => {
  const { employee_code } = req.params;
  const company_id = req.user.company_id;

  try {
    logger.debug(MODULE_NAME, "Fetching documents for employee", { employee_code });

    // 1. Resolve ID from code
    const [empRows] = await db.query(
      `SELECT id FROM ${TABLES.EMPLOYEES} WHERE employee_code = ? AND company_id = ?`,
      [employee_code, company_id]
    );

    if (!empRows.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const employee_id = empRows[0].id;

    // 2. Fetch documents
    const [rows] = await db.query(
      `SELECT * FROM ${TABLES.EMPLOYEE_DOCUMENTS} WHERE employee_id = ?`,
      [employee_id]
    );

    // 3. Generate dual signed URLs (View vs Download)
    const documents = await Promise.all(rows.map(async (doc) => {
      const view_url = await getS3SignedUrl(doc.storage_object_key, 259200, {
        disposition: 'inline'
      });

      const filename = doc.storage_object_key.split('/').pop().split('_').slice(1).join('_') || `${doc.document_type}`;

      const download_url = await getS3SignedUrl(doc.storage_object_key, 259200, {
        disposition: `attachment; filename="${filename}"`
      });

      return {
        document_id: doc.id,
        document_type: doc.document_type,
        document_number: doc.document_number,
        view_url,
        download_url,
        uploaded_at: doc.created_at
      };
    }));

    res.json(documents);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list employee documents", err);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
};




