import multer from "multer";
import { FILE_TYPES, isValidFileType } from "../utils/s3Upload.util.js";

// ============================
// MEMORY STORAGE FOR S3 UPLOAD
// ============================
// Use memory storage instead of disk storage for EC2 deployment
// Files are stored in memory as buffers and uploaded directly to S3
const storage = multer.memoryStorage();

// ============================
// FILE SIZE LIMITS
// ============================
const FILE_SIZE_LIMITS = {
    PROFILE_PHOTO: 2 * 1024 * 1024, // 2MB
    DOCUMENT: 5 * 1024 * 1024, // 5MB
};

// ============================
// FILE FILTER FOR VALIDATION
// ============================
const createFileFilter = (allowedTypes) => {
    return (req, file, cb) => {
        if (isValidFileType(file.mimetype, allowedTypes)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`
                ),
                false
            );
        }
    };
};

// ============================
// MULTER CONFIGURATIONS
// ============================

/**
 * Profile photo upload configuration
 * - Single image file
 * - Max size: 2MB
 * - Allowed: JPEG, PNG, WebP
 */
export const uploadProfilePhoto = multer({
    storage,
    limits: { fileSize: FILE_SIZE_LIMITS.PROFILE_PHOTO },
    fileFilter: createFileFilter(FILE_TYPES.IMAGES),
}).single("profile_photo");

/**
 * Employee document upload configuration
 * - Single document file
 * - Max size: 5MB
 * - Allowed: Images and common document formats
 */
export const uploadDocument = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: createFileFilter(FILE_TYPES.ALL_EMPLOYEE_FILES),
}).single("document");

/**
 * Multiple documents upload configuration
 * - Multiple document files
 * - Max size per file: 5MB
 * - Allowed: Images and common document formats
 */
export const uploadMultipleDocuments = multer({
    storage,
    limits: { fileSize: FILE_SIZE_LIMITS.DOCUMENT },
    fileFilter: createFileFilter(FILE_TYPES.ALL_EMPLOYEE_FILES),
}).array("documents", 10); // Max 10 files

/**
 * Employee creation with DYNAMIC file types
 * - Supports any field name matching document types
 * - Max size per file: 10MB
 * - Max 15 files per request
 */
export const uploadEmployeeFiles = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: createFileFilter(FILE_TYPES.ALL_EMPLOYEE_FILES),
}).any();

// ============================
// ERROR HANDLER MIDDLEWARE
// ============================
/**
 * Multer error handler
 * Use this after multer middleware to catch upload errors
 */
export const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: "File too large",
                maxSize: "5MB for documents, 2MB for photos",
            });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                message: "Unexpected file field",
            });
        }
        return res.status(400).json({
            message: `Upload error: ${err.message}`,
        });
    }

    if (err) {
        return res.status(400).json({
            message: err.message || "File upload failed",
        });
    }

    next();
};
