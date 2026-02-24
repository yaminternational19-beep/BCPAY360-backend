import express from "express";
import cors from "cors";
import logger from "./utils/logger.js";

const MODULE_NAME = "APP";

/* ROUTES */
import superAdminRoutes from "./routes/organization/superadmin/superAdmin.routes.js";
import companyRoutes from "./routes/organization/superadmin/company.routes.js";
import companyAdminRoutes from "./routes/organization/superadmin/companyAdmin.routes.js";
import hrRoutes from "./routes/organization/hr.routes.js";
import hrPermissionRoutes from "./routes/organization/hrPermissions.routes.js";

import branchRoutes from "./routes/organization/branch.routes.js";
import departmentRoutes from "./routes/organization/department.routes.js";
import designationRoutes from "./routes/organization/designation.routes.js";
import employeeTypeRoutes from "./routes/organization/employeeType.routes.js";
import shiftRoutes from "./routes/organization/shift.routes.js";

import employeeRoutes from "./routes/admin/employee.routes.js";
import employeeProfileRoutes from "./routes/admin/employee_profile.routes.js";
import employeeDocumentRoutes from "./routes/admin/employee_document.routes.js";
import employeeAuthRoutes from "./routes/employee/employeeAuth.routes.js";

import dashboardRoutes from "./routes/admin/dashboard.routes.js";
import attendanceRoutes from "./routes/employee/attendance.routes.js";

import adminAttendanceRoutes from "./routes/admin/adminAttendance.routes.js";
import employeeHomeRoutes from "./routes/employee/home.routes.js";
import employeeProfile from "./routes/employee/profile.routes.js";
import payrolldata from "./routes/employee/payRoll.routes.js";
import empCode from "./routes/organization/empCode.routes.js";
import leaveMasterRoutes from "./routes/admin/leaveMaster.routes.js";
import employeeLeaveRoutes from "./routes/employee/leave.routes.js";
import leaveApprovalRoutes from "./routes/admin/leaveApproval.routes.js";
import payrollRoutes from "./routes/admin/payroll.routes.js";
import generatedocs from "./routes/admin/generateDocs.routes.js";
import adminFormsRoutes from "./routes/admin/adminForms.routes.js";
import contentPage from "./routes/settings/companyPages.route.js";
import holidays from "./routes/admin/holidays.route.js";
import helpsupport from "./routes/settings/support.routes.js";
import FandQ from "./routes/settings/companyFaq.routes.js";
import broadcastRoutes from "./routes/settings/broadcast.routes.js";

import empholidays from "./routes/employee/holiday.route.js";
import suppoptreq from "./routes/employee/support.route.js";

import editEmployeeProfile from "./routes/employee/employee.routes.js";

const app = express();
app.set("trust proxy", 1);

/* ============================
   MIDDLEWARES
============================ */
const allowedOrigins = [
  // Admin dev
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.1.5:5173",

  // Employee dev
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://192.168.1.5:5174",

  // Other dev
  "http://localhost:3000",
  "http://127.0.0.1:3000",

  // Production
  "http://13.51.196.99"
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow Postman / curl / server-to-server
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      logger.warn(MODULE_NAME, "CORS blocked for origin", { origin });
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

/* ============================
   JSON BODY PARSER WITH ERROR HANDLING
============================ */
app.use(express.json({
  // Handle empty/incomplete bodies gracefully
  verify: (req, res, buf, encoding) => {
    // For GET/HEAD requests with empty bodies, don't throw
    if (['GET', 'HEAD'].includes(req.method) && buf.length === 0) {
      req._emptyBodyAllowed = true;
    }
  }
}));

// ⚠️ CRITICAL: Catch JSON parsing errors BEFORE routes
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // Allow GET/HEAD with empty/minimal bodies (common client mistake)
    if (['GET', 'HEAD'].includes(req.method)) {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);

      // If it's just empty brackets {} (2 bytes) or empty string, skip the error
      if (contentLength <= 2) {
        logger.warn(MODULE_NAME, "Empty JSON body on GET/HEAD - ignoring", { path: req.path });
        req.body = {};
        return next();
      }
    }

    // For non-GET or larger bodies, log and return error
    logger.error(MODULE_NAME, `JSON Parse Error on ${req.method} ${req.path}`, {
      errorMessage: err.message,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length']
    });

    return res.status(400).json({
      success: false,
      message: 'Invalid JSON in request body',
      error: err.message
    });
  }
  next(err);
});

// ⚠️ SAFETY: GET/HEAD requests should not have bodies
app.use((req, res, next) => {
  if (['GET', 'HEAD'].includes(req.method)) {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > 0) {
      logger.warn(MODULE_NAME, `${req.method} request with body on ${req.path}`);
    }
  }
  next();
});

/* ============================
   STATIC FILES - REMOVED FOR S3
============================ */
// Files are now stored in AWS S3 instead of local filesystem
// app.use("/uploads", express.static("uploads")); // REMOVED

/* ============================
   ROUTES
============================ */

/* SUPER ADMIN */
app.use("/api/super-admin", superAdminRoutes);

/* COMPANY + COMPANY ADMIN */
app.use("/api/companies", companyRoutes);
app.use("/api/company-admins", companyAdminRoutes);

/* HR MODULE */
app.use("/api/hr", hrRoutes);
app.use("/api/hr-permissions", hrPermissionRoutes);

/* ORGANIZATION MODULE */
app.use("/api/branches", branchRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/designations", designationRoutes);
app.use("/api/employee-types", employeeTypeRoutes);
app.use("/api/shifts", shiftRoutes);

/* EMPLOYEE MODULE */
app.use("/api/employees", employeeRoutes);
app.use("/api/employee-profiles", employeeProfileRoutes);   // ✅ FIX
app.use("/api/employee-documents", employeeDocumentRoutes);
app.use("/api/employee/auth", employeeAuthRoutes);

/* DASHBOARD (KEEP LAST) */
app.use("/api", dashboardRoutes);

app.use("/api/employee/attendance", attendanceRoutes);


app.use("/api/admin/attendance", adminAttendanceRoutes);
app.use("/api/admin/leave-master", leaveMasterRoutes);
app.use("/api/admin/leave-approval", leaveApprovalRoutes);
app.use("/api/admin/payroll", payrollRoutes);
app.use("/api/admin/employee", empCode);

app.use("/api/admin/generate-docs", generatedocs);
app.use("/api/admin/forms", adminFormsRoutes);
app.use("/api/admin/holidays", holidays);



app.use("/api/employee", employeeHomeRoutes);
app.use("/api/employee", employeeProfile);


app.use("/api/employee", employeeLeaveRoutes);
app.use("/api/employee", payrolldata);
app.use("/api/employee", empholidays);
app.use("/api/employee", suppoptreq);
app.use("/api/employee", editEmployeeProfile);


import uploadCompanyGovernmentForm from "./routes/organization/companyGovernmentForm.routes.js";
app.use("/api/admin/government-forms", uploadCompanyGovernmentForm);



app.use("/api/admin/content", contentPage);
app.use("/api/admin", helpsupport)
app.use("/api/admin", FandQ);
app.use("/api/admin", broadcastRoutes);



export default app;