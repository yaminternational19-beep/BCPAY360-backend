import db from "../../models/db.js";

/**
 * Create company government form (metadata only)
 * No file upload - forms are DB-driven configuration entities
 */
export const createGovernmentForm = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const {
      form_code,
      form_name,
      period_type,
      category,
      is_employee_specific = false,
      description = "",
      version = "1.0"
    } = req.body;

    // Validate required fields
    if (!form_code || !form_name || !period_type) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: form_code, form_name, period_type"
      });
    }

    // Validate period_type
    const validPeriodTypes = ["FY", "MONTH", "ONE_TIME"];
    if (!validPeriodTypes.includes(period_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period_type. Must be FY, MONTH, or ONE_TIME"
      });
    }

    const formCode = form_code.trim().toUpperCase();

    // Check for duplicate form_code + version per company
    const [[exists]] = await db.query(
      `
      SELECT 1
      FROM company_government_forms
      WHERE company_id = ?
        AND form_code = ?
        AND version = ?
      LIMIT 1
      `,
      [companyId, formCode, version]
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Form version already exists for this company"
      });
    }

    // Insert form metadata
    const [result] = await db.query(
      `
      INSERT INTO company_government_forms (
        company_id,
        form_code,
        form_name,
        period_type,
        category,
        is_employee_specific,
        description,
        version,
        status,
        uploaded_by_role,
        uploaded_by_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
      `,
      [
        companyId,
        formCode,
        form_name.trim(),
        period_type,
        category || null,
        is_employee_specific ? 1 : 0,
        description,
        version,
        req.user.role,
        req.user.id
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Government form created successfully",
      data: {
        id: result.insertId,
        formCode
      }
    });

  } catch (err) {
    console.error("❌ Create Government Form Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create government form"
    });
  }
};

/**
 * Get available government forms
 * Returns forms grouped by category, filtered by status
 */
export const getGovernmentForms = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { groupByCategory } = req.query;

    // Get all active forms (latest version only)
    const [rows] = await db.query(
      `
      SELECT
        f.id,
        f.form_code,
        f.form_name,
        f.period_type,
        f.category,
        f.is_employee_specific,
        f.description,
        f.version,
        f.status,
        f.created_at,
        f.updated_at
      FROM company_government_forms f
      INNER JOIN (
        SELECT form_code, MAX(version) AS max_version
        FROM company_government_forms
        WHERE company_id = ? AND status = 'ACTIVE'
        GROUP BY form_code
      ) latest
        ON f.form_code = latest.form_code
       AND f.version = latest.max_version
      WHERE f.company_id = ? AND f.status = 'ACTIVE'
      ORDER BY f.category, f.form_name
      `,
      [companyId, companyId]
    );

    // Transform to camelCase response
    const forms = rows.map(row => ({
      id: row.id,
      formCode: row.form_code,
      formName: row.form_name,
      periodType: row.period_type,
      category: row.category,
      isEmployeeSpecific: Boolean(row.is_employee_specific),
      description: row.description,
      version: row.version,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    // Group by category if requested
    if (groupByCategory === "true") {
      const grouped = forms.reduce((acc, form) => {
        const cat = form.category || "UNCATEGORIZED";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(form);
        return acc;
      }, {});

      return res.json({
        success: true,
        data: grouped
      });
    }

    return res.json({
      success: true,
      data: forms
    });

  } catch (err) {
    console.error("❌ GET GOVERNMENT FORMS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch forms"
    });
  }
};

/**
 * Get form definition by form_code
 * Returns metadata for a specific form
 */
export const getFormDefinition = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { formCode } = req.params;

    if (!formCode) {
      return res.status(400).json({
        success: false,
        message: "Form code is required"
      });
    }

    // Get latest active version of the form
    const [[form]] = await db.query(
      `
      SELECT
        id,
        form_code,
        form_name,
        period_type,
        category,
        is_employee_specific,
        description,
        version,
        status,
        uploaded_by_role,
        uploaded_by_id,
        created_at,
        updated_at
      FROM company_government_forms
      WHERE company_id = ?
        AND form_code = ?
        AND status = 'ACTIVE'
      ORDER BY version DESC, created_at DESC
      LIMIT 1
      `,
      [companyId, formCode.toUpperCase()]
    );

    if (!form) {
      return res.status(404).json({
        success: false,
        message: "Form not found or inactive"
      });
    }

    return res.json({
      success: true,
      data: {
        id: form.id,
        formCode: form.form_code,
        formName: form.form_name,
        periodType: form.period_type,
        category: form.category,
        isEmployeeSpecific: Boolean(form.is_employee_specific),
        description: form.description,
        version: form.version,
        status: form.status,
        audit: {
          uploadedByRole: form.uploaded_by_role,
          uploadedById: form.uploaded_by_id,
          createdAt: form.created_at,
          updatedAt: form.updated_at
        }
      }
    });

  } catch (err) {
    console.error("❌ GET FORM DEFINITION ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch form definition"
    });
  }
};

/**
 * Update government form metadata or toggle status
 */
export const updateGovernmentForm = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { id } = req.params;

    // Toggle status
    if (req.body.action === "TOGGLE_STATUS") {
      const [result] = await db.query(
        `
        UPDATE company_government_forms
        SET status = IF(status='ACTIVE','INACTIVE','ACTIVE'),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND company_id = ?
        `,
        [id, companyId]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          success: false,
          message: "Form not found"
        });
      }

      return res.json({
        success: true,
        message: "Status updated successfully"
      });
    }

    // Update metadata fields
    const { form_name, description, period_type, category } = req.body;
    const updates = [];
    const values = [];

    if (form_name) {
      updates.push("form_name = ?");
      values.push(form_name.trim());
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (period_type) {
      const validPeriodTypes = ["FY", "MONTH", "ONE_TIME"];
      if (!validPeriodTypes.includes(period_type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid period_type"
        });
      }
      updates.push("period_type = ?");
      values.push(period_type);
    }
    if (category !== undefined) {
      updates.push("category = ?");
      values.push(category);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid update fields provided"
      });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id, companyId);

    const [result] = await db.query(
      `
      UPDATE company_government_forms
      SET ${updates.join(", ")}
      WHERE id = ? AND company_id = ?
      `,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Form not found"
      });
    }

    return res.json({
      success: true,
      message: "Form updated successfully"
    });

  } catch (err) {
    console.error("❌ UPDATE GOVERNMENT FORM ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update form"
    });
  }
};

/**
 * Delete government form
 */
export const deleteGovernmentForm = async (req, res) => {
  try {
    const [result] = await db.query(
      `
      DELETE FROM company_government_forms
      WHERE id = ? AND company_id = ?
      `,
      [req.params.id, req.user.company_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Form not found"
      });
    }

    return res.json({
      success: true,
      message: "Form deleted successfully"
    });

  } catch (err) {
    console.error("❌ DELETE GOVERNMENT FORM ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete form"
    });
  }
};
