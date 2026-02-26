import db from "../../models/db.js";
import bcrypt from "bcrypt";
import { generateToken } from "../../utils/jwt.js";
import { TABLES } from "../../utils/tableNames.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_AUTH_CONTROLLER";



/* -----------------------------------------
   EMPLOYEE LOGIN – STEP 1 (NO TOKEN)
----------------------------------------- */
import { sendSystemEmail } from "../../mail/index.js";


export const employeeLogin = async (req, res) => {
  try {
    const { employee_code, password, player_id, device_type } = req.body;

    /* ---------------------------------
       1️⃣ BASIC INPUT VALIDATION
    --------------------------------- */
    if (!employee_code || !password) {
      return res.status(400).json({
        success: false,
        message: "Employee code and password are required"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH EMPLOYEE + AUTH
    --------------------------------- */
    const [rows] = await db.query(
      `SELECT 
         e.id,
         e.employee_code,
         e.company_id,
         e.email,
         ea.password_hash,
         ea.is_active
       FROM employees e
       JOIN employee_auth ea ON ea.employee_id = e.id
       WHERE e.employee_code = ?`,
      [employee_code]
    );

    /* ---------------------------------
       3️⃣ AUTH FAILURE CASES (EXPLICIT)
    --------------------------------- */
    if (!rows.length) {
      const [caseRows] = await db.query(
        `SELECT employee_code
        FROM employees
        WHERE LOWER(employee_code) = LOWER(?)`,
        [employee_code]
      );

      if (caseRows.length) {
        return res.status(401).json({
          success: false,
          message: "Employee id mismatch. Please check your employee Id"
        });
      }

      return res.status(401).json({
        success: false,
        message: "Invalid employee id"
      });
    }


    const employee = rows[0];

    if (!employee.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive"
      });
    }

    const passwordMatch = await bcrypt.compare(password, employee.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password"
      });
    }

    if (!employee.email) {
      return res.status(400).json({
        success: false,
        message: "Email not registered"
      });
    }

    /* ---------------------------------
       4️⃣ DEVICE VALIDATION
    --------------------------------- */
    if (!device_type || typeof device_type !== "string" || !device_type.trim()) {
      return res.status(400).json({
        success: false,
        message: "device_type is required"
      });
    }

    // player_id is OPTIONAL now
    const safePlayerId = player_id || null;

    /* ---------------------------------
       5️⃣ UPSERT DEVICE
    --------------------------------- */
    /* ---------------------------------
   5️⃣ INSERT DEVICE (NO UPSERT)
--------------------------------- */
    // await db.query(
    //   `INSERT INTO employee_devices
    //   (employee_id, player_id, device_type, last_login_at)
    //   VALUES (?, ?, ?, NOW())`,
    //   [employee.id, safePlayerId, device_type]
    // );

    /* ---------------------------------
   5️⃣ UPSERT DEVICE (PRODUCTION SAFE)
--------------------------------- */
if (safePlayerId) {
  await db.query(
    `
    INSERT INTO employee_devices
      (employee_id, player_id, device_type, is_active, last_login_at)
    VALUES (?, ?, ?, 1, NOW())
    ON DUPLICATE KEY UPDATE
      employee_id = VALUES(employee_id),
      device_type = VALUES(device_type),
      is_active = 1,
      last_login_at = NOW()
    `,
    [employee.id, safePlayerId, device_type]
  );
}



    /* ---------------------------------
       6️⃣ GENERATE OTP
    --------------------------------- */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    // Invalidate old LOGIN OTPs
    await db.query(
      `UPDATE employee_otps
   SET is_used = 1
   WHERE employee_id = ?
     AND purpose = 'LOGIN'
     AND is_used = 0`,
      [employee.id]
    );


    await db.query(
      `INSERT INTO employee_otps
   (employee_id, otp, purpose, is_used, expires_at, created_at)
   VALUES (?, ?, 'LOGIN', 0, ?, NOW())`,
      [employee.id, otp, expiresAt]
    );


    /* ---------------------------------
       7️⃣ SEND OTP EMAIL
    --------------------------------- */
    await sendSystemEmail({
      to: employee.email,
      subject: "Your Login OTP",
      body: `Your OTP for login is: ${otp}. This OTP is valid for 5 minutes.`
    });

    /* ---------------------------------
       8️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      otp_required: true,
      employee_id: employee.id,
      employee_code: employee.employee_code,
      message: "The OTP has been successfully sent to your registered email"
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Employee login failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};
/* -----------------------------------------
   EMPLOYEE OTP VERIFY (STATIC)
----------------------------------------- */
export const verifyEmployeeOtp = async (req, res) => {
  try {
    const { employee_id, otp } = req.body;

    /* ---------------------------------
       1️⃣ VERIFY OTP
    --------------------------------- */
    const [otpRows] = await db.query(
      `SELECT id
       FROM employee_otps
       WHERE employee_id = ?
         AND otp = ?
         AND purpose = 'LOGIN'
         AND is_used = 0
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [employee_id, otp]
    );

    if (!otpRows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }
    const [updateResult] = await db.query(
      `UPDATE employee_otps
      SET is_used = 1
      WHERE id = ? AND is_used = 0`,
      [otpRows[0].id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(401).json({
        success: false,
        message: "OTP already used"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH EMPLOYEE CORE + PROFILE
    --------------------------------- */
    const [employeeRows] = await db.query(
      `SELECT
    e.id AS employee_id,
    e.company_id,
    c.name AS company_name,

    e.employee_code,
    e.full_name,
    e.email,
    e.country_code,
    e.phone,
    e.employee_status,
    e.employment_status,
    e.joining_date,
    e.salary,
    e.ctc_annual,
    e.job_location,
    e.site_location,
    e.branch_id,

    d.department_name,
    b.branch_name,
    g.designation_name,

    ea.is_active AS login_active,
    ea.last_login_at,

    ep.gender,
    ep.dob,
    ep.religion,
    ep.father_name,
    ep.marital_status,
    ep.qualification,
    ep.emergency_contact,
    ep.address,
    ep.permanent_address,
    ep.bank_name,
    ep.account_number,
    ep.ifsc_code,
    ep.bank_branch_name,
    ep.profile_photo_path

  FROM employees e
  JOIN companies c ON c.id = e.company_id   -- ✅ ADD THIS
  JOIN departments d ON d.id = e.department_id
  JOIN branches b ON b.id = e.branch_id
  JOIN designations g ON g.id = e.designation_id
  LEFT JOIN employee_auth ea ON ea.employee_id = e.id
  LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
  WHERE e.id = ?`,
      [employee_id]
    );


    if (!employeeRows.length) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const employee = employeeRows[0];

    /* ---------------------------------
       3️⃣ FETCH DOCUMENTS (ARRAY)
    --------------------------------- */
    const [documents] = await db.query(
      `SELECT
        id,
        document_type,
        document_number,
        storage_provider,
        storage_bucket,
        storage_object_key,
        file_path,
        is_employee_visible,
        created_at
      FROM employee_documents
      WHERE employee_id = ?`,
      [employee_id]
    );
    const [deviceRows] = await db.query(
      `SELECT device_type
        FROM employee_devices
        WHERE employee_id = ?
          AND is_active = 1
        ORDER BY last_login_at DESC
        LIMIT 1`,
      [employee_id]
    );

    const device_type = deviceRows.length
      ? deviceRows[0].device_type
      : null;


    /* ---------------------------------
       4️⃣ GENERATE TOKEN
    --------------------------------- */
    const token = generateToken({
      id: employee.employee_id,
      role: "EMPLOYEE",
      company_id: employee.company_id,
      branch_id: employee.branch_id   // ✅ REQUIRED
    });

    /* ---------------------------------
       5️⃣ FINAL RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "Login successful",
      token,
      employee: {
        employee_id: employee.employee_id,
        employee_code: employee.employee_code,
        full_name: employee.full_name,
        email: employee.email,
        country_code: employee.country_code,
        phone: employee.phone,


        company_id: employee.company_id,
        company_name: employee.company_name,


        employee_status: employee.employee_status,
        employment_status: employee.employment_status,
        joining_date: employee.joining_date,

        department: employee.department_name,
        branch: employee.branch_name,
        designation: employee.designation_name,
        job_location: employee.job_location,
        site_location: employee.site_location,

        gender: employee.gender,
        dob: employee.dob,
        religion: employee.religion,
        father_name: employee.father_name,
        marital_status: employee.marital_status,
        qualification: employee.qualification,
        emergency_contact: employee.emergency_contact,
        address: employee.address,
        permanent_address: employee.permanent_address,

        bank_name: employee.bank_name,
        account_number: employee.account_number,
        ifsc_code: employee.ifsc_code,
        bank_branch_name: employee.bank_branch_name,

        profile_photo_path: employee.profile_photo_path,
        device_type,
        documents
      }
    });



  } catch (err) {
    logger.error(MODULE_NAME, "OTP verify failed", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};


export const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { employee_code } = req.body;

    /* ---------------------------------
       1️⃣ BASIC INPUT VALIDATION
    --------------------------------- */
    if (!employee_code) {
      return res.status(400).json({
        success: false,
        message: "Employee Id is required"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH EMPLOYEE
    --------------------------------- */
    const [rows] = await db.query(
      `SELECT e.id, e.employee_code, e.email, ea.is_active
       FROM employees e
       JOIN employee_auth ea ON ea.employee_id = e.id
       WHERE e.employee_code = ?`,
      [employee_code]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Invalid employee id"
      });
    }

    const employee = rows[0];

    if (!employee.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive"
      });
    }

    if (!employee.email) {
      return res.status(400).json({
        success: false,
        message: "Email not registered"
      });
    }

    /* ---------------------------------
       3️⃣ GENERATE OTP
    --------------------------------- */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    /* ---------------------------------
       4️⃣ INVALIDATE OLD OTPs
    --------------------------------- */
    await db.query(
      `UPDATE employee_otps
   SET is_used = 1
   WHERE employee_id = ?
     AND purpose = 'FORGOT_PASSWORD'
     AND is_used = 0`,
      [employee.id]
    );


    /* ---------------------------------
       5️⃣ STORE NEW OTP
    --------------------------------- */
    await db.query(
      `INSERT INTO employee_otps
   (employee_id, otp, purpose, expires_at, is_used, attempt_count)
   VALUES (?, ?, 'FORGOT_PASSWORD', ?, 0, 0)`,
      [employee.id, otp, expiresAt]
    );


    /* ---------------------------------
       6️⃣ SEND EMAIL
    --------------------------------- */
    try {
      await sendSystemEmail({
        to: employee.email,
        subject: "Password Reset OTP",
        body: `Your OTP to reset your password is: ${otp}. This OTP is valid for 5 minutes.`
      });
    } catch (emailErr) {
      logger.error(MODULE_NAME, "Email send failed for forgot password OTP", emailErr);

      return res.status(500).json({
        success: false,
        message: "Unable to send OTP email. Please try again."
      });
    }


    /* ---------------------------------
       7️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "The OTP has been successfully sent to your registered email",
      employee_id: employee.id,
      employee_code: employee.employee_code
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Forgot password OTP generation failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};


export const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { employee_id, otp } = req.body;

    /* ---------------------------------
       1️⃣ BASIC INPUT VALIDATION
    --------------------------------- */
    if (!employee_id || !otp) {
      return res.status(400).json({
        success: false,
        message: "Employee Id and OTP are required"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH OTP
    --------------------------------- */
    const [otpRows] = await db.query(
      `SELECT id
       FROM employee_otps
       WHERE employee_id = ?
         AND otp = ?
         AND purpose = 'FORGOT_PASSWORD'
         AND is_used = 0
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [employee_id, otp]
    );

    if (!otpRows.length) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    /* ---------------------------------
       3️⃣ ATOMIC OTP INVALIDATION
    --------------------------------- */
    const [updateResult] = await db.query(
      `UPDATE employee_otps
       SET is_used = 1
       WHERE id = ? AND is_used = 0`,
      [otpRows[0].id]
    );

    if (updateResult.affectedRows === 0) {
      return res.status(401).json({
        success: false,
        message: "OTP already used"
      });
    }

    /* ---------------------------------
       4️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "OTP verified successfully"
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Verify forgot OTP failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};


export const resetEmployeePassword = async (req, res) => {
  try {
    const { employee_id, new_password } = req.body;

    /* ---------------------------------
       1️⃣ BASIC INPUT VALIDATION
    --------------------------------- */
    if (!employee_id || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Employee Id and new password are required"
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long"
      });
    }

    /* ---------------------------------
       2️⃣ VERIFY EMPLOYEE & ACCOUNT STATUS
    --------------------------------- */
    const [authRows] = await db.query(
      `SELECT is_active, is_account_locked
       FROM employee_auth
       WHERE employee_id = ?`,
      [employee_id]
    );

    if (!authRows.length) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    if (!authRows[0].is_active || authRows[0].is_account_locked) {
      return res.status(403).json({
        success: false,
        message: "Account is inactive or locked"
      });
    }

    /* ---------------------------------
       3️⃣ ENSURE FORGOT PASSWORD OTP WAS VERIFIED
       (OTP must already be used)
    --------------------------------- */
    const [otpRows] = await db.query(
      `SELECT id
      FROM employee_otps
      WHERE employee_id = ?
        AND purpose = 'FORGOT_PASSWORD'
        AND is_used = 1
      ORDER BY created_at DESC
      LIMIT 1`,
      [employee_id]
    );

    if (!otpRows.length) {
      return res.status(403).json({
        success: false,
        message: "OTP verification required"
      });
    }

    await db.query(
      `DELETE FROM employee_otps
      WHERE id = ?`,
      [otpRows[0].id]
    );


    /* ---------------------------------
       4️⃣ HASH & UPDATE PASSWORD
    --------------------------------- */
    const hash = await bcrypt.hash(new_password, 10);

    await db.query(
      `UPDATE employee_auth
       SET password_hash = ?,
           last_password_reset_at = NOW(),
           login_failed_attempts = 0,
           is_account_locked = 0
       WHERE employee_id = ?`,
      [hash, employee_id]
    );

    /* ---------------------------------
       5️⃣ INVALIDATE ALL DEVICES
    --------------------------------- */
    await db.query(
      `UPDATE employee_devices
       SET is_active = 0
       WHERE employee_id = ?`,
      [employee_id]
    );

    /* ---------------------------------
       6️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "Your password has been updated. Please login again."
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Reset password failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};


export const resendForgotPasswordOtp = async (req, res) => {
  try {
    const { employee_code } = req.body;

    /* ---------------------------------
       1️⃣ INPUT VALIDATION
    --------------------------------- */
    if (!employee_code) {
      return res.status(400).json({
        success: false,
        message: "Employee id is required"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH EMPLOYEE + AUTH
    --------------------------------- */
    const [rows] = await db.query(
      `SELECT e.id, e.employee_code, e.email, ea.is_active
       FROM employees e
       JOIN employee_auth ea ON ea.employee_id = e.id
       WHERE e.employee_code = ?`,
      [employee_code]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Invalid employee id"
      });
    }

    const employee = rows[0];

    if (!employee.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive"
      });
    }

    if (!employee.email) {
      return res.status(400).json({
        success: false,
        message: "Email not registered"
      });
    }

    /* ---------------------------------
       3️⃣ OPTIONAL RATE CONTROL (SOFT)
       Prevent spamming resend
    --------------------------------- */
    const [recentOtp] = await db.query(
      `SELECT created_at
       FROM employee_otps
       WHERE employee_id = ?
         AND purpose = 'FORGOT_PASSWORD'
       ORDER BY created_at DESC
       LIMIT 1`,
      [employee.id]
    );

    if (recentOtp.length) {
      const lastOtpTime = new Date(recentOtp[0].created_at).getTime();
      const now = Date.now();

      // block resend within 60 seconds
      if (now - lastOtpTime < 60 * 1000) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP"
        });
      }
    }

    /* ---------------------------------
       4️⃣ GENERATE NEW OTP
    --------------------------------- */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    /* ---------------------------------
       5️⃣ INVALIDATE OLD OTPs
    --------------------------------- */
    await db.query(
      `UPDATE employee_otps
       SET is_used = 1
       WHERE employee_id = ?
         AND purpose = 'FORGOT_PASSWORD'`,
      [employee.id]
    );

    /* ---------------------------------
       6️⃣ STORE NEW OTP
    --------------------------------- */
    await db.query(
      `INSERT INTO employee_otps
       (employee_id, otp, purpose, expires_at)
       VALUES (?, ?, 'FORGOT_PASSWORD', ?)`,
      [employee.id, otp, expiresAt]
    );

    /* ---------------------------------
       7️⃣ SEND EMAIL
    --------------------------------- */
    await sendSystemEmail({
      to: employee.email,
      subject: "Password Reset OTP (Resent)",
      body: `Your OTP to reset your password is: ${otp}. This OTP is valid for 5 minutes.`
    });

    /* ---------------------------------
       8️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "A new OTP has been resent to your registered email",
      employee_id: employee.id,
      employee_code: employee.employee_code
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Resend forgot password OTP failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};


export const changeEmployeePassword = async (req, res) => {
  try {
    const employee_id = req.user?.id; // from JWT
    const { old_password, new_password } = req.body;

    /* ---------------------------------
       1️⃣ INPUT VALIDATION
    --------------------------------- */
    if (!employee_id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access"
      });
    }

    if (!old_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: "Old password and New password are required"
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long"
      });
    }

    if (old_password === new_password) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from old password"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH AUTH DATA
    --------------------------------- */
    const [authRows] = await db.query(
      `SELECT password_hash, is_active, is_account_locked
       FROM employee_auth
       WHERE employee_id = ?`,
      [employee_id]
    );

    if (!authRows.length) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const auth = authRows[0];

    if (!auth.is_active || auth.is_account_locked) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive or locked"
      });
    }

    /* ---------------------------------
       3️⃣ VERIFY OLD PASSWORD
    --------------------------------- */
    const isMatch = await bcrypt.compare(old_password, auth.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password is incorrect"
      });
    }

    /* ---------------------------------
       4️⃣ HASH & UPDATE NEW PASSWORD
    --------------------------------- */
    const newHash = await bcrypt.hash(new_password, 10);

    await db.query(
      `UPDATE employee_auth
       SET password_hash = ?,
           last_password_reset_at = NOW(),
           login_failed_attempts = 0
       WHERE employee_id = ?`,
      [newHash, employee_id]
    );

    /* ---------------------------------
       5️⃣ OPTIONAL: INVALIDATE OTHER DEVICES
       (Keep current device logged in)
    --------------------------------- */
    await db.query(
      `UPDATE employee_devices
       SET is_active = 0
       WHERE employee_id = ?`,
      [employee_id]
    );

    /* ---------------------------------
       6️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "Your password has been updated successfully"
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Change password failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};


/* -----------------------------------------
   RESEND LOGIN OTP
----------------------------------------- */
export const resendEmployeeLoginOtp = async (req, res) => {
  try {
    const { employee_id, employee_code } = req.body;

    /* ---------------------------------
       1️⃣ INPUT VALIDATION
    --------------------------------- */
    if (!employee_id && !employee_code) {
      return res.status(400).json({
        success: false,
        message: "Employee Id or Employee Code is required"
      });
    }

    /* ---------------------------------
       2️⃣ FETCH EMPLOYEE + AUTH
       (Prefer employee_code during login)
    --------------------------------- */
    let rows;

    if (employee_code) {
      [rows] = await db.query(
        `SELECT e.id, e.email, ea.is_active
         FROM employees e
         JOIN employee_auth ea ON ea.employee_id = e.id
         WHERE e.employee_code = ?`,
        [employee_code]
      );
    } else {
      [rows] = await db.query(
        `SELECT e.id, e.email, ea.is_active
         FROM employees e
         JOIN employee_auth ea ON ea.employee_id = e.id
         WHERE e.id = ?`,
        [employee_id]
      );
    }

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const employee = rows[0];

    if (!employee.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive"
      });
    }

    if (!employee.email) {
      return res.status(400).json({
        success: false,
        message: "Email not registered"
      });
    }

    /* ---------------------------------
       3️⃣ RATE LIMIT (60 seconds)
    --------------------------------- */
    const [recentOtp] = await db.query(
      `SELECT created_at
       FROM employee_otps
       WHERE employee_id = ?
         AND purpose = 'LOGIN'
       ORDER BY created_at DESC
       LIMIT 1`,
      [employee.id]
    );

    if (recentOtp.length) {
      const lastOtpTime = new Date(recentOtp[0].created_at).getTime();
      if (Date.now() - lastOtpTime < 60 * 1000) {
        return res.status(429).json({
          success: false,
          message: "Please wait before requesting another OTP"
        });
      }
    }

    /* ---------------------------------
       4️⃣ INVALIDATE OLD LOGIN OTPs
    --------------------------------- */
    await db.query(
      `UPDATE employee_otps
       SET is_used = 1
       WHERE employee_id = ?
         AND purpose = 'LOGIN'
         AND is_used = 0`,
      [employee.id]
    );

    /* ---------------------------------
       5️⃣ GENERATE & STORE NEW OTP
    --------------------------------- */
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await db.query(
      `INSERT INTO employee_otps
       (employee_id, otp, purpose, is_used, expires_at, created_at)
       VALUES (?, ?, 'LOGIN', 0, ?, NOW())`,
      [employee.id, otp, expiresAt]
    );

    /* ---------------------------------
       6️⃣ SEND EMAIL
    --------------------------------- */
    await sendSystemEmail({
      to: employee.email,
      subject: "Your Login OTP (Resent)",
      body: `Your new OTP for login is: ${otp}. This OTP is valid for 5 minutes.`
    });

    /* ---------------------------------
       7️⃣ SUCCESS RESPONSE
    --------------------------------- */
    res.json({
      success: true,
      message: "OTP has been resent to your registered email",
      employee_id: employee.id
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Resend login OTP failed", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later."
    });
  }
};
