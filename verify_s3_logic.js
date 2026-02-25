import { generateEmployeeS3Key } from "./src/utils/s3Upload.util.js";

const mockContext = {
    companyId: 1,
    branchId: 10,
    employeeCode: "EMP001"
};

const tests = [
    {
        name: "Salary Document (Specific Year/Month)",
        file: { fieldname: "SALARY", originalname: "payslip.pdf" },
        meta: { year: 2024, month: 5 },
        expectedPart: "company_docs/SALARY/2024/05"
    },
    {
        name: "Salary Document (Default to current if meta missing)",
        file: { fieldname: "SALARY", originalname: "payslip.pdf" },
        meta: {},
        expectedPart: `company_docs/SALARY/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}`
    },
    {
        name: "Govt Document (FORM_16)",
        file: { fieldname: "FORM_16", originalname: "f16.pdf" },
        meta: { year: 2023 },
        expectedPart: "company_docs/GOVT/FORM_16/2023"
    },
    {
        name: "Personal Document (AADHAAR)",
        file: { fieldname: "AADHAAR", originalname: "my_aadhaar.pdf" },
        meta: {},
        expectedPart: "personal/AADHAAR"
    },
    {
        name: "Profile Photo",
        file: { fieldname: "PROFILE_PHOTO", originalname: "me.jpg" },
        meta: {},
        expectedPart: "profile/"
    }
];

console.log("--- S3 PATH VERIFICATION ---");
tests.forEach(t => {
    const key = generateEmployeeS3Key(mockContext, t.file, t.meta);
    const pass = key.includes(t.expectedPart);
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${t.name}`);
    console.log(`   Generated: ${key}`);
    if (!pass) console.log(`   Expected to contain: ${t.expectedPart}`);
});
