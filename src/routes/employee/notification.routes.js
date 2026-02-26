import express from "express";
import {
  getNotifications,
  notificationAction
} from "../../controllers/employee/notification.controller.js";

import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();



/* GET notifications (with unread count included) */
router.get("/",verifyEmployeeToken, getNotifications);

/* Single action API (read / read-all / delete) */
router.patch("/action", verifyEmployeeToken, notificationAction);

export default router;