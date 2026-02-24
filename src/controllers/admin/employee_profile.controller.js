import db from "../../models/db.js";
import { TABLES } from "../../utils/tableNames.js";
import { uploadToS3, generateEmployeeS3Key } from "../../utils/s3Upload.util.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_PROFILE_CONTROLLER";

export const upsert_employee_profile = async (req, res) => {
  try {
    const {
      employee_id,
      gender,
      dob,
      religion,
      father_name,
      marital_status,
      qualification,
      emergency_contact,
      address,
      permanent_address,
      bank_name,
      account_number,
      ifsc_code,
      bank_branch_name
    } = req.body;

    // Handle profile photo upload to S3 if provided
    let profile_photo_path = null;
    if (req.file) {
      // Resolve employee context for path building
      // 🔒 SECURITY: Verify company ownership
      const [[empRow]] = await db.query(
        `SELECT company_id, branch_id, employee_code FROM ${TABLES.EMPLOYEES} WHERE id = ? AND company_id = ?`,
        [employee_id, req.user.company_id]
      );

      if (!empRow) {
        return res.status(403).json({ message: "Employee not found or access denied" });
      }

      const fullKey = generateEmployeeS3Key(
        {
          companyId: empRow.company_id,
          branchId: empRow.branch_id,
          employeeCode: empRow.employee_code
        },
        {
          fieldname: "profile_photo",
          originalname: req.file.originalname
        }
      );

      const uploadResult = await uploadToS3(
        req.file.buffer,
        fullKey,
        req.file.mimetype
      );
      profile_photo_path = uploadResult.key;
    }

    await db.query(
      `
      INSERT INTO ${TABLES.EMPLOYEE_PROFILES}
      (employee_id, gender, dob, religion, father_name, marital_status,
       qualification, emergency_contact, address, permanent_address,
       bank_name, account_number, ifsc_code, bank_branch_name, profile_photo_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
       gender = VALUES(gender),
       dob = VALUES(dob),
       religion = VALUES(religion),
       father_name = VALUES(father_name),
       marital_status = VALUES(marital_status),
       qualification = VALUES(qualification),
       emergency_contact = VALUES(emergency_contact),
       address = VALUES(address),
       permanent_address = VALUES(permanent_address),
       bank_name = VALUES(bank_name),
       account_number = VALUES(account_number),
       ifsc_code = VALUES(ifsc_code),
       bank_branch_name = VALUES(bank_branch_name)
       ${profile_photo_path ? ', profile_photo_path = VALUES(profile_photo_path)' : ''}
      `,
      [
        employee_id,
        gender || null,
        dob || null,
        religion || null,
        father_name || null,
        marital_status || null,
        qualification || null,
        emergency_contact || null,
        address || null,
        permanent_address || null,
        bank_name || null,
        account_number || null,
        ifsc_code || null,
        bank_branch_name || null,
        profile_photo_path
      ]
    );

    res.json({
      message: "Profile saved successfully",
      profile_photo_url: profile_photo_path
    });
  } catch (err) {
    logger.error(MODULE_NAME, "Failed to upsert employee profile", err);
    res.status(500).json({ message: "Failed to save profile" });
  }
};
