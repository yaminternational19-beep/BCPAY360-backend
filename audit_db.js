import db from "./src/models/db.js";
import fs from "fs";

async function auditSchema() {
    try {
        const [rows] = await db.query("DESCRIBE employees");
        fs.writeFileSync("employees_schema.json", JSON.stringify(rows, null, 2));

        const [authRows] = await db.query("DESCRIBE employee_auth");
        fs.writeFileSync("employee_auth_schema.json", JSON.stringify(authRows, null, 2));

        process.exit(0);
    } catch (err) {
        fs.writeFileSync("audit_error.txt", err.stack || err.message);
        process.exit(1);
    }
}

auditSchema();
