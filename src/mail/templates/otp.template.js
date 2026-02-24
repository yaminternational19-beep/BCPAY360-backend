/**
 * OTP Email Template
 */
export const otpTemplate = (otp) => {
    return {
        subject: "Super Admin Login OTP",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <p>Your OTP is <b>${otp}</b>. It expires in 5 minutes.</p>
            </div>
        `,
        text: `Your OTP is ${otp}. It expires in 5 minutes.`
    };
};
