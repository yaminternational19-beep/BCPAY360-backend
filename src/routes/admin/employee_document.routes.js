import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import { uploadDocument, handleMulterError } from "../../middlewares/multerConfig.js";
import {
  add_employee_document,
  list_employee_documents
} from "../../controllers/admin/employee_document.controller.js";

const router = express.Router();


// Upload single document with multer middleware
router.post("/",verifyToken, uploadDocument, handleMulterError, add_employee_document);
router.get("/:employee_code",verifyToken, list_employee_documents);

export default router;
