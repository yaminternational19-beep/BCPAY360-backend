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

router.post("/", createShift);
router.get("/", listShifts);
router.put("/:id", updateShift);
router.patch("/:id/status", toggleShiftStatus);
router.delete("/:id", deleteShift);

export default router;
