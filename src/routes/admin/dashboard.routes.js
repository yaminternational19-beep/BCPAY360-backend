import express from "express";
import { verifyToken, allowRoles } from "../../middlewares/auth.middleware.js";
import { getDashboard } from "../../controllers/admin/dashboard.controller.js";

const router = express.Router();

/*
  ADMIN  → allowed
  HR     → allowed
  EMP    → blocked
*/
router.get(
  "/",
  verifyToken,
  allowRoles("COMPANY_ADMIN", "HR"),
  getDashboard
);


export default router;
  