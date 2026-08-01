const db = require('../db');

async function runDailyRollup() {
  const sql = `
    INSERT INTO daily_stats (bucket_time, event_type, event_count)
    SELECT 
      date_trunc('day', bucket_time) AS bucket_time,
      event_type,
      SUM(event_count)::bigint AS event_count
    FROM hourly_stats
    WHERE bucket_time < date_trunc('day', NOW())
    GROUP BY 1, 2
    ON CONFLICT (bucket_time, event_type)
    DO UPDATE SET event_count = EXCLUDED.event_count;
  `;

  try {
    const res = await db.query(sql);
    console.log(`Daily rollup executed successfully. Upserted ${res.rowCount} row(s).`);
    return res.rowCount;
  } catch (err) {
    console.error('Error executing daily rollup:', err.message);
    throw err;
  }
}

module.exports = { runDailyRollup };
