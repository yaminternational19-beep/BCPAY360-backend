export const buildScope = (user) => {
  const { role, company_id, department, id } = user;

  let where = `WHERE company_id = ?`;
  let params = [company_id];

  if (role === "HR") {
    where += ` AND department = ?`;
    params.push(department);
  }

  if (role === "EMPLOYEE") {
    where += ` AND employee_id = ?`;
    params.push(id);
  }

  return { where, params };
};
