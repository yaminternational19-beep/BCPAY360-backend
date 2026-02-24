import { verifyToken, allowRoles } from "./src/middlewares/auth.middleware.js";
console.log("Successfully imported auth.middleware.js");
console.log("verifyToken:", typeof verifyToken);
console.log("allowRoles:", typeof allowRoles);
