import multer from "multer";
import multerS3 from "multer-s3";
import s3Client, { S3_BUCKET_NAME } from "../config/s3.config.js";

const uploadGovernmentFormToS3 = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      const companyId = req.user?.company_id;
      const formCode = (req.body?.form_code || "UNKNOWN_FORM").trim().toUpperCase();
      const version = (req.body?.version || "1").toString().replace(/^v/, "");

      const timestamp = Date.now();
      const cleanName = file.originalname.replace(/\s+/g, "_");

      // companies/{id}/company-govt-forms/{form_code}/v{version}/{timestamp}_{file}
      const s3Key = `companies/${companyId}/company-govt-forms/${formCode}/v${version}/${timestamp}_${cleanName}`;

      cb(null, s3Key);
    }
  }),

  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },

  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg"
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Invalid file type. Only PDF, PNG, JPG allowed"),
        false
      );
    }

    cb(null, true);
  }
});

export default uploadGovernmentFormToS3;
