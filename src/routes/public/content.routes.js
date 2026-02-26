import express from "express";
import { getPublicContentAll } from "../../controllers/employee/getContent.controller.js";

const router = express.Router();

router.get("/content", getPublicContentAll);

export default router;