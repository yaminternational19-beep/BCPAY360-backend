import db from "../../models/db.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { generateToken } from "../../utils/jwt.js";
import { dbExec } from "../../utils/dbExec.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "HR_CONTROLLER";

import { createHRService, listHRsService } from "../../services/hr.service.js";

/* =====================================================
   CREATE HR (COMPANY ADMIN)
 ===================================================== */
export const createHR = async (req, res) => {
  const {
    branch_id,
    hr_code,            // ✅ TAKE FROM PAYLOAD
    full_name,
    email,
    phone,
    password,

    joining_date,
    experience_years,
    job_location,
    gender,
    dob,
    emergency_contact_name,
    emergency_contact_number,
    remarks,
  } = req.body;

  const { company_id, id: admin_id } = req.user;

  /* =========================
     1️⃣ BASIC VALIDATION
  ========================= */
  if (
    !branch_id ||
    !hr_code ||
    !full_name ||
    !email ||
    !phone ||
    !password ||
    !joining_date
  ) {
    return res.status(400).json({
      message: "Required fields are missing",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters",
    });
  }

  /* =========================
     2️⃣ VALIDATE BRANCH
  ========================= */
  const branchSql = `
    SELECT id
    FROM ${TABLES.BRANCHES}
    WHERE id = ?
      AND company_id = ?
      AND is_active = 1
    LIMIT 1
  `;

  const branch = await dbExec(db, branchSql, [branch_id, company_id]);

  if (!branch.length) {
    return res.status(400).json({
      message: "Invalid branch for this company",
    });
  }

  try {
    /* =========================
       3️⃣ DUPLICATE CHECK
       (HR CODE / EMAIL / PHONE)
    ========================= */
    const dupSql = `
      SELECT id
      FROM ${TABLES.HR_USERS}
      WHERE company_id = ?
        AND (
          hr_code = ?
          OR email = ?
          OR phone = ?
        )
      LIMIT 1
    `;

    const dup = await dbExec(db, dupSql, [
      company_id,
      hr_code.trim(),
      email.toLowerCase(),
      phone,
    ]);

    if (dup.length) {
      return res.status(409).json({
        message: "HR already exists with this HR code, email, or phone",
      });
    }

    /* =========================
       4️⃣ CREATE HR
    ========================= */
    const password_hash = await bcrypt.hash(password, 10);

    const insertSql = `
      INSERT INTO ${TABLES.HR_USERS} (
        company_id,
        branch_id,
        hr_code,
        full_name,
        email,
        phone,
        password_hash,
        role,

        joining_date,
        experience_years,
        job_location,
        gender,
        dob,
        emergency_contact_name,
        emergency_contact_number,
        remarks,

        is_active,
        force_password_reset,
        last_login_at,
        created_by_admin_id
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `;

    const result = await dbExec(db, insertSql, [
      company_id,
      branch_id,
      hr_code.trim().toUpperCase(),
      full_name.trim(),
      email.toLowerCase(),
      phone,
      password_hash,
      "HR",

      joining_date,
      experience_years || null,
      job_location || null,
      gender || null,
      dob || null,
      emergency_contact_name || null,
      emergency_contact_number || null,
      remarks || null,

      1,     // is_active
      1,     // force_password_reset
      null,  // last_login_at
      admin_id,
    ]);

    return res.status(201).json({
      id: result.insertId,
      hr_code: hr_code.trim().toUpperCase(),
      message: "HR created successfully",
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to create HR", err);
    return res.status(500).json({
      message: "Create HR failed",
    });
  }
};



export const updateHR = async (req, res) => {
  const { id } = req.params;
  const {
    branch_id,
    full_name,
    email,
    phone,
    password,

    joining_date,
    experience_years,
    job_location,
    gender,
    dob,
    emergency_contact_name,
    emergency_contact_number,
    remarks,
    is_active,
  } = req.body;

  const { company_id } = req.user;

  if (!id) {
    return res.status(400).json({ message: "HR ID is required" });
  }

  if (password && password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters",
    });
  }

  /* =========================
     1️⃣ FETCH EXISTING HR
  ========================= */
  const hrSql = `
    SELECT *
    FROM ${TABLES.HR_USERS}
    WHERE id = ?
      AND company_id = ?
    LIMIT 1
  `;

  const hr = await dbExec(db, hrSql, [id, company_id]);

  if (!hr.length) {
    return res.status(404).json({
      message: "HR not found or does not belong to this company",
    });
  }

  const existing = hr[0];

  /* =========================
     2️⃣ VALIDATE BRANCH (IF CHANGED)
  ========================= */
  if (branch_id && branch_id !== existing.branch_id) {
    const branchSql = `
      SELECT id
      FROM ${TABLES.BRANCHES}
      WHERE id = ?
        AND company_id = ?
        AND is_active = 1
      LIMIT 1
    `;

    const branch = await dbExec(db, branchSql, [branch_id, company_id]);

    if (!branch.length) {
      return res.status(400).json({
        message: "Invalid branch for this company",
      });
    }
  }

  /* =========================
     3️⃣ DUPLICATE EMAIL / PHONE CHECK
  ========================= */
  if (email || phone) {
    const dupSql = `
      SELECT id
      FROM ${TABLES.HR_USERS}
      WHERE (email = ? OR phone = ?)
        AND id != ?
      LIMIT 1
    `;

    const dup = await dbExec(db, dupSql, [
      email?.toLowerCase() || existing.email,
      phone || existing.phone,
      id,
    ]);

    if (dup.length) {
      return res.status(409).json({
        message: "Another HR already exists with this email or phone",
      });
    }
  }

  /* =========================
     4️⃣ BUILD UPDATE
  ========================= */
  let updateSql = `
    UPDATE ${TABLES.HR_USERS}
    SET
      branch_id = ?,
      full_name = ?,
      email = ?,
      phone = ?,
      joining_date = ?,
      experience_years = ?,
      job_location = ?,
      gender = ?,
      dob = ?,
      emergency_contact_name = ?,
      emergency_contact_number = ?,
      remarks = ?,
      is_active = ?
  `;

  const values = [
    branch_id ?? existing.branch_id,
    full_name?.trim() ?? existing.full_name,
    email?.toLowerCase() ?? existing.email,
    phone ?? existing.phone,
    joining_date ?? existing.joining_date,
    experience_years ?? existing.experience_years,
    job_location ?? existing.job_location,
    gender ?? existing.gender,
    dob ?? existing.dob,
    emergency_contact_name ?? existing.emergency_contact_name,
    emergency_contact_number ?? existing.emergency_contact_number,
    remarks ?? existing.remarks,
    is_active ?? existing.is_active,
  ];

  if (password) {
    const password_hash = await bcrypt.hash(password, 10);
    updateSql += `, password_hash = ?, force_password_reset = 1`;
    values.push(password_hash);
  }

  updateSql += ` WHERE id = ? AND company_id = ?`;
  values.push(id, company_id);

  await dbExec(db, updateSql, values);

  return res.json({
    message: "HR updated successfully",
  });
};




/* =====================================================
   LIST HRs
 ===================================================== */
export const listHRs = async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res.status(400).json({
        message: "Invalid company context",
      });
    }

    const sql = `
      SELECT
        h.id,
        h.company_id,
        h.branch_id,
        h.hr_code,
        h.role,

        h.full_name,
        h.email,
        h.phone,

        h.gender,
        h.dob,
        h.emergency_contact_name,
        h.emergency_contact_number,
        h.remarks,

        h.joining_date,
        h.experience_years,
        h.job_location,

        h.is_active,
        h.force_password_reset,
        h.last_login_at,

        h.created_by_admin_id,
        h.created_at,
        h.updated_at,

        b.branch_name
      FROM ${TABLES.HR_USERS} h
      JOIN ${TABLES.BRANCHES} b
        ON b.id = h.branch_id
       AND b.company_id = h.company_id
      WHERE h.company_id = ?
      ORDER BY h.created_at DESC
    `;

    const rows = await dbExec(db, sql, [company_id]);

    return res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to list HRs", err);
    return res.status(500).json({
      message: "Failed to fetch HR list",
    });
  }
};



/* =====================================================
   GET HR BY ID
===================================================== */
export const getHRById = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      SELECT id, emp_id, branch_id, department_id, is_active
      FROM ${TABLES.HR_USERS}
      WHERE id = ? AND company_id = ?
      LIMIT 1
    `;

    const rows = await dbExec(db, sql, [id, company_id]);

    if (!rows.length) {
      return res.status(404).json({ message: "HR not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to get HR by ID", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* =====================================================
   UPDATE HR
===================================================== */

/* =====================================================
   TOGGLE HR STATUS
===================================================== */
export const toggleHRStatus = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      UPDATE ${TABLES.HR_USERS}
      SET is_active = NOT is_active
      WHERE id = ? AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "HR not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to toggle HR status", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* =====================================================
   DELETE HR
===================================================== */
export const deleteHR = async (req, res) => {
  const { id } = req.params;
  const { company_id } = req.user;

  try {
    const sql = `
      DELETE FROM ${TABLES.HR_USERS}
      WHERE id = ? AND company_id = ?
    `;

    const result = await dbExec(db, sql, [id, company_id]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "HR not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to delete HR", err);
    return res.status(500).json({ message: "Delete failed" });
  }
};

/* =====================================================
   HR PRE LOGIN
===================================================== */
export const hrPreLogin = async (req, res) => {
  const { company_id, emp_id, password } = req.body;

  if (!company_id || !emp_id || !password) {
    return res.status(400).json({ message: "Missing credentials" });
  }

  try {
    /* 1️⃣ Fetch HR */
    const sql = `
      SELECT id, email, password_hash, is_active
      FROM ${TABLES.HR_USERS}
      WHERE emp_id = ?
        AND company_id = ?
      LIMIT 1
    `;

    const rows = await dbExec(db, sql, [emp_id, company_id]);

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const hr = rows[0];

    if (!hr.is_active) {
      return res.status(403).json({ message: "HR account disabled" });
    }

    const isMatch = await bcrypt.compare(password, hr.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    /* 2️⃣ Invalidate previous OTPs */
    await dbExec(
      db,
      `
      UPDATE ${TABLES.AUTH_OTPS}
      SET is_used = 1
      WHERE user_type = 'HR'
        AND user_id = ?
        AND is_used = 0
      `,
      [hr.id]
    );

    /* 3️⃣ Generate OTP */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 8);

    /* 4️⃣ Store OTP */
    const insertSql = `
      INSERT INTO ${TABLES.AUTH_OTPS}
        (user_type, user_id, email, otp_hash, expires_at)
      VALUES
        ('HR', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
    `;

    const result = await dbExec(db, insertSql, [
      hr.id,
      hr.email,
      otpHash,
    ]);

    /* 5️⃣ Send OTP (ASYNC – NON BLOCKING) */
    sendSystemEmail({
      to: hr.email,
      subject: "HR Login OTP",
      body: `Your OTP is ${otp}. It is valid for 5 minutes.`
    }).catch(err => {
      logger.error(MODULE_NAME, "HR OTP email failed", err);
    });

    return res.json({
      tempLoginId: result.insertId,
      email: hr.email,
      message: "OTP sent to registered email",
    });

  } catch (err) {
    logger.error(MODULE_NAME, "HR pre-login failed", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

/* =====================================================
   HR VERIFY OTP
===================================================== */
export const hrVerifyOtp = async (req, res) => {
  const { tempLoginId, otp, action = "VERIFY" } = req.body;

  if (!tempLoginId) {
    return res.status(400).json({ message: "Missing login reference" });
  }

  try {
    /* 1️⃣ Fetch OTP */
    const otpRows = await dbExec(
      db,
      `
      SELECT *
      FROM ${TABLES.AUTH_OTPS}
      WHERE id = ?
        AND user_type = 'HR'
        AND is_used = 0
      LIMIT 1
      `,
      [tempLoginId]
    );

    if (!otpRows.length) {
      return res.status(401).json({ message: "Session expired" });
    }

    const otpRecord = otpRows[0];

    /* ==========================
       🔁 RESEND OTP
    ========================== */
    if (action === "RESEND") {
      await dbExec(
        db,
        `UPDATE ${TABLES.AUTH_OTPS} SET is_used = 1 WHERE id = ?`,
        [otpRecord.id]
      );

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const newOtpHash = await bcrypt.hash(newOtp, 8);

      const insertSql = `
        INSERT INTO ${TABLES.AUTH_OTPS}
          (user_type, user_id, email, otp_hash, expires_at)
        VALUES
          ('HR', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
      `;

      const result = await dbExec(db, insertSql, [
        otpRecord.user_id,
        otpRecord.email,
        newOtpHash,
      ]);

      sendSystemEmail({
        to: otpRecord.email,
        subject: "HR Login OTP",
        body: `Your OTP is ${newOtp}. It is valid for 5 minutes.`
      }).catch(err => {
        logger.error(MODULE_NAME, "HR resend OTP email failed", err);
      });

      return res.json({
        tempLoginId: result.insertId,
        message: "OTP resent successfully",
      });
    }

    /* ==========================
       ✅ VERIFY OTP
    ========================== */
    if (!otp) {
      return res.status(400).json({ message: "OTP required" });
    }

    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.status(401).json({ message: "OTP expired" });
    }

    const isValid = await bcrypt.compare(otp, otpRecord.otp_hash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid OTP" });
    }

    await dbExec(
      db,
      `UPDATE ${TABLES.AUTH_OTPS} SET is_used = 1 WHERE id = ?`,
      [otpRecord.id]
    );

    /* Fetch HR details */
    const hrRows = await dbExec(
      db,
      `
      SELECT id, emp_id, company_id, branch_id, department_id
      FROM ${TABLES.HR_USERS}
      WHERE id = ?
      LIMIT 1
      `,
      [otpRecord.user_id]
    );

    const hr = hrRows[0];

    const token = generateToken({
      id: hr.id,
      role: "HR",
      company_id: hr.company_id,
      branch_id: hr.branch_id,
      department_id: hr.department_id,
    });

    await dbExec(
      db,
      `
      UPDATE ${TABLES.HR_USERS}
      SET last_login_at = NOW()
      WHERE id = ?
      `,
      [hr.id]
    );

    return res.json({
      token,
      emp_id: hr.emp_id,
      company_id: hr.company_id,
      branch_id: hr.branch_id,
      department_id: hr.department_id,
    });

  } catch (err) {
    logger.error(MODULE_NAME, "HR verify OTP failed", err);
    return res.status(500).json({ message: "OTP verification failed" });
  }
};

