import db from "../../models/db.js";
import bcrypt from "bcryptjs";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import {
  uploadToS3,
  deleteS3Object,
  generateEmployeeS3Key
} from "../../utils/s3Upload.util.js";
import {
  createEmployeeService,
  listEmployeesService,
  getEmployeeByIdService,
  deleteEmployeeService,
  updateEmployeeService,
  activateEmployeeService
} from "../../services/employee.service.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_CONTROLLER";

/* ============================
   CREATE EMPLOYEE
 ============================ */
export const create_employee = async (req, res) => {
  let stage = 'INITIAL_VALIDATION';
  try {
    let { employeeForm, profileForm, documentsForm } = req.body;

    logger.info(MODULE_NAME, "Processing employee creation", {
      fileFields: Object.keys(req.files || {}),
      employeeCode: employeeForm?.employee_code
    });

    // 1. Parse JSON safely
    try {
      if (typeof employeeForm === 'string') employeeForm = JSON.parse(employeeForm);
      if (typeof profileForm === 'string') profileForm = JSON.parse(profileForm);
      if (typeof documentsForm === 'string') documentsForm = JSON.parse(documentsForm);
    } catch (err) {
      return res.status(400).json({
        error_code: "INVALID_PAYLOAD",
        reason: "Invalid JSON parsing in form data",
        failed_stage: stage
      });
    }

    const company_id = req.user.company_id;
    if (!company_id) throw new Error("Company context missing");

    // 2. Validate required employee fields
    const requiredFields = ['full_name', 'employee_code', 'branch_id', 'department_id', 'designation_id', 'joining_date', 'email', 'password'];
    const missingFields = requiredFields.filter(field => !employeeForm?.[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error_code: "VALIDATION_FAILED",
        reason: `Missing employee fields: ${missingFields.join(', ')}`,
        failed_stage: stage
      });
    }

    stage = 'DOCUMENT_VALIDATION';
    const uploadedFiles = {};
    const filesArray = req.files || [];

    // Map files for easier access
    const fileMap = {};
    filesArray.forEach(f => {
      fileMap[f.fieldname] = f;
    });

    // 3. Validate metadata vs files (Dynamic)
    // Every entry in documentsForm must have a corresponding file
    const docTypes = Object.keys(documentsForm || {});
    for (const type of docTypes) {
      if (!fileMap[type]) {
        return res.status(400).json({
          error_code: "DOCUMENT_MISSING",
          reason: `Document metadata exists for '${type}' but no file was uploaded with this field name.`,
          failed_stage: stage
        });
      }
    }

    // Every file (except profile_photo) must have metadata in documentsForm
    for (const f of filesArray) {
      if (f.fieldname === 'profile_photo') continue;
      if (!documentsForm?.[f.fieldname]) {
        return res.status(400).json({
          error_code: "METADATA_MISSING",
          reason: `File '${f.fieldname}' was uploaded but not declared in documentsForm.`,
          failed_stage: stage
        });
      }
    }

    stage = 'S3_UPLOAD';
    const password_hash = await bcrypt.hash(employeeForm.password, 10);

    // 4. Upload to S3 PERMANENT paths directly
    const context = {
      companyId: company_id,
      branchId: employeeForm.branch_id,
      employeeCode: employeeForm.employee_code
    };

    for (const file of filesArray) {
      const fullKey = generateEmployeeS3Key(context, file);
      const uploadResult = await uploadToS3(file.buffer, fullKey, file.mimetype);

      const fileEntry = {
        url: uploadResult.url,
        key: uploadResult.key,
        originalname: file.originalname,
        mimetype: file.mimetype,
        fieldname: file.fieldname
      };

      if (!uploadedFiles[file.fieldname]) {
        uploadedFiles[file.fieldname] = [];
      }
      uploadedFiles[file.fieldname].push(fileEntry);
    }

    stage = 'DATABASE_INSERTION';
    logger.info(MODULE_NAME, "Persisting employee to database");

    // 🔥 REQUIRED FIX
    profileForm = {
      ...profileForm,
      aadhaar_number: employeeForm.aadhaar_number || null,
      pan_number: employeeForm.pan_number || null,
      uan_number: employeeForm.uan_number || null,
      esic_number: employeeForm.esic_number || null,
    };

    const result = await createEmployeeService({
      employeeForm: { ...employeeForm, password_hash },
      profileForm: { ...profileForm, ...uploadedFiles },
      documentsForm: { ...documentsForm, files: uploadedFiles },
      company_id
    }, req.user);


    res.status(201).json({
      message: "Employee created successfully",
      employee_id: result.employee_id,
      uploaded_documents: Object.keys(uploadedFiles).filter(k => k !== 'profile_photo')
    });

  } catch (err) {
    logger.error(MODULE_NAME, `Create employee failed at stage: ${stage}`, err);

    // 🗑️ S3 Cleanup: Remove any files uploaded during this failed request
    const fileKeys = Object.values(uploadedFiles).flat().map(f => f.key).filter(Boolean);
    if (fileKeys.length > 0) {
      logger.warn(MODULE_NAME, `Error cleanup triggered: Deleting ${fileKeys.length} files`);
      // Use fire-and-forget for cleanup to respond faster
      setImmediate(() => {
        Promise.all(fileKeys.map(k => deleteS3Object(k)))
          .catch(cleanupErr => logger.error(MODULE_NAME, "Failed to cleanup S3 files after error", cleanupErr));
      });
    }

    res.status(err.status || 500).json({
      error_code: "EMPLOYEE_CREATE_FAILED",
      reason: err.message || "An internal error occurred",
      failed_stage: stage
    });
  }
};


/* ============================
   LIST EMPLOYEES (WITH PAGINATION)
 ============================ */
export const list_employees = async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    const company_id = req.user.company_id;

    const result = await listEmployeesService(company_id, req.query);
    res.json(result);
  } catch (err) {
    console.error("LIST EMPLOYEES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================
   GET FULL EMPLOYEE VIEW
 ============================ */
export const get_employee_by_id = async (req, res) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  // Optional filters (month / year)
  const filters = {
    year: req.query.year,
    month: req.query.month
  };

  try {
    const result = await getEmployeeByIdService(id, company_id, filters);

    if (!result) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error("GET EMPLOYEE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};


/* ============================
   UPDATE EMPLOYEE BY CODE
 ============================ */
export const update_employee_by_code = async (req, res) => {
  const { employee_code } = req.params;
  const company_id = req.user.company_id;

  try {
    console.log("-----------------------------------------");
    console.log("EMP CODE:", employee_code);

    // 1. Resolve ID from code
    const [empRows] = await db.query(
      `SELECT id FROM ${TABLES.EMPLOYEES} WHERE employee_code = ? AND company_id = ?`,
      [employee_code, company_id]
    );

    if (!empRows.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const employee_id = empRows[0].id;
    console.log("EMP ID:", employee_id);

    // Reuse existing update logic by injecting employee_id into req.params or just calling it
    req.params.id = employee_id;
    return update_employee(req, res);

  } catch (err) {
    console.error("UPDATE BY CODE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ============================
   UPDATE EMPLOYEE (Core Logic)
 ============================ */
export const update_employee = async (req, res) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  // 1. Sanitize and Validate ID
  const sanitizedId = id?.toString().trim();
  const employeeId = Number(sanitizedId);

  if (!sanitizedId || isNaN(employeeId)) {
    return res.status(400).json({ message: "Invalid or missing employee ID" });
  }

  let { employeeForm, profileForm, documentsForm } = req.body;

  // Safely parse JSON strings from multipart/form-data
  try {
    if (typeof employeeForm === 'string') employeeForm = JSON.parse(employeeForm);
    if (typeof profileForm === 'string') profileForm = JSON.parse(profileForm);
    if (typeof documentsForm === 'string') documentsForm = JSON.parse(documentsForm);
  } catch (err) {
    return res.status(400).json({ message: "Invalid JSON in form data" });
  }

  if (!employeeForm) {
    return res.status(400).json({ message: "employeeForm is required for updates" });
  }

  // 2. Strict Validation for NOT NULL columns
  // Even for partial updates, identity fields must be validated if present
  const requiredFields = [
    'full_name',
    'email',
    'joining_date',
    'branch_id',
    'department_id',
    'designation_id'
  ];

  const errors = [];
  requiredFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(employeeForm, field)) {
      const val = employeeForm[field];
      if (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) {
        errors.push(`${field} cannot be empty`);
      }
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({ message: "Validation failed", errors });
  }

  try {
    // Fetch current employee details for S3 path construction
    const [currentEmpRows] = await db.query(
      `SELECT branch_id, employee_code FROM ${TABLES.EMPLOYEES} WHERE id = ? AND company_id = ?`,
      [employeeId, company_id]
    );

    if (!currentEmpRows.length) {
      return res.status(404).json({ message: "Employee not found or access denied" });
    }
    const currentEmp = currentEmpRows[0];

    // Use incoming form data if available, otherwise fallback to current DB values
    const targetBranchId = employeeForm?.branch_id || currentEmp.branch_id;
    const targetEmployeeCode = employeeForm?.employee_code || currentEmp.employee_code;

    const context = {
      companyId: company_id,
      branchId: targetBranchId,
      employeeCode: targetEmployeeCode
    };

    const uploadedFiles = {};
    const filesArray = req.files || [];

    for (const file of filesArray) {
      const fullKey = generateEmployeeS3Key(context, file);
      const uploadResult = await uploadToS3(file.buffer, fullKey, file.mimetype);

      const fileEntry = {
        url: uploadResult.url,
        key: uploadResult.key,
        originalname: file.originalname,
        mimetype: file.mimetype,
        fieldname: file.fieldname
      };

      if (!uploadedFiles[file.fieldname]) {
        uploadedFiles[file.fieldname] = [];
      }
      uploadedFiles[file.fieldname].push(fileEntry);
    }

    const updated = await updateEmployeeService(employeeId, company_id, {
      employeeForm,
      profileForm: { ...profileForm, ...uploadedFiles },
      documentsForm: { ...documentsForm, files: uploadedFiles }
    }, req.user);

    if (!updated) {
      return res.status(404).json({
        error_code: "NOT_FOUND",
        reason: "Employee not found or access denied",
        failed_stage: 'DATABASE_UPDATE'
      });
    }

    res.json({
      message: "Employee updated successfully",
      updated_documents: Object.keys(uploadedFiles).filter(k => k !== 'profile_photo')
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update employee", err);
    res.status(500).json({
      error_code: "EMPLOYEE_UPDATE_FAILED",
      reason: err.message || "An internal error occurred",
      failed_stage: 'DATABASE_UPDATE'
    });
  }
};

/* ============================
   ACTIVATE / DEACTIVATE
 ============================ */
export const toggle_employee_status = async (req, res) => {
  const { id } = req.params;
  const { is_active, status } = req.body;
  const company_id = req.user.company_id;

  try {
    const shouldActivate = (status === 'ACTIVE' || is_active === true || is_active === 1 || is_active === 'true');
    logger.debug(MODULE_NAME, "Toggle employee status request", { id, status, is_active, shouldActivate });

    let success = false;

    if (shouldActivate) {
      success = await activateEmployeeService(id, company_id);
    } else {
      success = await deleteEmployeeService(id, company_id);
    }

    if (!success) {
      return res.status(404).json({ message: "Employee not found or access denied" });
    }

    res.json({
      message: `Employee ${shouldActivate ? 'activated' : 'deactivated'} successfully`
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Toggle employee status failed", err);
    res.status(500).json({ message: "Failed to update employee status" });
  }
};

export const activate_employee = async (req, res) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  try {
    const success = await activateEmployeeService(id, company_id);

    if (!success) {
      return res.status(404).json({ message: "Employee not found or access denied" });
    }

    res.json({ message: "Employee activated successfully" });
  } catch (err) {
    console.error("ACTIVATE EMPLOYEE ERROR:", err);
    res.status(500).json({ message: "Failed to activate employee" });
  }
};

/* ============================
   DELETE EMPLOYEE (WITH TRANSACTION)
 ============================ */
export const delete_employee = async (req, res) => {
  const { id } = req.params;
  const company_id = req.user.company_id;

  try {
    const deleted = await deleteEmployeeService(id, company_id);

    if (!deleted) {
      return res.status(404).json({ message: "Employee not found or access denied" });
    }

    res.json({ message: "Employee deactivated successfully" });
  } catch (err) {
    console.error("DELETE EMPLOYEE ERROR:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};




export const getLastEmployeeCode = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { branch_id } = req.query;

    if (!company_id || !branch_id) {
      return res.status(400).json({
        message: "company_id and branch_id are required",
      });
    }

    /* ===============================
       1. CHECK LAST EMPLOYEE
    =============================== */
    const [empRows] = await db.query(
      `
      SELECT employee_code
      FROM employees
      WHERE company_id = ?
        AND branch_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [company_id, branch_id]
    );

    if (empRows.length > 0) {
      const lastCode = empRows[0].employee_code;

      // OPTIONAL numeric suffix
      const match = lastCode.match(/^(.*?)(\d+)$/);

      if (!match) {
        // No number → cannot auto-increment
        return res.json({
          code: lastCode,
          source: "employees",
          note: "No numeric suffix found",
        });
      }

      const prefix = match[1];
      const number = match[2];

      const nextCode =
        prefix +
        String(parseInt(number, 10) + 1).padStart(number.length, "0");

      return res.json({
        code: nextCode,
        source: "employees",
      });
    }

    /* ===============================
       2. FIRST EMPLOYEE → USE CONFIG
    =============================== */
    const [configRows] = await db.query(
      `
      SELECT last_employee_code
      FROM employee_code_configs
      WHERE company_id = ?
        AND branch_id = ?
        AND is_active = 1
      LIMIT 1
      `,
      [company_id, branch_id]
    );

    if (!configRows.length) {
      return res.status(400).json({
        message: "Employee code config not found",
      });
    }

    const baseCode = configRows[0].last_employee_code;

    // Try numeric suffix from config
    const match = baseCode.match(/^(.*?)(\d+)$/);

    if (!match) {
      return res.json({
        code: baseCode,
        source: "config",
        note: "No numeric suffix in config",
      });
    }

    const prefix = match[1];
    const number = match[2];

    const nextCode =
      prefix +
      String(parseInt(number, 10) + 1).padStart(number.length, "0");

    return res.json({
      code: nextCode,
      source: "config",
    });

  } catch (error) {
    console.error("EMPLOYEE CODE PREVIEW ERROR:", error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};



export const getAvailableCompanyForms = async (req, res) => {
  try {
    const company_id = req.user?.company_id;

    if (!company_id) {
      return res.status(401).json({
        message: "Company context missing"
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        form_code,
        form_name,
        version,
        status
      FROM company_government_forms
      WHERE company_id = ?
        AND status = 'ACTIVE'
      ORDER BY created_at ASC
      `,
      [company_id]
    );

    res.status(200).json({
      total: rows.length,
      data: rows
    });
  } catch (err) {
    console.error("GET COMPANY GOVERNMENT FORMS ERROR:", err);
    res.status(500).json({
      message: "Failed to fetch company government forms"
    });
  }
};



