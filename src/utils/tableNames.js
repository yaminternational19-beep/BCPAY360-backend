export const TABLES = {

  /* ===============================
     ORGANIZATION / MASTER DATA
  =============================== */
  COMPANIES: "companies",
  BRANCHES: "branches",
  DEPARTMENTS: "departments",
  DESIGNATIONS: "designations",
  SHIFTS: "shifts",
  EMPLOYEE_TYPES: "employee_types",

  /* ===============================
     USERS & AUTH
  =============================== */
  SUPER_ADMIN: "super_admin",
  COMPANY_ADMINS: "company_admins",
  HR_USERS: "hr_users",
  HR_PERMISSIONS: "hr_permissions",
  EMPLOYEE_AUTH: "employee_auth",
  AUTH_OTPS: "auth_otps",

  /* ===============================
     EMPLOYEES (CORE HR)
  =============================== */
  EMPLOYEES: "employees",
  EMPLOYEE_PROFILES: "employee_profiles",
  EMPLOYEE_DOCUMENTS: "employee_documents",
  EMPLOYEE_FORM_DOCUMENTS: "employee_form_documents", // ✅ FIX
  EMPLOYEE_EXIT: "employee_exit",

  /* ===============================
     ATTENDANCE & LEAVE
  =============================== */
  ATTENDANCE: "attendance",
  ATTENDANCE_LOGS: "attendance_logs",
  LEAVE_TYPES: "leave_types",
  LEAVE_REQUESTS: "leave_requests",
  HOLIDAYS: "holidays",

  /* ===============================
     APPROVALS & WORKFLOWS
  =============================== */
  APPROVALS: "approvals",
  APPROVAL_WORKFLOWS: "approval_workflows",

  /* ===============================
     PAYROLL
  =============================== */
  PAYROLL_RUNS: "payroll_runs",
  SALARY_DETAILS: "salary_details", 
  SALARY_COMPONENTS: "salary_components",
  PAYSLIPS: "payslips",
  FNF_SETTLEMENTS: "fnf_settlements",

  /* ===============================
     COMPLIANCE & STATUTORY
  =============================== */
  COMPANY_GOVERNMENT_FORMS: "company_government_forms",
  HOLIDAYS: "branch_holidays",

};
