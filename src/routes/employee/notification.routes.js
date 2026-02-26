import express from "express";
import {
  getNotifications,
  notificationAction
} from "../../controllers/employee/notification.controller.js";

import { verifyEmployeeToken } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.use(verifyEmployeeToken);

/* GET notifications (with unread count included) */
router.get("/", getNotifications);

/* Single action API (read / read-all / delete) */
router.patch("/action", notificationAction);

export default router;