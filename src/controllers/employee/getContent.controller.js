import db from "../../models/db.js";
import logger from "../../utils/logger.js";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const MODULE_NAME = "GET_COMPANY_PAGES_CONTROLLER";

/* ---------------------------------
   Convert Content Based On Type
--------------------------------- */
const processContent = (content, type) => {
  try {
    // If JSON → return actual JSON object
    if (type === "JSON") {
      return JSON.parse(content);
    }

    // If MARKDOWN → convert to HTML
    if (type === "MARKDOWN") {
      const html = marked.parse(content);
      return sanitizeHtml(html);
    }

    // If HTML → sanitize and return
    if (type === "HTML") {
      return sanitizeHtml(content);
    }

    return content;

  } catch (err) {
    return content;
  }
};

export const getContent = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const companyId = req.user?.company_id; // optional if protected
    const { slug } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: ["Company ID missing in token"]
      });
    }

    /* ---------------------------------
       IF SLUG EXISTS → RETURN SINGLE PAGE
    --------------------------------- */
    if (slug) {
      const [rows] = await connection.query(
        `SELECT id, slug, content, content_type
         FROM company_pages
         WHERE company_id = ?
           AND slug = ?
           AND is_active = 1
         LIMIT 1`,
        [companyId, slug]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: ["Page not found"]
        });
      }

      const row = rows[0];

      return res.status(200).send(
        processContent(row.content, row.content_type)
      );
    }

    /* ---------------------------------
       IF NO SLUG → RETURN ALL PAGES
    --------------------------------- */
    const [rows] = await connection.query(
      `SELECT id, slug, content, content_type
       FROM company_pages
       WHERE company_id = ?
         AND is_active = 1
       ORDER BY id ASC`,
      [companyId]
    );

    const content_arr = rows.map(row => ({
      content_id: row.id,
      content_type: row.content_type === "JSON" ? 2 : 1,
      content: processContent(row.content, row.content_type),
      content_url: `${req.protocol}://${req.get("host")}/api/employee/get-content?slug=${row.slug}`,
      status: false
    }));

    return res.status(200).json({
      success: true,
      message: "Data Found Successfully",
      content_arr
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Failed to fetch company pages", error);

    return res.status(500).json({
      success: false,
      message: ["Server Error"]
    });
  } finally {
    connection.release();
  }
};


