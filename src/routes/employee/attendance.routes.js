import express from "express";
import { verifyToken } from "../../middlewares/auth.middleware.js";
import {
  checkIn,
  checkOut,
  getMyAttendance,
  raiseAttendanceRequest
} from "../../controllers/employee/attendance.controller.js";

const router = express.Router();

/* PREFLIGHT */
router.options("*", (_, res) => res.sendStatus(200));

/* PROTECTED */
router.use(verifyToken);

/* ACTIONS */
router.post("/check-in", checkIn);
router.post("/check-out", checkOut);

/* VIEWS */

router.get("/my", getMyAttendance);

/* ✅ SUMMARY */


router.post("/raise-request", raiseAttendanceRequest);

export default router;
