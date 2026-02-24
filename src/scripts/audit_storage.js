import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Environment Setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Configuration
const BATCH_SIZE = 50; // Process records in chunks to avoid memory spikes
const DELAY_MS = 50;   // Small delay to prevent rate limiting

// Database Setup
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306
};

// S3 Setup
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Tables to Audit
const TABLES = [
    {
        name: "employee_documents",
        idColumn: "id",
        keyColumn: "storage_object_key",
        bucketColumn: "storage_bucket",
        providerColumn: "storage_provider",
        selectCols: "id, employee_id, document_type"
    },
    {
        name: "employee_form_documents",
        idColumn: "id",
        keyColumn: "storage_object_key",
        bucketColumn: "storage_bucket",
        providerColumn: "storage_provider",
        selectCols: "id, employee_id, form_code, period_type"
    }
];

// Utility: Delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkS3Object(bucket, key) {
    if (!bucket || !key) return { exists: false, reason: "MISSING_METADATA" };
    try {
        await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { exists: true };
    } catch (error) {
        if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
            return { exists: false, reason: "NOT_FOUND_IN_S3" };
        } else if (error.$metadata?.httpStatusCode === 403) {
            return { exists: false, reason: "FORBIDDEN" };
        }
        return { exists: false, reason: `ERROR: ${error.message}` };
    }
}

async function auditTable(connection, tableConfig) {
    console.log(`\n🔍 Auditing table: ${tableConfig.name}...`);

    // 1. Count Records
    const [countResult] = await connection.query(
        `SELECT COUNT(*) as total FROM ${tableConfig.name} WHERE ${tableConfig.providerColumn} = 'S3'`
    );
    const totalRecords = countResult[0].total;
    console.log(`   Found ${totalRecords} S3 records.`);

    if (totalRecords === 0) return [];

    let offset = 0;
    const missingFiles = [];

    // 2. Batch Process
    while (offset < totalRecords) {
        const [rows] = await connection.query(
            `SELECT ${tableConfig.idColumn}, ${tableConfig.bucketColumn}, ${tableConfig.keyColumn}, ${tableConfig.selectCols} 
             FROM ${tableConfig.name} 
             WHERE ${tableConfig.providerColumn} = 'S3' 
             LIMIT ? OFFSET ?`,
            [BATCH_SIZE, offset]
        );

        console.log(`   Processing batch ${offset} - ${offset + rows.length}...`);

        for (const row of rows) {
            const bucket = row[tableConfig.bucketColumn] || process.env.S3_BUCKET_NAME; // Fallback to env if column empty
            const key = row[tableConfig.keyColumn];
            const id = row[tableConfig.idColumn];

            // Check S3
            const result = await checkS3Object(bucket, key);

            if (!result.exists) {
                // Log failure
                const issue = {
                    table: tableConfig.name,
                    id: id,
                    bucket: bucket,
                    key: key || "NULL_KEY",
                    reason: result.reason,
                    details: row
                };
                missingFiles.push(issue);
                process.stdout.write("❌");
            } else {
                process.stdout.write(".");
            }

            await sleep(DELAY_MS);
        }

        console.log(" Done.");
        offset += BATCH_SIZE;
    }

    return missingFiles;
}

async function main() {
    console.log("🚀 Starting File Storage Integrity Audit...");
    let connection;

    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("✅ Database connected.");

        const allIssues = [];

        for (const table of TABLES) {
            const issues = await auditTable(connection, table);
            allIssues.push(...issues);
        }

        console.log("\n==========================================");
        console.log("📊 AUDIT COMPLETE");
        console.log("==========================================");

        if (allIssues.length === 0) {
            console.log("✅ No missing files found! All S3 references are valid.");
        } else {
            console.log(`⚠️  Found ${allIssues.length} broken file references.`);
            console.log("------------------------------------------");

            // Print Report
            allIssues.forEach((issue, idx) => {
                console.log(`${idx + 1}. [${issue.table}] ID: ${issue.id}`);
                console.log(`   Key: ${issue.key}`);
                console.log(`   Reason: ${issue.reason}`);
                console.log(`   Details: ${JSON.stringify(issue.details)}`);
                console.log("------------------------------------------");
            });

            // Save to JSON
            const reportFile = "audit_report.json";
            fs.writeFileSync(reportFile, JSON.stringify(allIssues, null, 2));
            console.log(`📝 Full report saved to ${reportFile}`);
        }

    } catch (error) {
        console.error("🔥 Fatal Error during audit:", error);
    } finally {
        if (connection) await connection.end();
        console.log("\n👋 Exiting.");
    }
}

main();
