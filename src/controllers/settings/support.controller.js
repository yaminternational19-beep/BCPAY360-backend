import db from "../../models/db.js";
import { sendNotification } from "../../utils/oneSignal.js";
/* =========================================================
   GET ALL SUPPORT TICKETS (COMPANY ADMIN / HR)
   Filters: branch_id, status, search
========================================================= */
export const getAllSupportTickets = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { branch_id, status, search } = req.query;

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    let conditions = [`company_id = ?`];
    let params = [company_id];

    if (branch_id) {
      conditions.push(`branch_id = ?`);
      params.push(branch_id);
    }

    if (status) {
      conditions.push(`status = ?`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(employee_name LIKE ? OR employee_email LIKE ? OR category LIKE ?)`
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.join(" AND ");

    // 1️⃣ Get total count
    const [[countResult]] = await db.query(
      `SELECT COUNT(*) as total
       FROM company_support_tickets
       WHERE ${whereClause}`,
      params
    );

    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    // 2️⃣ Get paginated data
    const [tickets] = await db.query(
      `SELECT
         id,
         employee_name,
         employee_email,
         branch_id,
         category,
         status,
         created_at
       FROM company_support_tickets
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: tickets,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit
      }
    });

  } catch (error) {
    console.error("getAllSupportTickets error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch support tickets"
    });
  }
};

/* =========================================================
   GET SINGLE SUPPORT TICKET (DETAIL VIEW)
========================================================= */
export const getSupportTicketById = async (req, res) => {
  try {
    const { company_id } = req.user;
    const { id } = req.params;

    const [[ticket]] = await db.query(
      `SELECT *
       FROM company_support_tickets
       WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found"
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error("getSupportTicketById error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch support ticket"
    });
  }
};

/* =========================================================
   RESPOND TO SUPPORT TICKET (AUTO CLOSE)
========================================================= */
// export const respondToSupportTicket = async (req, res) => {
//   try {
//     const { company_id, role, id: responder_id } = req.user;
//     const { id } = req.params;
//     const { response } = req.body;

//     if (!response || !response.trim()) {
//       return res.status(422).json({
//         success: false,
//         message: "Response is required"
//       });
//     }

//     const [[ticket]] = await db.query(
//       `SELECT status
//        FROM company_support_tickets
//        WHERE id = ? AND company_id = ?`,
//       [id, company_id]
//     );

//     if (!ticket) {
//       return res.status(404).json({
//         success: false,
//         message: "Support ticket not found"
//       });
//     }

//     if (ticket.status === "CLOSED") {
//       return res.status(409).json({
//         success: false,
//         message: "Ticket is already closed"
//       });
//     }

//     await db.query(
//       `UPDATE company_support_tickets
//        SET
//          response = ?,
//          responded_by_role = ?,
//          responded_by_id = ?,
//          responded_at = NOW(),
//          status = 'CLOSED'
//        WHERE id = ?`,
//       [response, role, responder_id, id]
//     );

//     res.json({
//       success: true,
//       message: "Response sent and ticket closed"
//     });
//   } catch (error) {
//     console.error("respondToSupportTicket error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to respond to support ticket"
//     });
//   }
// };


export const respondToSupportTicket = async (req, res) => {
  try {
    const { company_id, role, id: responder_id } = req.user;
    const { id } = req.params;
    const { response } = req.body;

    if (!response || !response.trim()) {
      return res.status(422).json({
        success: false,
        message: "Response is required"
      });
    }

    const [[ticket]] = await db.query(
      `SELECT status, employee_id
       FROM company_support_tickets
       WHERE id = ? AND company_id = ?`,
      [id, company_id]
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found"
      });
    }

    if (ticket.status === "CLOSED") {
      return res.status(409).json({
        success: false,
        message: "Ticket is already closed"
      });
    }

    await db.query(
      `UPDATE company_support_tickets
       SET
         response = ?,
         responded_by_role = ?,
         responded_by_id = ?,
         responded_at = NOW(),
         status = 'CLOSED'
       WHERE id = ?`,
      [response, role, responder_id, id]
    );

    // 🔔 Send Notification to Employee
    // 🔔 Send Notification to Employee
  const shortResponse =
  response.length > 180
    ? response.substring(0, 180) + "..."
    : response;

await sendNotification({
  company_id,
  user_type: "EMPLOYEE",
  user_id: ticket.employee_id,
  title: ticket.category || "Support Ticket",
  message: shortResponse,
  notification_type: "SUPPORT_TICKET",
  reference_id: id,
  reference_type: "SUPPORT_TICKET",
  action_url: `/employee/help-support/${id}`
});

    res.json({
      success: true,
      message: "Response sent and ticket closed"
    });

  } catch (error) {
    console.error("respondToSupportTicket error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to respond to support ticket"
    });
  }
};