import db from "../../models/db.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_PAGES = [
  { slug: "about-us", title: "About Us" },
  { slug: "terms-conditions", title: "Terms & Conditions" },
  { slug: "privacy-policy", title: "Privacy Policy" },
  { slug: "contact", title: "Contact Information" }
];

/* =========================================================
   HELPER: ENSURE DEFAULT PAGES EXIST (AUTO SEED)
========================================================= */
const ensureDefaultPages = async (company_id, user_id) => {
  for (const page of DEFAULT_PAGES) {
    const [[exists]] = await db.query(
      `SELECT id FROM company_pages WHERE company_id = ? AND slug = ?`,
      [company_id, page.slug]
    );

    if (!exists) {
      await db.query(
        `INSERT INTO company_pages
         (company_id, slug, title, content, content_type, is_active, is_system, created_by)
         VALUES (?, ?, ?, ?, 'MARKDOWN', 1, 1, ?)`,
        [
          company_id,
          page.slug,
          page.title,
          `## ${page.title}\n\nEdit this content.`,
          user_id
        ]
      );
    }
  }
};

/* =========================================================
   GET ALL PAGES (MANAGE CONTENT - CARDS)
========================================================= */
export const getAllPages = async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;

    // Ensure default pages exist
    await ensureDefaultPages(company_id, user_id);

    const [pages] = await db.query(
      `SELECT 
         id,
         slug,
         title,
         is_system,
         updated_at
       FROM company_pages
       WHERE company_id = ? AND is_active = 1
       ORDER BY is_system DESC, created_at ASC`,
      [company_id]
    );

    res.json({
      success: true,
      data: pages
    });
  } catch (error) {
    console.error("getAllPages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pages"
    });
  }
};

/* =========================================================
   GET SINGLE PAGE (EDIT PAGE)
========================================================= */
export const getPageBySlug = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { slug } = req.params;

    const [[page]] = await db.query(
      `SELECT 
         id,
         slug,
         title,
         content,
         content_type,
         is_system
       FROM company_pages
       WHERE company_id = ? AND slug = ? AND is_active = 1`,
      [company_id, slug]
    );

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found"
      });
    }

    res.json({
      success: true,
      data: page
    });
  } catch (error) {
    console.error("getPageBySlug error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch page"
    });
  }
};

/* =========================================================
   CREATE CUSTOM PAGE (ADD NEW PAGE)
========================================================= */
export const createPage = async (req, res) => {
  try {
    const { company_id, id: user_id } = req.user;
    const { title } = req.body;

    if (!title || !title.trim()) {
      return res.status(422).json({
        success: false,
        message: "Page title is required"
      });
    }

    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const [[exists]] = await db.query(
      `SELECT id FROM company_pages WHERE company_id = ? AND slug = ?`,
      [company_id, slug]
    );

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Page with same name already exists"
      });
    }

    await db.query(
      `INSERT INTO company_pages
       (company_id, slug, title, content, content_type, is_system, is_active, created_by)
       VALUES (?, ?, ?, ?, 'MARKDOWN', 0, 1, ?)`,
      [
        company_id,
        slug,
        title,
        `## ${title}\n\nStart writing your content here.`,
        user_id
      ]
    );

    res.status(201).json({
      success: true,
      message: "Page created successfully",
      slug
    });
  } catch (error) {
    console.error("createPage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create page"
    });
  }
};

/* =========================================================
   UPDATE PAGE CONTENT
========================================================= */
export const updatePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, content_type = "MARKDOWN" } = req.body;
    const { company_id, id: user_id } = req.user;

    const [[page]] = await db.query(
      `SELECT is_system FROM company_pages WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found"
      });
    }

    await db.query(
      `UPDATE company_pages
       SET title = ?, content = ?, content_type = ?, updated_by = ?
       WHERE id = ?`,
      [title, content, content_type, user_id, id]
    );

    res.json({
      success: true,
      message: "Page updated successfully"
    });
  } catch (error) {
    console.error("updatePage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update page"
    });
  }
};

export const deletePage = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const [[page]] = await db.query(
      `SELECT is_system FROM company_pages
       WHERE id = ? AND company_id = ? AND is_active = 1`,
      [id, company_id]
    );

    if (!page) {
      return res.status(404).json({
        success: false,
        message: "Page not found"
      });
    }

    if (page.is_system) {
      return res.status(403).json({
        success: false,
        message: "System pages cannot be deleted"
      });
    }

    await db.query(
      `UPDATE company_pages
       SET is_active = 0
       WHERE id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: "Page deleted successfully"
    });
  } catch (error) {
    console.error("deletePage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete page"
    });
  }
};
