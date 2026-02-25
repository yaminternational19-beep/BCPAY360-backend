import jwt from "jsonwebtoken";
import db from "../models/db.js";
/* ============================
   VERIFY TOKEN
============================ */
export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, company_id, branch_id, department_id }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const verifyEmployeeToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [[employee]] = await db.query(
      `SELECT employee_status FROM employees WHERE id = ?`,
      [decoded.id]
    );

    if (!employee || employee.employee_status !== "ACTIVE") {
      return res.status(401).json({
        message: "Account deactivated. Contact admin."
      });
    }

    req.user = decoded;
    next();

  } catch (err) {
    console.error("VERIFY ERROR:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

/* ============================
   REQUIRE ROLE (OPTIONAL)
============================ */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};

/* ============================
   ALLOW ROLES (NAMED EXPORT)
============================ */
export const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};
