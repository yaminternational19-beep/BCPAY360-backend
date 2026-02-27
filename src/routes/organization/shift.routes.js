import express from "express";
import {
    createShift,
    listShifts,
    updateShift,
    deleteShift,
    toggleShiftStatus,
} from "../../controllers/organization/shift.controller.js";

import { allowRoles, verifyToken } from "../../middlewares/auth.middleware.js";


const router = express.Router();

router.use(verifyToken);
router.use(allowRoles("COMPANY_ADMIN"));

router.post("/", verifyToken, createShift);
router.get("/", verifyToken, listShifts);
router.put("/:id", verifyToken, updateShift);
router.patch("/:id/status", verifyToken, toggleShiftStatus);
router.delete("/:id", verifyToken, deleteShift);

export default router;
