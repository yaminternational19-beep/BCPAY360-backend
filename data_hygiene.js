import db from "./src/models/db.js";
import { TABLES } from "./src/utils/tableNames.js";
import { S3_BUCKET_NAME } from "./src/config/s3.config.js";

async function hygiene() {
    try {
        console.log("🧹 Starting Data Hygiene...");

        // 1. Fix employee_documents
        const [badDocs] = await db.query(`SELECT id, storage_object_key FROM ${TABLES.EMPLOYEE_DOCUMENTS} WHERE storage_object_key LIKE 'http%'`);
        console.log(`Found ${badDocs.length} documents with full URLs.`);

        for (const doc of badDocs) {
            let cleanKey = doc.storage_object_key.split('.amazonaws.com/').pop();
            await db.query(`UPDATE ${TABLES.EMPLOYEE_DOCUMENTS} SET storage_object_key = ?, file_path = ? WHERE id = ?`, [cleanKey, cleanKey, doc.id]);
            console.log(`Fixed Doc ID ${doc.id}: ${cleanKey}`);
        }

        // 2. Fix employee_profiles photo paths
        const [badProfiles] = await db.query(`SELECT employee_id, profile_photo_path FROM ${TABLES.EMPLOYEE_PROFILES} WHERE profile_photo_path LIKE 'http%'`);
        console.log(`Found ${badProfiles.length} profiles with full photo URLs.`);

        for (const p of badProfiles) {
            let cleanKey = p.profile_photo_path.split('.amazonaws.com/').pop();
            await db.query(`UPDATE ${TABLES.EMPLOYEE_PROFILES} SET profile_photo_path = ? WHERE employee_id = ?`, [cleanKey, p.employee_id]);
            console.log(`Fixed Profile Photo for Emp ${p.employee_id}: ${cleanKey}`);
        }

        console.log("✅ Hygiene Complete.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Hygiene Failed:", err);
        process.exit(1);
    }
}

hygiene();
