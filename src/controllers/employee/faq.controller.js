import db from "../../models/db.js";
import logger from "../../utils/logger.js";

const MODULE_NAME = "GET_FAQ_CONTROLLER";

export const getFaqs = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const employeeId = req.user.id;

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    // Get company_id
    const [[employee]] = await connection.query(
      `SELECT company_id 
       FROM employees 
       WHERE id = ?`,
      [employeeId]
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found"
      });
    }

    const companyId = employee.company_id;

    // Fetch FAQs (removed created_at completely)
    const [faqs] = await connection.query(
      `SELECT 
          id,
          question,
          answer
       FROM company_faqs
       WHERE company_id = ?
         AND is_active = 1
       ORDER BY id ASC`,
      [companyId]
    );

    return res.status(200).json({
      success: true,
      message: "FAQ fetched successfully",
      total: faqs.length,
      faq_arr: faqs.map(faq => ({
        faq_id: faq.id,
        question: faq.question,
        answer: faq.answer
      }))
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to fetch FAQs", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch FAQs"
    });
  } finally {
    connection.release();
  }
};