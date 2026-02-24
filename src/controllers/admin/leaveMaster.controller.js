import db from "../../models/db.js";

/**
 * CREATE LEAVE TYPE
 */
export const createLeaveType = async (req, res) => {
  try {
    const {
      leave_code,
      leave_name,
      annual_quota,
      is_paid = 1,
      allow_carry_forward = 0,
      max_carry_forward = null,
      gender_restriction = "ALL",
      min_service_months = 0,
      max_continuous_days = null,
      half_day_allowed = 1,
      sandwich_rule = 0,
      document_required = 0
    } = req.body;

    const { company_id, role, id: user_id } = req.user;


    // Basic validation
    if (!leave_code || !leave_name || annual_quota === undefined) {
      return res.status(400).json({
        success: false,
        message: "leave_code, leave_name and annual_quota are required"
      });
    }

    if (max_carry_forward && max_carry_forward > annual_quota) {
      return res.status(400).json({
        success: false,
        message: "Max carry forward cannot exceed annual quota"
      });
    }

    // Check duplicate leave code per company
    const [existing] = await db.query(
      `SELECT id FROM leave_master WHERE company_id = ? AND leave_code = ?`,
      [company_id, leave_code]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Leave code already exists for this company"
      });
    }
    if (!user_id) {
        return res.status(401).json({
            success: false,
            message: "Invalid token: user id missing"
        });
        }


    await db.query(
      `
      INSERT INTO leave_master (
        company_id,
        leave_code,
        leave_name,
        annual_quota,
        is_paid,
        allow_carry_forward,
        max_carry_forward,
        gender_restriction,
        min_service_months,
        max_continuous_days,
        half_day_allowed,
        sandwich_rule,
        document_required,
        created_by_role,
        created_by_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        company_id,
        leave_code,
        leave_name,
        annual_quota,
        is_paid,
        allow_carry_forward,
        max_carry_forward,
        gender_restriction,
        min_service_months,
        max_continuous_days,
        half_day_allowed,
        sandwich_rule,
        document_required,
        role,
        user_id
      ]
    );

    return res.json({
      success: true,
      message: "Leave type created successfully"
    });

  } catch (error) {
    console.error("createLeaveType error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong try again later"
    });
  }
};

/**
 * LIST LEAVE TYPES
 */
export const getLeaveTypes = async (req, res) => {
  try {
    const user = req.user;

    // 🔒 HARD GUARD (non-negotiable)
    if (!user || !user.company_id) {
      return res.status(401).json({
        success: false,
        message: "Company context missing in token"
      });
    }

    const company_id = user.company_id;

    const [rows] = await db.query(
      `
      SELECT
        id,
        leave_code,
        leave_name,
        annual_quota,
        is_paid,
        allow_carry_forward,
        max_carry_forward,
        gender_restriction,
        min_service_months,
        max_continuous_days,
        half_day_allowed,
        sandwich_rule,
        document_required,
        is_active,
        created_at
      FROM leave_master
      WHERE company_id = ?
      ORDER BY created_at DESC
      `,
      [company_id]
    );

    return res.status(200).json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error("getLeaveTypes error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch leave types"
    });
  }
};



/**
 * UPDATE LEAVE TYPE
 */
export const updateLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const {
      leave_name,
      annual_quota,
      is_paid = 1,
      allow_carry_forward = 0,
      max_carry_forward = null,
      min_service_months = 0,
      max_continuous_days = null,
      half_day_allowed = 1,
      sandwich_rule = 0,
      document_required = 0
    } = req.body;

    const [result] = await db.query(
      `
      UPDATE leave_master
      SET
        leave_name = ?,
        annual_quota = ?,
        is_paid = ?,
        allow_carry_forward = ?,
        max_carry_forward = ?,
        min_service_months = ?,
        max_continuous_days = ?,
        half_day_allowed = ?,
        sandwich_rule = ?,
        document_required = ?
      WHERE id = ?
      AND company_id = ?
      `,
      [
        leave_name,
        annual_quota,
        is_paid,
        allow_carry_forward,
        max_carry_forward,
        min_service_months,
        max_continuous_days,
        half_day_allowed,
        sandwich_rule,
        document_required,
        id,
        company_id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found"
      });
    }

    return res.json({
      success: true,
      message: "Leave type updated successfully"
    });

  } catch (error) {
    console.error("updateLeaveType error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};



/**
 * ENABLE / DISABLE LEAVE TYPE
 */
export const toggleLeaveTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    const { company_id } = req.user;

    if (![0, 1].includes(is_active)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value"
      });
    }

    const [result] = await db.query(
      `
      UPDATE leave_master
      SET is_active = ?
      WHERE id = ?
      AND company_id = ?
      `,
      [is_active, id, company_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found"
      });
    }

    return res.json({
      success: true,
      message: "Leave type status updated"
    });

  } catch (error) {
    console.error("toggleLeaveTypeStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


/**
 * DELETE LEAVE TYPE
 */
export const deleteLeaveType = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    // Check existence
    const [rows] = await db.query(
      `SELECT id FROM leave_master WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Leave type not found"
      });
    }

    await db.query(
      `DELETE FROM leave_master WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    return res.json({
      success: true,
      message: "Leave type deleted successfully"
    });

  } catch (error) {
    console.error("deleteLeaveType error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

