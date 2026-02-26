import express from "express";
import {
  generateEmployeeCode,
} from "../../controllers/organization/empCode.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/* PROTECTED */

router.use(allowRoles("COMPANY_ADMIN"));

router.post("/code", verifyToken, generateEmployeeCode);


export default router;
