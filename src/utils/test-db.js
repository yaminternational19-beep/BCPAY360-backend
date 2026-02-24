import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

import mysql from "mysql2/promise";

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,

      // 🔴 THIS IS THE FIX
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log("✅ DB connected successfully");
    await conn.end();
  } catch (err) {
    console.error("❌ DB test failed:", err.message);
  }
})();
