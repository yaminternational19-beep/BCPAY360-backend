import db from "../models/db.js";
import { TABLES } from "../utils/tableNames.js";
import {
  getS3SignedUrl,
  generateEmployeeS3Key
} from "../utils/s3Upload.util.js";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_SERVICE";
const SIGNED_URL_TTL = 3600;
const INLINE = { disposition: "inline" };

dotenv.config();



export const createEmployeeService = async (employeeData, reqUser) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { employeeForm, profileForm, documentsForm, company_id } = employeeData;

    /* ===============================
       0. MASTER DATA OWNERSHIP VALIDATION
    =============================== */
    // 1. Branch
    const [[branchCheck]] = await conn.query(
      `SELECT id FROM ${TABLES.BRANCHES} WHERE id = ? AND company_id = ?`,
      [employeeForm.branch_id, company_id]
    );
    if (!branchCheck) throw new Error("Invalid branch selection for your company");

    // 2. Department
    const [[deptCheck]] = await conn.query(
      `SELECT id FROM ${TABLES.DEPARTMENTS} WHERE id = ? AND company_id = ?`,
      [employeeForm.department_id, company_id]
    );
    if (!deptCheck) throw new Error("Invalid department selection for your company");

    // 3. Designation
    const [[desigCheck]] = await conn.query(
      `SELECT id FROM ${TABLES.DESIGNATIONS} WHERE id = ? AND company_id = ?`,
      [employeeForm.designation_id, company_id]
    );
    if (!desigCheck) throw new Error("Invalid designation selection for your company");

    // 4. Shift (Optional)
    if (employeeForm.shift_id) {
      const [[shiftCheck]] = await conn.query(
        `SELECT id FROM ${TABLES.SHIFTS} WHERE id = ? AND company_id = ?`,
        [employeeForm.shift_id, company_id]
      );
      if (!shiftCheck) throw new Error("Invalid shift selection for your company");
    }

    // 5. Employee Type (Optional)
    if (employeeForm.employee_type_id) {
      const [[typeCheck]] = await conn.query(
        `SELECT id FROM ${TABLES.EMPLOYEE_TYPES} WHERE id = ? AND company_id = ?`,
        [employeeForm.employee_type_id, company_id]
      );
      if (!typeCheck) throw new Error("Invalid employee type selection for your company");
    }

    /* ===============================
       1. INSERT EMPLOYEE
    =============================== */
    const [empResult] = await conn.query(
      `INSERT INTO ${TABLES.EMPLOYEES} (
        company_id, branch_id, department_id, designation_id,
        employee_code, full_name, email, country_code, phone,
        employee_status, employee_type_id, shift_id,
        joining_date, confirmation_date, notice_period_days,
        experience_years, salary, ctc_annual,
        job_location, site_location,
        created_by_role, created_by_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        company_id,
        employeeForm.branch_id,
        employeeForm.department_id,
        employeeForm.designation_id,
        employeeForm.employee_code,
        employeeForm.full_name,
        employeeForm.email,
        employeeForm.country_code,
        employeeForm.phone,
        employeeForm.employee_status || "ACTIVE",
        employeeForm.employee_type_id || null,
        employeeForm.shift_id || null,
        employeeForm.joining_date,
        employeeForm.confirmation_date || null,
        employeeForm.notice_period_days || null,
        employeeForm.experience_years || null,
        employeeForm.salary || null,
        employeeForm.ctc_annual || null,
        employeeForm.job_location || null,
        employeeForm.site_location || null,
        reqUser.role,
        reqUser.id
      ]
    );

    const employee_id = empResult.insertId;
    logger.info(MODULE_NAME, `Employee Created Successfully: ID=${employee_id}`);

    /* ===============================
       2. AUTH TABLE
    =============================== */
    await conn.query(
      `INSERT INTO ${TABLES.EMPLOYEE_AUTH}
       (employee_id, password_hash)
       VALUES (?, ?)`,
      [employee_id, employeeForm.password_hash]
    );

    /* ===============================
       3. PROFILE TABLE (UPSERT)
       👉 includes statutory numbers
    =============================== */
    await conn.query(
      `INSERT INTO ${TABLES.EMPLOYEE_PROFILES} (
        employee_id,
        gender, dob, religion, father_name, marital_status,
        qualification, emergency_contact,
        aadhaar_number, pan_number, uan_number, esic_number,
        address, permanent_address,
        bank_name, account_number, ifsc_code, bank_branch_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        gender = VALUES(gender),
        dob = VALUES(dob),
        religion = VALUES(religion),
        father_name = VALUES(father_name),
        marital_status = VALUES(marital_status),
        qualification = VALUES(qualification),
        emergency_contact = VALUES(emergency_contact),
        aadhaar_number = VALUES(aadhaar_number),
        pan_number = VALUES(pan_number),
        uan_number = VALUES(uan_number),
        esic_number = VALUES(esic_number),
        address = VALUES(address),
        permanent_address = VALUES(permanent_address),
        bank_name = VALUES(bank_name),
        account_number = VALUES(account_number),
        ifsc_code = VALUES(ifsc_code),
        bank_branch_name = VALUES(bank_branch_name)`,
      [
        employee_id,
        profileForm.gender || null,
        profileForm.dob || null,
        profileForm.religion || null,
        profileForm.father_name || null,
        profileForm.marital_status || null,
        profileForm.qualification || null,
        profileForm.emergency_contact || null,

        profileForm.aadhaar_number || null,
        profileForm.pan_number || null,
        profileForm.uan_number || null,
        profileForm.esic_number || null,

        profileForm.address || null,
        profileForm.permanent_address || null,
        profileForm.bank_name || null,
        profileForm.account_number || null,
        profileForm.ifsc_code || null,
        profileForm.bank_branch_name || null
      ]
    );

    /* ===============================
       4. DOCUMENT HANDLING
    =============================== */
    const uploadedFilesMap = documentsForm?.files || {};
    const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME;

    for (const [docType, files] of Object.entries(uploadedFilesMap)) {
      if (!Array.isArray(files)) continue;

      for (const file of files) {
        if (!file?.key) continue;

        const destinationKey = file.key;

        if (docType === "profile_photo") {
          await conn.query(
            `UPDATE ${TABLES.EMPLOYEE_PROFILES}
             SET profile_photo_path = ?
             WHERE employee_id = ?`,
            [destinationKey, employee_id]
          );
        } else {
          await conn.query(
            `INSERT INTO ${TABLES.EMPLOYEE_DOCUMENTS} (
              employee_id, document_type, document_number,
              file_path, storage_provider, storage_bucket, storage_object_key,
              uploaded_by_role, uploaded_by_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              employee_id,
              docType,
              documentsForm[docType] || null,
              destinationKey,
              "S3",
              bucket,
              destinationKey,
              reqUser.role,
              reqUser.id
            ]
          );
        }
      }
    }

    await conn.commit();
    return { employee_id };

  } catch (err) {
    await conn.rollback();
    logger.error(MODULE_NAME, "Failed to create employee", err);
    throw err;
  } finally {
    conn.release();
  }
};




export const listEmployeesService = async (company_id, query = {}) => {
  const {
    branch_id,
    department_id,
    designation_id,
    shift_id,
    employee_type_id,
    search = "",
    status,
    sort_by = "id",
    limit = 10,
    offset = 0,
  } = query;

  /* ==============================
     DYNAMIC FILTER BUILDING
  ============================== */
  const where = [];
  const params = [];

  // Mandatory company scope
  where.push("e.company_id = ?");
  params.push(company_id);

  if (branch_id) {
    where.push("e.branch_id = ?");
    params.push(branch_id);
  }

  if (department_id) {
    where.push("e.department_id = ?");
    params.push(department_id);
  }

  if (designation_id) {
    where.push("e.designation_id = ?");
    params.push(designation_id);
  }

  if (shift_id) {
    where.push("e.shift_id = ?");
    params.push(shift_id);
  }

  if (employee_type_id) {
    where.push("e.employee_type_id = ?");
    params.push(employee_type_id);
  }

  if (status) {
    where.push("e.employee_status = ?");
    params.push(status);
  }

  if (search) {
    where.push(`
      (
        e.employee_code LIKE ?
        OR e.full_name LIKE ?
        OR e.email LIKE ?
        OR e.phone LIKE ?
      )
    `);
    params.push(
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`
    );
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  /* ==============================
     SORTING (SAFE)
  ============================== */
  const SORT_MAP = {
    id: "e.id",
    employee_code: "e.employee_code",
    name: "e.full_name",
    salary: "e.salary",
    joining_date: "e.joining_date",
  };

  const orderBy = SORT_MAP[sort_by] || "e.id";

  /* ==============================
     MAIN QUERY
  ============================== */
  const sql = `
    SELECT
      e.id,
      e.employee_code,
      e.full_name,
      e.email,
      e.phone,
      e.joining_date,
      e.salary,
      e.employee_status,

      -- 🔥 REQUIRED IDS FOR UI
      e.branch_id,
      e.department_id,
      e.designation_id,
      e.shift_id,
      e.employee_type_id,

      ea.is_active,

      p.profile_photo_path,

      -- Display fields (optional)
      b.branch_name,
      d.department_name,
      dg.designation_name,
      s.shift_name,
      et.type_name AS employee_type_name

    FROM ${TABLES.EMPLOYEES} e
    JOIN ${TABLES.EMPLOYEE_AUTH} ea
      ON ea.employee_id = e.id

    LEFT JOIN ${TABLES.EMPLOYEE_PROFILES} p
      ON p.employee_id = e.id

    LEFT JOIN ${TABLES.BRANCHES} b
      ON b.id = e.branch_id AND b.company_id = e.company_id

    LEFT JOIN ${TABLES.DEPARTMENTS} d
      ON d.id = e.department_id AND d.company_id = e.company_id

    LEFT JOIN ${TABLES.DESIGNATIONS} dg
      ON dg.id = e.designation_id AND dg.company_id = e.company_id

    LEFT JOIN ${TABLES.SHIFTS} s
      ON s.id = e.shift_id AND s.company_id = e.company_id

    LEFT JOIN ${TABLES.EMPLOYEE_TYPES} et
      ON et.id = e.employee_type_id AND et.company_id = e.company_id

    ${whereClause}
    ORDER BY ${orderBy} DESC
    LIMIT ? OFFSET ?
  `;

  const finalParams = [...params, Number(limit), Number(offset)];
  const [rows] = await db.query(sql, finalParams);

  /* ==============================
     TOTAL COUNT (FOR PAGINATION)
  ============================== */
  const countSql = `
    SELECT COUNT(*) AS total
    FROM ${TABLES.EMPLOYEES} e
    ${whereClause}
  `;

  const [[countRow]] = await db.query(countSql, params);

  /* ==============================
     SIGN PROFILE IMAGE URL
  ============================== */
  for (const row of rows) {
    row.profile_photo_url = row.profile_photo_path
      ? await getS3SignedUrl(row.profile_photo_path, 3600, {
        disposition: "inline",
      })
      : null;

    delete row.profile_photo_path;
  }

  return {
    rows,
    total: countRow.total,
    limit: Number(limit),
    offset: Number(offset),
  };
};




// 1. Core employee data with joins
export const getEmployeeByIdService = async (
  id,
  company_id,
  filters = {} // { year, month }
) => {
  /* =========================================================================
     1. EMPLOYEE CORE
     ========================================================================= */
  const sql = `
    SELECT
      e.id,
      e.company_id,
      e.employee_code,
      e.full_name,
      e.email,
      e.country_code,
      e.phone,
      e.employee_status,
      e.joining_date,
      e.confirmation_date,
      e.notice_period_days,
      e.experience_years,
      e.salary,
      e.ctc_annual,
      e.job_location,
      e.site_location,
      e.employee_type_id,
      e.shift_id,
      e.branch_id,
      e.department_id,
      e.designation_id,
      e.created_at,
      e.updated_at,
      e.created_by_role,
      e.created_by_id,

      ea.is_active AS auth_is_active,
      ea.created_at AS auth_created_at,

      p.gender,
      p.dob,
      p.religion,
      p.father_name,
      p.marital_status,
      p.qualification,
      p.emergency_contact,
      p.address,
      p.permanent_address,
      p.bank_name,
      p.account_number,
      p.ifsc_code,
      p.bank_branch_name,
      p.profile_photo_path,

      b.branch_name,
      d.department_name,
      dg.designation_name,
      s.shift_name,
      et.type_name AS employee_type_name

    FROM ${TABLES.EMPLOYEES} e
    LEFT JOIN ${TABLES.EMPLOYEE_AUTH} ea ON ea.employee_id = e.id
    LEFT JOIN ${TABLES.EMPLOYEE_PROFILES} p ON p.employee_id = e.id
    LEFT JOIN ${TABLES.BRANCHES} b ON b.id = e.branch_id AND b.company_id = e.company_id
    LEFT JOIN ${TABLES.DEPARTMENTS} d ON d.id = e.department_id AND d.company_id = e.company_id
    LEFT JOIN ${TABLES.DESIGNATIONS} dg ON dg.id = e.designation_id AND dg.company_id = e.company_id
    LEFT JOIN ${TABLES.SHIFTS} s ON s.id = e.shift_id AND s.company_id = e.company_id
    LEFT JOIN ${TABLES.EMPLOYEE_TYPES} et ON et.id = e.employee_type_id AND et.company_id = e.company_id
    WHERE e.id = ? AND e.company_id = ?
    LIMIT 1
  `;

  const [[row]] = await db.query(sql, [id, company_id]);
  if (!row) return null;

  /* =========================================================================
     2. EMPLOYEE DOCUMENTS (OLD)
     ========================================================================= */
  const [documentRows] = await db.query(
    `
      SELECT
        document_type AS type,
        document_number,
        storage_object_key
      FROM ${TABLES.EMPLOYEE_DOCUMENTS}
      WHERE employee_id = ?
    `,
    [id]
  );

  const documents = await Promise.all(
    (documentRows || []).map(async (doc) => {
      const view_url = await getS3SignedUrl(
        doc.storage_object_key,
        SIGNED_URL_TTL,
        INLINE
      );

      const download_url = await getS3SignedUrl(
        doc.storage_object_key,
        SIGNED_URL_TTL,
        { disposition: `attachment; filename="${doc.type}.pdf"` }
      );

      return {
        type: doc.type,
        document_number: doc.document_number,
        view_url,
        download_url
      };
    })
  );

  /* =========================================================================
     3. FORM DOCUMENTS (NEW – YEAR / MONTH FILTER)
     ========================================================================= */
  const formFilters = [];
  const formValues = [id];

  if (filters.year) {
    formFilters.push("doc_year = ?");
    formValues.push(filters.year);
  }

  if (filters.month) {
    formFilters.push("doc_month = ?");
    formValues.push(filters.month);
  }

  const formFilterSql =
    formFilters.length > 0 ? `AND ${formFilters.join(" AND ")}` : "";

  const [formDocumentRows] = await db.query(
    `
      SELECT
        form_code,
        period_type,
        financial_year,
        doc_year,
        doc_month,
        storage_object_key,
        uploaded_by_role,
        created_at
      FROM ${TABLES.EMPLOYEE_FORM_DOCUMENTS}
      WHERE employee_id = ?
      ${formFilterSql}
      ORDER BY created_at DESC
    `,
    formValues
  );

  const form_documents = await Promise.all(
    (formDocumentRows || []).map(async (doc) => {
      const view_url = await getS3SignedUrl(
        doc.storage_object_key,
        SIGNED_URL_TTL,
        INLINE
      );

      let periodLabel = "NA";

      if (doc.period_type === "FY" && doc.financial_year) {
        periodLabel = doc.financial_year;
      }

      if (doc.period_type === "MONTH" && doc.doc_year && doc.doc_month) {
        periodLabel = `${doc.doc_year}-${String(doc.doc_month).padStart(2, "0")}`;
      }

      const download_url = await getS3SignedUrl(
        doc.storage_object_key,
        SIGNED_URL_TTL,
        {
          disposition: `attachment; filename="${doc.form_code}_${periodLabel}.pdf"`
        }
      );

      return {
        form_code: doc.form_code,
        period_type: doc.period_type,
        financial_year: doc.financial_year,
        doc_year: doc.doc_year,
        doc_month: doc.doc_month,
        uploaded_by_role: doc.uploaded_by_role,
        uploaded_at: doc.created_at,
        view_url,
        download_url
      };
    })
  );

  /* =========================================================================
     4. PROFILE PHOTO
     ========================================================================= */
  const profile_photo_url = row.profile_photo_path
    ? await getS3SignedUrl(row.profile_photo_path, SIGNED_URL_TTL, INLINE)
    : null;

  /* =========================================================================
     5. FINAL RESPONSE
     ========================================================================= */
  return {
    employee: {
      id: row.id,
      company_id: row.company_id,
      employee_code: row.employee_code,
      full_name: row.full_name,
      email: row.email,
      country_code: row.country_code,
      phone: row.phone,
      employee_status: row.employee_status,
      joining_date: row.joining_date,
      confirmation_date: row.confirmation_date,
      notice_period_days: row.notice_period_days,
      experience_years: row.experience_years,
      salary: row.salary,
      ctc_annual: row.ctc_annual,
      job_location: row.job_location,
      site_location: row.site_location,
      created_at: row.created_at,
      updated_at: row.updated_at,
      created_by_role: row.created_by_role,
      created_by_id: row.created_by_id,

      branch: { id: row.branch_id, name: row.branch_name },
      department: { id: row.department_id, name: row.department_name },
      designation: { id: row.designation_id, name: row.designation_name },
      shift: { id: row.shift_id, name: row.shift_name },
      employee_type: { id: row.employee_type_id, name: row.employee_type_name }
    },

    profile: {
      gender: row.gender,
      dob: row.dob,
      religion: row.religion,
      father_name: row.father_name,
      marital_status: row.marital_status,
      qualification: row.qualification,
      emergency_contact: row.emergency_contact,
      address: row.address,
      permanent_address: row.permanent_address,
      bank_name: row.bank_name,
      account_number: row.account_number,
      ifsc_code: row.ifsc_code,
      bank_branch_name: row.bank_branch_name,
      profile_photo_url
    },

    auth: {
      is_active: row.auth_is_active,
      created_at: row.auth_created_at
    },

    documents,        // existing
    form_documents    // ✅ new
  };
};


export const getEmployeeByCodeService = async (employeeCode, company_id) => {
  const [row] = await db.query(`SELECT id FROM ${TABLES.EMPLOYEES} WHERE employee_code = ? AND company_id = ?`, [employeeCode, company_id]);
  if (!row.length) return null;
  return getEmployeeByIdService(row[0].id, company_id);
};

export const updateEmployeeService = async (id, company_id, updateData, reqUser) => {
  const { employeeForm, profileForm, documentsForm } = updateData;
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1. DYNAMIC UPDATE FOR EMPLOYEES TABLE
    if (employeeForm && Object.keys(employeeForm).length > 0) {
      const fields = [];
      const values = [];

      const allowedFields = [
        'branch_id', 'department_id', 'designation_id',
        'full_name', 'email', 'country_code', 'phone',
        'employee_status', 'employee_type_id', 'shift_id',
        'joining_date', 'confirmation_date', 'notice_period_days',
        'experience_years', 'salary', 'ctc_annual',
        'job_location', 'site_location'
      ];

      allowedFields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(employeeForm, field)) {
          fields.push(`${field} = ?`);
          values.push(employeeForm[field]);
        }
      });

      if (fields.length > 0) {
        // 🔒 SECURITY: Verify ownership of any updated master IDs
        if (employeeForm.branch_id) {
          const [[bCheck]] = await conn.query(`SELECT 1 FROM ${TABLES.BRANCHES} WHERE id=? AND company_id=?`, [employeeForm.branch_id, company_id]);
          if (!bCheck) throw new Error("Invalid branch selection for your company");
        }
        if (employeeForm.department_id) {
          const [[dCheck]] = await conn.query(`SELECT 1 FROM ${TABLES.DEPARTMENTS} WHERE id=? AND company_id=?`, [employeeForm.department_id, company_id]);
          if (!dCheck) throw new Error("Invalid department selection for your company");
        }
        if (employeeForm.designation_id) {
          const [[dgCheck]] = await conn.query(`SELECT 1 FROM ${TABLES.DESIGNATIONS} WHERE id=? AND company_id=?`, [employeeForm.designation_id, company_id]);
          if (!dgCheck) throw new Error("Invalid designation selection for your company");
        }
        if (employeeForm.shift_id) {
          const [[sCheck]] = await conn.query(`SELECT 1 FROM ${TABLES.SHIFTS} WHERE id=? AND company_id=?`, [employeeForm.shift_id, company_id]);
          if (!sCheck) throw new Error("Invalid shift selection for your company");
        }
        if (employeeForm.employee_type_id) {
          const [[etCheck]] = await conn.query(`SELECT 1 FROM ${TABLES.EMPLOYEE_TYPES} WHERE id=? AND company_id=?`, [employeeForm.employee_type_id, company_id]);
          if (!etCheck) throw new Error("Invalid employee type selection for your company");
        }

        values.push(id, company_id);
        const sql = `UPDATE ${TABLES.EMPLOYEES} SET ${fields.join(', ')} WHERE id = ? AND company_id = ?`;
        await conn.query(sql, values);
      }
    }

    // 2. DYNAMIC UPDATE FOR PROFILES TABLE
    if (profileForm && Object.keys(profileForm).length > 0) {
      const profileFields = [];
      const profileValues = [];

      const allowedProfileFields = [
        'gender', 'dob', 'religion', 'father_name',
        'marital_status', 'qualification', 'emergency_contact',
        'address', 'permanent_address',
        'bank_name', 'account_number', 'ifsc_code', 'bank_branch_name',
        'profile_photo_path', 'profile_photo'
      ];

      allowedProfileFields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(profileForm, field)) {
          const dbField = field === 'profile_photo' ? 'profile_photo_path' : field;
          const value = (field === 'profile_photo' || field === 'profile_photo_path')
            ? (profileForm[field]?.key || profileForm[field])
            : profileForm[field];

          profileFields.push(`${dbField} = ?`);
          profileValues.push(value);
        }
      });

      if (profileFields.length > 0) {
        profileValues.push(id);
        // Profile join with employees to ensure company_id ownership
        const sql = `
                    UPDATE ${TABLES.EMPLOYEE_PROFILES} p
                    JOIN ${TABLES.EMPLOYEES} e ON e.id = p.employee_id
                    SET ${profileFields.map(f => `p.${f}`).join(', ')}
                    WHERE p.employee_id = ? AND e.company_id = ?
                `;
        await conn.query(sql, [...profileValues, company_id]);
        // affectedRows might be 0 if data is identical, so we don't strictly sum it for 404
      }
    }

    // 3. Handle Dynamic Document Storage Updates
    const uploadedFiles = documentsForm?.files || {};
    const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET_NAME;

    for (const [docName, files] of Object.entries(uploadedFiles)) {
      if (!Array.isArray(files)) continue;

      for (const fileData of files) {
        if (!fileData || typeof fileData !== 'object' || !fileData.key) continue;

        const destinationKey = fileData.key;

        if (docName === 'profile_photo') {
          await conn.query(
            `UPDATE ${TABLES.EMPLOYEE_PROFILES} SET profile_photo_path = ? WHERE employee_id = ?`,
            [destinationKey, id]
          );
        } else {
          // Delete existing of this type ONLY ONCE before inserting the new batch
          if (fileData === files[0]) {
            await conn.query(
              `DELETE FROM ${TABLES.EMPLOYEE_DOCUMENTS} WHERE employee_id = ? AND document_type = ?`,
              [id, docName]
            );
          }

          const docNumber = documentsForm[docName] || null;
          await conn.query(
            `INSERT INTO ${TABLES.EMPLOYEE_DOCUMENTS} (
                        employee_id, document_type, document_number,
                        file_path, storage_provider, storage_bucket, storage_object_key,
                        uploaded_by_role, uploaded_by_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              docName,
              docNumber,
              destinationKey,
              "S3",
              bucket,
              destinationKey,
              reqUser.role,
              reqUser.id
            ]
          );
        }
      }
    }

    // 4. AUTH STATUS & PASSWORD UPDATE
    if (employeeForm?.password_hash || Object.prototype.hasOwnProperty.call(employeeForm, 'employee_status')) {
      const authFields = [];
      const authValues = [];

      if (employeeForm.password_hash) {
        authFields.push("ea.password_hash = ?");
        authValues.push(employeeForm.password_hash);
      }

      if (Object.prototype.hasOwnProperty.call(employeeForm, 'employee_status')) {
        authFields.push("ea.is_active = ?");
        authValues.push(employeeForm.employee_status === 'ACTIVE' ? 1 : 0);
      }

      if (authFields.length > 0) {
        authValues.push(id, company_id);
        await conn.query(
          `UPDATE ${TABLES.EMPLOYEE_AUTH} ea
                     JOIN ${TABLES.EMPLOYEES} e ON e.id = ea.employee_id
                     SET ${authFields.join(', ')}
                     WHERE ea.employee_id = ? AND e.company_id = ?`,
          authValues
        );
      }
    }

    await conn.commit();
    // Return true if the main employee record was found/updated OR if we are updating secondary tables
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const deleteEmployeeService = async (id, company_id) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Soft delete employee
    const [empResult] = await conn.query(
      `UPDATE ${TABLES.EMPLOYEES} SET employee_status = 'INACTIVE' WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (empResult.affectedRows === 0) {
      await conn.rollback();
      return false;
    }

    // 2. Disable login status in auth table
    await conn.query(
      `UPDATE ${TABLES.EMPLOYEE_AUTH} SET is_active = 0 WHERE employee_id = ?`,
      [id]
    );

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const activateEmployeeService = async (id, company_id) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Update Core Employee Status
    const [empResult] = await conn.query(
      `UPDATE ${TABLES.EMPLOYEES} SET employee_status = 'ACTIVE' WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (empResult.affectedRows === 0) {
      await conn.rollback();
      return false;
    }

    // 2. Update Auth Login Status
    await conn.query(
      `UPDATE ${TABLES.EMPLOYEE_AUTH} SET is_active = 1 WHERE employee_id = ?`,
      [id]
    );

    await conn.commit();
    logger.info(MODULE_NAME, `Employee Activated: ID=${id}`);
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
