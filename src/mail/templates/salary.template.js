/**
 * Salary Credit Email Template
 */
export const salaryTemplate = ({ name, monthName, year }) => {
  return {
    subject: `Salary Credited – ${monthName} ${year}`,
    html: `
            <div style="font-family: Arial, sans-serif; line-height:1.6">
              <p>Dear <b>${name}</b>,</p>
        
              <p>
                Your salary for <b>${monthName} ${year}</b> has been successfully credited
                to your registered bank account.
              </p>
        
              <br/>
        
              <p>
                If you have any questions, please contact HR.
              </p>
        
              <p>
                Regards,<br/>
                <b>HR Team</b>
              </p>
            </div>
        `
  };
};
