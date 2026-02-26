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
    if (type === "JSON") {
      return JSON.parse(content);
    }

    if (type === "MARKDOWN") {
      const html = marked.parse(content);
      return sanitizeHtml(html);
    }

    if (type === "HTML") {
      return sanitizeHtml(content);
    }

    // 🔥 For Plain Text → Convert line breaks to HTML
    return content
      .split("\n\n")
      .map(p => `<p>${p}</p>`)
      .join("");

  } catch (err) {
    return content;
  }
};

/* ---------------------------------
   GET CONTENT (PUBLIC)
--------------------------------- */

export const getPublicContentAll = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { company_id, slug } = req.query;

    if (!company_id) {
      return res.status(400).json({
        success: false,
        message: ["company_id is required"]
      });
    }

    /* ---------------------------------
       SINGLE PAGE
    --------------------------------- */
    if (slug) {
      const [rows] = await connection.query(
        `SELECT content, content_type
         FROM company_pages
         WHERE company_id = ?
         AND slug = ?
         AND is_active = 1
         LIMIT 1`,
        [company_id, slug]
      );

      if (!rows.length) {
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
       ALL PAGES (Same as getContent)
    --------------------------------- */
    const [rows] = await connection.query(
      `SELECT id, slug, content, content_type
       FROM company_pages
       WHERE company_id = ?
       AND is_active = 1
       ORDER BY id ASC`,
      [company_id]
    );

    const content_arr = rows.map(row => ({
      content_id: row.id,
      content_type: row.content_type === "JSON" ? 2 : 1,
      content: processContent(row.content, row.content_type),
      content_url: `${req.protocol}://${req.get("host")}/api/public/content?company_id=${company_id}&slug=${row.slug}`,
      status: false
    }));

    return res.status(200).json({
      success: true,
      message: "Data Found Successfully",
      content_arr
    });

  } catch (error) {
    logger.error(MODULE_NAME, "Public content fetch failed", error);

    return res.status(500).json({
      success: false,
      message: ["Server Error"]
    });
  } finally {
    connection.release();
  }
};