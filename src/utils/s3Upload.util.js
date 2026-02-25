import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Client, { S3_BUCKET_NAME, AWS_REGION } from "../config/s3.config.js";
import logger from "./logger.js";

const MODULE_NAME = "S3_UPLOAD_UTIL";

/**
 * STORAGE SERVICE
 * Centralized logic for S3 interactions, ensuring multi-tenant safety.
 */

export const FILE_TYPES = {
    IMAGES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    DOCS: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    SHEETS: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ALL_EMPLOYEE_FILES: [
        "image/jpeg", "image/jpg", "image/png", "image/webp",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain",
        "application/zip",
        "application/x-zip-compressed"
    ],
};

const GOVT_DOCS = ["FORM_11", "FORM_16", "GRATUITY", "PF_EXIT"];

/**
 * Validates mandatory context for any file operation.
 * Prevents cross-tenant leakage or orphaned files in root.
 */
const validateContext = (context) => {
    const { companyId, branchId, employeeCode } = context;
    if (!companyId || !branchId || !employeeCode) {
        throw new Error(`Incomplete storage context: companyId=${companyId}, branchId=${branchId}, employeeCode=${employeeCode}`);
    }
    return true;
};

/**
 * Generates a consistent, tenant-isolated S3 key.
 * @param {Object} context - { companyId, branchId, employeeCode }
 * @param {Object} file - { fieldname, originalname }
 * @param {Object} meta - { year, month } (Optional, for salary/govt docs)
 */


export const generateEmployeeS3Key = (context, file, meta = {}) => {
    validateContext(context);

    const { companyId, branchId, employeeCode } = context;
    const { fieldname, originalname } = file;
    const { year, month, periodType } = meta;

    const basePath = `companies/${companyId}/branches/${branchId}/employees/${employeeCode}/documents`;
    const docType = (fieldname || "OTHER").toUpperCase();
    const timestamp = Date.now();
    const cleanFileName = originalname.replace(/\s+/g, "_");

    let subPath;

   

    // console.log("====== S3 KEY DEBUG START ======");
    // console.log("DOC TYPE:", docType);
    // console.log("YEAR:", year);
    // console.log("MONTH:", month);
    // console.log("PERIOD TYPE:", periodType);
    // console.log("META OBJECT:", meta);

    if (periodType === "MONTH") {
        const formattedMonth = String(month).padStart(2, "0");
        subPath = `company_docs/${docType}/${year}/${formattedMonth}`;
        console.log("Branch: MONTH → company_docs");

    } else if (periodType === "FY") {
        subPath = `company_docs/${docType}/${year}`;
        console.log("Branch: FY → company_docs");

    } else {
        subPath = `personal/${docType}`;
        console.log("Branch: DEFAULT → personal");
    }

    const finalKey = `${basePath}/${subPath}/${timestamp}_${cleanFileName}`;

    // console.log("FINAL S3 KEY:", finalKey);
    // console.log("====== S3 KEY DEBUG END ======");

    return finalKey;
};

/**
 * Minimal key for non-employee specific uploads (e.g. company logos, templates)
 */
export const generateCompanyS3Key = (companyId, category, originalname) => {
    if (!companyId) throw new Error("Company ID required for storage");
    const timestamp = Date.now();
    const cleanName = originalname.replace(/\s+/g, "_");
    return `companies/${companyId}/${category}/${timestamp}_${cleanName}`;
};

/**
 * Core upload wrapper
 */
export const uploadToS3 = async (fileBuffer, s3Key, mimetype) => {
    try {
        await s3Client.send(
            new PutObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: mimetype
            })
        );

        const url = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
        return { key: s3Key, url };
    } catch (err) {
        logger.error(MODULE_NAME, "S3 Upload Error", err);
        throw new Error("Failed to upload file to S3");
    }
};

/**
 * Core delete wrapper
 */
export const deleteS3Object = async (key) => {
    if (!key) return;
    try {
        await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: key
        }));
    } catch (err) {
        logger.error(MODULE_NAME, `S3 Delete Error [${key}]`, err);
    }
};

/**
 * Presigned URL generation with metadata awareness
 */
export const getS3SignedUrl = async (key, expiresIn = 259200, options = {}) => {
    if (!key) return null;
    try {
        const getParams = {
            Bucket: S3_BUCKET_NAME,
            Key: key,
        };

        if (options.disposition) {
            getParams.ResponseContentDisposition = options.disposition;
        }

        const command = new GetObjectCommand(getParams);
        return await getSignedUrl(s3Client, command, { expiresIn });
    } catch (error) {
        logger.error(MODULE_NAME, "S3 Signed URL Error", error);
        return null;
    }
};

export const isValidFileType = (mimetype, allowedTypes) => {
    return (allowedTypes || FILE_TYPES.ALL_EMPLOYEE_FILES).includes(mimetype);
};

// These functions are deprecated but kept for minimal backward compatibility during refactor
// They should be removed once all controllers are updated.
export const getEmployeeS3BasePath = (companyId, branchId, employeeCode) => {
    return `companies/${companyId}/branches/${branchId}/employees/${employeeCode}`;
};

export const getEmployeeDocumentSubPath = (docType) => {
    const type = (docType || "OTHER").toUpperCase();
    if (GOVT_DOCS.includes(type)) {
        const year = new Date().getFullYear();
        return `documents/govt/${type}/${year}`;
    }
    return `documents/personal/${type}`;
};
