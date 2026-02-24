import db from "../../../models/db.js";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { generateToken } from "../../../utils/jwt.js";
import { dbExec } from "../../../utils/dbExec.js";
import { TABLES } from "../../../utils/tableNames.js";
import { sendSystemEmail } from "../../../mail/index.js";
import logger from "../../../utils/logger.js";

const MODULE_NAME = "SUPER_ADMIN_COMPANY_ADMIN_CONTROLLER";


/* =====================================================
   CREATE COMPANY ADMIN (SUPER ADMIN ONLY)
===================================================== */
export const createCompanyAdmin = async (req, res) => {
  const { company_id, email, password } = req.body;

  if (!company_id || !email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  try {
    const checkSql = `
      SELECT id
      FROM ${TABLES.COMPANY_ADMINS}
      WHERE company_id = ?
      LIMIT 1
    `;

    const existing = await dbExec(db, checkSql, [company_id]);

    if (existing.length) {
      return res.status(409).json({ message: "Admin already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertSql = `
      INSERT INTO ${TABLES.COMPANY_ADMINS} (company_id, email, password, is_active)
      VALUES (?, ?, ?, 1)
    `;

    const result = await dbExec(db, insertSql, [
      company_id,
      email,
      hashedPassword,
    ]);

    return res.status(201).json({
      admin: {
        id: result.insertId,
        company_id,
        email,
      },
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to create company admin", err);
    return res.status(500).json({ message: "Server error" });
  }
};


/* =====================================================
   COMPANY ADMIN PRE-LOGIN (EMAIL + PASSWORD → SEND OTP)
===================================================== */
export const companyAdminPreLogin = async (req, res) => {
  const { company_id, email, password } = req.body;

  if (!company_id || !email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    /* 1️⃣ Validate admin */
    const adminSql = `
      SELECT id, password, email, company_id
      FROM ${TABLES.COMPANY_ADMINS}
      WHERE email = ?
        AND company_id = ?
        AND is_active = 1
      LIMIT 1
    `;

    const admins = await dbExec(db, adminSql, [email, company_id]);

    if (!admins.length) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const admin = admins[0];

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    /* 2️⃣ Invalidate previous OTPs */
    await dbExec(
      db,
      `
      UPDATE ${TABLES.AUTH_OTPS}
      SET is_used = 1
      WHERE user_type = 'COMPANY_ADMIN'
        AND user_id = ?
        AND is_used = 0
      `,
      [admin.id]
    );

    /* 3️⃣ Generate OTP */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    /* 4️⃣ Store OTP */
    const insertOtpSql = `
      INSERT INTO ${TABLES.AUTH_OTPS}
        (user_type, user_id, email, otp_hash, expires_at)
      VALUES
        ('COMPANY_ADMIN', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
    `;

    const otpResult = await dbExec(db, insertOtpSql, [
      admin.id,
      admin.email,
      otpHash,
    ]);

    /* 5️⃣ Send OTP (replace with email service) */
    /* 5️⃣ Send OTP email */
    sendSystemEmail({
      to: admin.email,
      subject: "Company Admin Login OTP",
      body: `Your OTP is ${otp}. It is valid for 5 minutes.`
    });


    return res.json({
      tempLoginId: otpResult.insertId,
      email: admin.email,
      message: "OTP sent to registered email",
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Company admin pre-login failed", err);
    return res.status(500).json({ message: "Server error" });
  }
};


/* =====================================================
   COMPANY ADMIN OTP VERIFY OR RESEND
===================================================== */
export const companyAdminVerifyOtp = async (req, res) => {
  const { tempLoginId, otp, action = "VERIFY" } = req.body;

  if (!tempLoginId) {
    return res.status(400).json({ message: "Missing login reference" });
  }

  try {
    /* 1️⃣ Fetch OTP record */
    const otpSql = `
      SELECT *
      FROM ${TABLES.AUTH_OTPS}
      WHERE id = ?
        AND user_type = 'COMPANY_ADMIN'
        AND is_used = 0
      LIMIT 1
    `;

    const otps = await dbExec(db, otpSql, [tempLoginId]);

    if (!otps.length) {
      return res.status(401).json({ message: "Session expired" });
    }

    const otpRecord = otps[0];

    /* ==========================
       🔁 RESEND OTP
    ========================== */
    /* ==========================
    🔁 RESEND OTP
 ========================== */
    if (action === "RESEND") {
      /* Invalidate current OTP */
      await dbExec(
        db,
        `UPDATE ${TABLES.AUTH_OTPS} SET is_used = 1 WHERE id = ?`,
        [otpRecord.id]
      );

      /* Generate new OTP */
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const newOtpHash = await bcrypt.hash(newOtp, 10);

      const insertSql = `
    INSERT INTO ${TABLES.AUTH_OTPS}
      (user_type, user_id, email, otp_hash, expires_at)
    VALUES
      ('COMPANY_ADMIN', ?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
  `;

      const result = await dbExec(db, insertSql, [
        otpRecord.user_id,
        otpRecord.email,
        newOtpHash,
      ]);

      /* ✅ Send email to stored email */
      sendSystemEmail({
        to: otpRecord.email,
        subject: "Company Admin Login OTP",
        body: `Your OTP is ${newOtp}. It is valid for 5 minutes.`
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

    /* Mark OTP used */
    await dbExec(
      db,
      `UPDATE ${TABLES.AUTH_OTPS} SET is_used = 1 WHERE id = ?`,
      [otpRecord.id]
    );

    /* Get company_id safely */
    const adminRow = await dbExec(
      db,
      `
      SELECT company_id
      FROM ${TABLES.COMPANY_ADMINS}
      WHERE id = ?
      LIMIT 1
      `,
      [otpRecord.user_id]
    );

    const token = generateToken({
      id: otpRecord.user_id,
      role: "COMPANY_ADMIN",
      company_id: adminRow[0].company_id,
    });

    /* Update last login */
    await dbExec(
      db,
      `
      UPDATE ${TABLES.COMPANY_ADMINS}
      SET last_login_at = NOW()
      WHERE id = ?
      `,
      [otpRecord.user_id]
    );

    return res.json({
      token,
      role: "COMPANY_ADMIN",
      company_id: adminRow[0].company_id,
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Company admin OTP verification failed", err);
    return res.status(500).json({ message: "Server error" });
  }
};


