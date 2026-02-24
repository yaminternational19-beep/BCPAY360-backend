import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

// Validate required AWS environment variables
const requiredEnvVars = ["AWS_REGION", "S3_BUCKET_NAME"];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(
    `❌ Missing required AWS environment variables: ${missingVars.join(", ")}`
  );
  console.error(
    "Please set these in your .env file or use IAM role on EC2 instance"
  );
  process.exit(1);
}

// Initialize S3 Client
// If running on EC2 with IAM role, credentials will be automatically loaded
// Otherwise, it will use AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from .env
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  // Credentials are automatically loaded from:
  // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  // 2. IAM role (recommended for EC2)
  // 3. AWS credentials file
});

export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
export const AWS_REGION = process.env.AWS_REGION;

console.log(`✅ S3 Client initialized for bucket: ${S3_BUCKET_NAME} in region: ${AWS_REGION}`);

export default s3Client;
