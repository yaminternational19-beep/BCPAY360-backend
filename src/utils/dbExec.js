// utils/dbExec.js
/**
 * Execute a query with a promise-based pool
 * Added a timeout safeguard for production reliability
 */
export const dbExec = async (db, sql, params = []) => {
  const [rows] = await db.query({
    sql,
    values: params,
    timeout: 30000 // 30s query timeout
  });
  return rows;
};
