import db from "../../models/db.js";

/**
 * CREATE FAQ
 * POST /api/admin/company-faq
 */
export const createCompanyFaq = async (req, res) => {


  const { question, answer } = req.body;
  const company_id = req.user?.company_id || req.user?.user?.company_id;

  if (!company_id) {
    return res.status(401).json({
      message: "Unauthorized: company not found in token"
    });
  }

  if (!question || !answer) {
    return res.status(422).json({
      message: "question and answer are required"
    });
  }

  await db.query(
    `INSERT INTO company_faqs (company_id, question, answer)
     VALUES (?, ?, ?)`,
    [company_id, question, answer]
  );

  res.status(201).json({ message: "FAQ created successfully" });
};


/**
 * GET ALL FAQ (company-wise)
 * GET /api/admin/company-faq?company_id=1
 */
export const getCompanyFaqs = async (req, res) => {
  const company_id = req.user.company_id;

  if (!company_id) {
    return res.status(401).json({
      message: "Unauthorized: company not found in token"
    });
  }

  const [rows] = await db.query(
    `SELECT id, question, answer
     FROM company_faqs
     WHERE company_id = ? AND is_active = 1
     ORDER BY id DESC`,
    [company_id]
  );

  res.json(rows);
};


/**
 * UPDATE FAQ
 * PUT /api/admin/company-faq/:id
 */
export const updateCompanyFaq = async (req, res) => {
  const { id } = req.params;
  const { question, answer } = req.body;
  const company_id = req.user.company_id;

  if (!question || !answer) {
    return res.status(422).json({
      message: "question and answer are required"
    });
  }

  const [result] = await db.query(
    `UPDATE company_faqs
     SET question = ?, answer = ?
     WHERE id = ? AND company_id = ?`,
    [question, answer, id, company_id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({
      message: "FAQ not found or access denied"
    });
  }

  res.json({ message: "FAQ updated successfully" });
};

/**
 * DELETE FAQ
 * DELETE /api/admin/company-faq/:id
 */
export const deleteCompanyFaq = async (req, res) => {
  const { id } = req.params;

  const [result] = await db.query(
    `DELETE FROM company_faqs WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    return res.status(404).json({ message: "FAQ not found" });
  }

  res.json({ message: "FAQ deleted successfully" });
};
