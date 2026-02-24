import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "SUPPORT_CONTROLLER";

/* =========================================================
   CREATE SUPPORT TICKET (EMPLOYEE)
========================================================= */
export const createSupportTicket = async (req, res) => {
  try {
    // 🔐 Token uses `id`, not `employee_id`
    const employee_id = req.user.id;

    const {
      full_name,
      email,
      category,
      reason
    } = req.body;

    // Basic validation
    if (!full_name || !email || !category || !reason) {
      return res.status(422).json({
        success: false,
        message: "All fields are required"
      });
    }

    /* =====================================================
       FETCH COMPANY & BRANCH (AUTO)
    ===================================================== */
    const [[employee]] = await db.query(
      `SELECT company_id, branch_id
       FROM employees
       WHERE id = ?`,
      [employee_id]
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const { company_id, branch_id } = employee;

    /* =====================================================
       🔒 CHECK OPEN REQUEST FOR SAME CATEGORY
    ===================================================== */
    const [[existingTicket]] = await db.query(
      `SELECT id
       FROM company_support_tickets
       WHERE employee_id = ?
         AND category = ?
         AND status = 'OPEN'
       LIMIT 1`,
      [employee_id, category]
    );

    if (existingTicket) {
      return res.status(409).json({
        success: false,
        message:
          "Your request for this issue is already under review. Please wait for a response."
      });
    }

    /* =====================================================
       CREATE SUPPORT TICKET
    ===================================================== */
    await db.query(
      `INSERT INTO company_support_tickets
       (
         company_id,
         branch_id,
         employee_id,
         employee_name,
         employee_email,
         category,
         reason,
         status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [
        company_id,
        branch_id,
        employee_id,
        full_name,
        email,
        category,
        reason
      ]
    );

    res.status(201).json({
      success: true,
      message:
        "Your support request has been submitted successfully. Our team will respond shortly."
    });
  } catch (error) {
    logger.error(MODULE_NAME, "Failed to submit support request", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit support request"
    });
  }
};


/* =========================================================
   GET EMPLOYEE'S OWN SUPPORT TICKETS
========================================================= */
export const getMySupportTickets = async (req, res) => {
  try {
    // 🔐 token uses `id`
    const employee_id = req.user.id;

    const [tickets] = await db.query(
      `SELECT
         id,
         category,
         reason,
         response,
         status,
         created_at,
         responded_at
       FROM company_support_tickets
       WHERE employee_id = ?
       ORDER BY created_at DESC`,
      [employee_id]
    );

    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    logger.error(MODULE_NAME, "Failed to fetch support requests", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch support requests"
    });
  }
};



export const getContactInformation = async (req, res) => {
  try {
    const employee_id = req.user.id;

    const [[employee]] = await db.query(
      `SELECT e.branch_id, b.branch_name, e.company_id
       FROM employees e
       JOIN branches b ON b.id = e.branch_id
       WHERE e.id = ?`,
      [employee_id]
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const { branch_id, branch_name, company_id } = employee;

    // 🔴 FIXED SLUG HERE
    const [[page]] = await db.query(
      `SELECT content
       FROM company_pages
       WHERE company_id = ?
         AND slug = 'contact'
         AND is_active = 1`,
      [company_id]
    );

    if (!page || !page.content) {
      return res.json({
        success: true,
        contacts: { hr: [], admin: [] }
      });
    }

    const content = JSON.parse(page.content);

    const hrContacts = (content.hr || [])
      .filter(c => Number(c.branch_id) === branch_id)
      .map(c => ({
        name: c.name,
        branch_id: branch_id,
        branch_name,
        email: c.email,
        phone: c.phone
      }));

    const adminContacts = (content.admin || []).map(c => ({
      name: c.name,
      email: c.email,
      phone: c.phone
    }));

    res.json({
      success: true,
      contacts: {
        hr: hrContacts,
        admin: adminContacts
      }
    });
  } catch (error) {
    logger.error(MODULE_NAME, "Failed to fetch contact information", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch contact information"
    });
  }
};

