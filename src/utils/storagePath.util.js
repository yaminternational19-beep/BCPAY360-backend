import path from "path";

/**
 * StoragePathUtil
 * 
 * The Single Source of Truth for S3 Key Generation.
 * Enforces strict folder structure:
 * companies/{company_name}/branches/{branch_name}/employees/{employee_code}/...
 */
export const StoragePathUtil = {

    /**
     * Sanitize a string for S3 safety
     * - Lowercase
     * - Replace spaces with dashes
     * - Remove special characters (keep alphanumeric, dashes, underscores)
     */
    sanitize: (str) => {
        if (!str) return "unknown";
        return String(str)
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')          // Replace spaces with -
            .replace(/[^a-z0-9\-_]/g, ''); // Remove non-safe chars
    },

    /**
     * Generate Profile Photo Key
     * companies/{company}/branches/{branch}/employees/{code}/profile/profile_photo.jpg
     */
    getProfilePhotoKey: ({ companyName, branchName, employeeCode, originalFilename }) => {
        const cName = StoragePathUtil.sanitize(companyName);
        const bName = StoragePathUtil.sanitize(branchName);
        const eCode = StoragePathUtil.sanitize(employeeCode);
        const ext = path.extname(originalFilename || '').toLowerCase() || '.jpg';

        return `companies/${cName}/branches/${bName}/employees/${eCode}/profile/profile_photo${ext}`;
    },

    /**
     * Generate Document Key
     * companies/{company}/branches/{branch}/employees/{code}/documents/{category}/{subCategory}/{filename}
     * 
     * @param {string} category - 'personal', 'forms', etc.
     * @param {string} subCategory - 'PAN', 'AADHAAR', 'PAYSLIP', 'FORM_16'
     * @param {string} filename - Expecting standardized name like '2024-01.pdf'
     */
    getDocumentKey: ({
        companyName,
        branchName,
        employeeCode,
        category,
        subCategory,
        filename
    }) => {
        const cName = StoragePathUtil.sanitize(companyName);
        const bName = StoragePathUtil.sanitize(branchName);
        const eCode = StoragePathUtil.sanitize(employeeCode);

        const cat = StoragePathUtil.sanitize(category);
        const sub = subCategory ? StoragePathUtil.sanitize(subCategory).toUpperCase() : 'GENERAL'; // Keep codes uppercase-ish but strictly sanitized might lower them. 
        // Re-upper-casing specific standard codes if readability preferred, but sanitization rule says lowercase.
        // Let's stick to strict sanitize (lowercase) for paths, but maybe the subCategory (Folder Name) can be Uppercase if the user wants strict logic?
        // User asked for: documents/personal/PAN/
        // My sanitize forces lowercase. I will adjust sanitize or just upper case the specific segment AFTER sanitize if needed.
        // But user requirement "sanitize names (lowercase...)" implies paths should be lowercase.
        // WAIT. User example: "PAN/", "AADHAAR/". These are uppercase.
        // I will allow uppercase for specific segments by bypassing sanitize for the folder name part or selectively uppercasing.

        let safeSub = StoragePathUtil.sanitize(subCategory);
        // Special case: Maintain uppercase for standard codes if desired, but user rule "sanitize names (lowercase)" is explicit.
        // However, the folder structure example shows "PAN", "AADHAAR".
        // I will use `toUpperCase()` for the subCategory bucket to match the example, 
        // ASSUMING the user wants the folder name to be uppercase like in the example, despite the general "lowercase" rule for names.
        safeSub = safeSub.toUpperCase();

        // Filename should be sanitized/standardized separately
        // User example: "{year}-{month}.pdf".

        return `companies/${cName}/branches/${bName}/employees/${eCode}/documents/${cat}/${safeSub}/${filename}`;
    }
};
