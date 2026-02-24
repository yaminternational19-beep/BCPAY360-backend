/**
 * Generic Email Template
 */
export const genericTemplate = ({ subject, body }) => {
    return {
        subject: subject,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <p>${body.replace(/\n/g, '<br>')}</p>
            </div>
        `,
        text: body
    };
};
