import db from "../../../models/db.js";
import bcrypt from "bcrypt";
import { generateToken } from "../../../utils/jwt.js";
import { dbExec } from "../../../utils/dbExec.js";
import { TABLES } from "../../../utils/tableNames.js";
import { generateOTP } from "../../../utils/otp.js";
import { sendOtpEmail } from "../../../mail/index.js";
import logger from "../../../utils/logger.js";

const MODULE_NAME = "SUPER_ADMIN_CONTROLLER";

/* ============================
   SUPER ADMIN LOGIN
============================ */
export const superAdminLogin = async (req, res) => {
  const { email, otp } = req.body;

  // 1. Basic validation
  if (!email || !otp) {
    return res.status(400).json({
      message: "Please enter email and OTP"
    });
  }

  try {
    // 2. Fetch admin (NO password check here)
    const rows = await dbExec(
      db,
      `SELECT id, email
       FROM ${TABLES.SUPER_ADMIN}
       WHERE email = ? AND is_active = 1
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid email" });
    }

    const admin = rows[0];

    // 3. Verify OTP
    const otpRows = await dbExec(
      db,
      `
      SELECT id
      FROM super_admin_otps
      WHERE super_admin_id = ?
        AND otp = ?
        AND is_used = 0
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [admin.id, otp]
    );

    if (!otpRows.length) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    // 4. Mark OTP as used
    await dbExec(
      db,
      `UPDATE super_admin_otps
       SET is_used = 1
       WHERE id = ?`,
      [otpRows[0].id]
    );

    // 5. Generate JWT
    const token = generateToken({
      id: admin.id,
      role: "SUPER_ADMIN",
    });

    return res.json({
      token,
      role: "SUPER_ADMIN",
      email: admin.email,
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Super admin login failed", err);
    return res.status(500).json({ message: "Login failed" });
  }
};


export const sendSuperAdminOTP = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  try {
    // 1. Fetch admin
    const rows = await dbExec(
      db,
      `SELECT id, password FROM ${TABLES.SUPER_ADMIN}
       WHERE email = ? AND is_active = 1
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const admin = rows[0];

    // 2. Verify password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 3. Invalidate previous OTPs
    await dbExec(
      db,
      `UPDATE super_admin_otps
       SET is_used = 1
       WHERE super_admin_id = ?`,
      [admin.id]
    );

    // 4. Generate & store OTP
    const otp = generateOTP(); // 6-digit
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    await dbExec(
      db,
      `INSERT INTO super_admin_otps (super_admin_id, otp, expires_at)
       VALUES (?, ?, ?)`,
      [admin.id, otp, expiresAt]
    );

    // 5. Send email
    await sendOtpEmail(email, otp);

    return res.json({ message: "OTP sent successfully" });

  } catch (err) {
    logger.error(MODULE_NAME, "Failed to send super admin OTP", err);
    return res.status(500).json({ message: "Failed to send OTP" });
  }
};


/* ============================
   SUPER ADMIN LOGOUT
============================ */
export const superAdminLogout = async (req, res) => {
  return res.json({ message: "Logged out successfully" });
};

/* ============================
   COMPANY SUMMARY
============================ */
export const getCompanySummary = async (req, res) => {
  const companyId = req.params.id;

  try {
    const companySql = `
      SELECT id, name, email, is_active
      FROM ${TABLES.COMPANIES}
      WHERE id = ?
      LIMIT 1
    `;

    const companyRows = await dbExec(db, companySql, [companyId]);
    if (!companyRows.length) {
      return res.status(404).json({ message: "Company not found" });
    }

    const company = companyRows[0];

    const [admins, departments, employees] = await Promise.all([
      dbExec(
        db,
        `SELECT COUNT(*) AS count FROM ${TABLES.COMPANY_ADMINS} WHERE company_id = ?`,
        [companyId]
      ),
      dbExec(
        db,
        `SELECT COUNT(*) AS count FROM ${TABLES.DEPARTMENTS} WHERE company_id = ?`,
        [companyId]
      ),
      dbExec(
        db,
        `SELECT COUNT(*) AS count FROM ${TABLES.EMPLOYEES} WHERE company_id = ?`,
        [companyId]
      ),
    ]);

    return res.json({
      company,
      adminCount: admins[0].count,
      departmentCount: departments[0].count,
      employeeCount: employees[0].count,
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to get company summary", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE COMPANY STATUS
============================ */
export const updateCompanyStatus = async (req, res) => {
  const companyId = req.params.id;
  const { is_active } = req.body;

  if (![0, 1].includes(is_active)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const sql = `
      UPDATE ${TABLES.COMPANIES}
      SET is_active = ?
      WHERE id = ?
    `;

    const result = await dbExec(db, sql, [is_active, companyId]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Company not found" });
    }

    return res.json({
      message: is_active ? "Company activated" : "Company deactivated",
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update company status", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE COMPANY NAME
============================ */
export const updateCompanyName = async (req, res) => {
  const companyId = req.params.id;
  const { name } = req.body;

  if (!name?.trim()) {
    return res.status(400).json({ message: "Company name required" });
  }

  try {
    const sql = `
      UPDATE ${TABLES.COMPANIES}
      SET name = ?
      WHERE id = ?
    `;

    const result = await dbExec(db, sql, [name.trim(), companyId]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Company not found" });
    }

    return res.json({ message: "Company name updated successfully" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update company name", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   GET COMPANY ADMINS
============================ */
export const getCompanyAdmins = async (req, res) => {
  const companyId = req.params.id;

  try {
    const sql = `
      SELECT id, email, is_active, created_at
      FROM ${TABLES.COMPANY_ADMINS}
      WHERE company_id = ?
      ORDER BY created_at DESC
    `;

    const rows = await dbExec(db, sql, [companyId]);
    return res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to get company admins", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE COMPANY ADMIN EMAIL
============================ */
export const updateCompanyAdminEmail = async (req, res) => {
  const adminId = req.params.id;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email required" });
  }

  try {
    const sql = `
      UPDATE ${TABLES.COMPANY_ADMINS}
      SET email = ?
      WHERE id = ?
    `;

    const result = await dbExec(db, sql, [email, adminId]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.json({ message: "Admin email updated" });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update company admin email", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   UPDATE COMPANY ADMIN STATUS
============================ */
export const updateCompanyAdminStatus = async (req, res) => {
  const adminId = req.params.id;
  const { is_active } = req.body;

  if (![0, 1].includes(is_active)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const sql = `
      UPDATE ${TABLES.COMPANY_ADMINS}
      SET is_active = ?
      WHERE id = ?
    `;

    const result = await dbExec(db, sql, [is_active, adminId]);

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.json({
      message: is_active ? "Admin activated" : "Admin deactivated",
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to update company admin status", err);
    return res.status(500).json({ message: "DB error" });
  }
};

/* ============================
   COMPANIES WITHOUT ADMIN
============================ */
export const getCompaniesWithoutAdmin = async (req, res) => {
  try {
    const sql = `
      SELECT c.id, c.name
      FROM ${TABLES.COMPANIES} c
      LEFT JOIN ${TABLES.COMPANY_ADMINS} ca ON ca.company_id = c.id
      WHERE ca.id IS NULL
        AND c.is_active = 1
      ORDER BY c.name
    `;

    const rows = await dbExec(db, sql);
    return res.json(rows);
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to get companies without admin", err);
    return res.status(500).json({ message: "DB error" });
  }
};
