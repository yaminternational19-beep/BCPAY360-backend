import db from "../../models/db.js";
import { getS3SignedUrl } from "../../utils/s3Upload.util.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "EMPLOYEE_PROFILE_FETCH_CONTROLLER";

/* ---------------------------------
   CONSTANTS
--------------------------------- */
const SIGNED_URL_TTL = 300; // 5 minutes
const INLINE = { disposition: "inline" };

/* ---------------------------------
   HELPERS
--------------------------------- */
const secondsToHMS = (seconds = 0) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const timeToSeconds = (t) => {
  if (!t) return 0;
  const [h, m, s = 0] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

/**
 * IMPORTANT:
 * Handles both cases:
 * 1) S3 KEY → employees/17/documents/file.png
 * 2) FULL URL → https://bucket/.../employees/17/documents/file.png
 */
const extractS3Key = (value) => {
  if (!value) return null;

  if (value.startsWith("http")) {
    const url = new URL(value);
    return url.pathname.replace(/^\/+/, "");
  }

  return value;
};

/* ---------------------------------
   CONTROLLER
--------------------------------- */
export const getEmployeeProfile = async (req, res) => {
  try {
    const employeeId = req.user.id;

    /* ---------------------------------
       1️⃣ EMPLOYEE CORE
    --------------------------------- */
    const [[employee]] = await db.query(
      `
      SELECT
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
        d.department_name,
        b.branch_name,
        g.designation_name,
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
      JOIN companies c ON c.id = e.company_id
      JOIN departments d ON d.id = e.department_id
      JOIN branches b ON b.id = e.branch_id
      JOIN designations g ON g.id = e.designation_id
      LEFT JOIN employee_profiles ep ON ep.employee_id = e.id
      WHERE e.id = ?
      `,
      [employeeId]
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    /* ---------------------------------
       2️⃣ PROFILE PHOTO (VIEWABLE)
    --------------------------------- */
    const profilePhotoKey = extractS3Key(employee.profile_photo_path);
    const profile_photo_url = profilePhotoKey
      ? await getS3SignedUrl(profilePhotoKey, SIGNED_URL_TTL, INLINE)
      : null;

    /* ---------------------------------
       3️⃣ PERSONAL DOCUMENTS (VIEW + DOWNLOAD)
    --------------------------------- */
    const [documentRows] = await db.query(
      `
      SELECT
        id,
        document_type,
        document_number,
        file_path,
        created_at
      FROM employee_documents
      WHERE employee_id = ?
      `,
      [employeeId]
    );

    const personal_documents = await Promise.all(
      (documentRows || []).map(async (doc) => {
        const s3Key = extractS3Key(doc.file_path);

        return {
          id: doc.id,
          document_type: doc.document_type,
          document_number: doc.document_number,
          created_at: doc.created_at,
          view_url: s3Key
            ? await getS3SignedUrl(s3Key, SIGNED_URL_TTL, INLINE)
            : null,
          download_url: s3Key
            ? await getS3SignedUrl(s3Key, SIGNED_URL_TTL, {
              disposition: `attachment; filename="${doc.document_type}.pdf"`
            })
            : null
        };
      })
    );

    /* ---------------------------------
       4️⃣ FORM DOCUMENTS (ADMIN-STYLE)
    --------------------------------- */
    const [formRows] = await db.query(
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
      FROM employee_form_documents
      WHERE employee_id = ?
      ORDER BY created_at DESC
      `,
      [employeeId]
    );

    const form_documents = await Promise.all(
      (formRows || []).map(async (doc) => {
        const s3Key = extractS3Key(doc.storage_object_key);

        let periodLabel = "NA";
        if (doc.period_type === "FY" && doc.financial_year) {
          periodLabel = doc.financial_year;
        }
        if (doc.period_type === "MONTH" && doc.doc_year && doc.doc_month) {
          periodLabel = `${doc.doc_year}-${String(doc.doc_month).padStart(2, "0")}`;
        }

        return {
          form_code: doc.form_code,
          period_type: doc.period_type,
          financial_year: doc.financial_year,
          doc_year: doc.doc_year,
          doc_month: doc.doc_month,
          uploaded_by_role: doc.uploaded_by_role,
          uploaded_at: doc.created_at,
          view_url: s3Key
            ? await getS3SignedUrl(s3Key, SIGNED_URL_TTL, INLINE)
            : null,
          download_url: s3Key
            ? await getS3SignedUrl(s3Key, SIGNED_URL_TTL, {
              disposition: `attachment; filename="${doc.form_code}_${periodLabel}.pdf"`
            })
            : null
        };
      })
    );

    /* ---------------------------------
       5️⃣ TODAY ATTENDANCE (UNCHANGED)
    --------------------------------- */
    const [[attendance]] = await db.query(
      `
      SELECT
        attendance_date,
        check_in_time,
        check_out_time,
        shift_start,
        shift_end,
        status,
        is_checked_in_session
      FROM attendance
      WHERE employee_id = ?
        AND attendance_date = CURDATE()
      LIMIT 1
      `,
      [employeeId]
    );

    let todayStatus = "NOT_MARKED";

    if (attendance) {
      if (attendance.status === "ABSENT") todayStatus = "ABSENT";
      else if (attendance.check_in_time && !attendance.check_out_time)
        todayStatus = "CHECKED_IN";
      else if (attendance.check_in_time && attendance.check_out_time)
        todayStatus = "CHECKED_OUT";
      else todayStatus = attendance.status;
    }

    /* ---------------------------------
       6️⃣ WORK METRICS (UNCHANGED)
    --------------------------------- */
    let workMetrics = null;

    if (attendance?.check_in_time && attendance.shift_start && attendance.shift_end) {
      const checkInSec = timeToSeconds(attendance.check_in_time);
      const checkOutSec = attendance.check_out_time
        ? timeToSeconds(attendance.check_out_time)
        : timeToSeconds(new Date().toLocaleTimeString("en-GB"));

      const shiftStartSec = timeToSeconds(attendance.shift_start);
      const shiftEndSec = timeToSeconds(attendance.shift_end);

      workMetrics = {
        shift_duration: secondsToHMS(shiftEndSec - shiftStartSec),
        worked_duration: secondsToHMS(checkOutSec - checkInSec),
        late_login_minutes: Math.max(0, Math.floor((checkInSec - shiftStartSec) / 60)),
        early_logout_minutes: attendance.check_out_time
          ? Math.max(0, Math.floor((shiftEndSec - checkOutSec) / 60))
          : 0,
        total_working_time: secondsToHMS(checkOutSec - checkInSec)
      };
    }

    /* ---------------------------------
       7️⃣ LEAVE SUMMARY (UNCHANGED)
    --------------------------------- */
    const [leaveRows] = await db.query(
      `
      SELECT
        lm.leave_name,
        lm.annual_quota,
        IFNULL(SUM(lr.total_days), 0) AS used_days
      FROM leave_master lm
      LEFT JOIN employee_leave_requests lr
        ON lr.leave_master_id = lm.id
        AND lr.employee_id = ?
        AND lr.status = 'APPROVED'
        AND YEAR(lr.from_date) = YEAR(CURDATE())
      WHERE lm.is_active = 1
      GROUP BY lm.id
      `,
      [employeeId]
    );

    const leave_summary = leaveRows.map(l => ({
      leave_type: l.leave_name,
      total: Number(l.annual_quota),
      used: Number(l.used_days),
      remaining: Math.max(l.annual_quota - l.used_days, 0)
    }));

    /* ---------------------------------
       8️⃣ FINAL RESPONSE
    --------------------------------- */
    res.json({
      success: true,
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
        profile_photo_url,
        personal_documents,
        form_documents
      },
      attendance_status: {
        today_status: todayStatus,
        raw_status: attendance?.status || "NOT_MARKED",
        check_in_time: attendance?.check_in_time || null,
        check_out_time: attendance?.check_out_time || null,
        is_checked_in_session: !!attendance?.is_checked_in_session
      },
      work_metrics: workMetrics,
      leave_summary
    });

  } catch (err) {
    logger.error(MODULE_NAME, "Failed to fetch employee profile", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
