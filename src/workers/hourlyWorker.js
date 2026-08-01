const db = require('../db');

async function runHourlyRollup() {
  const sql = `
    INSERT INTO hourly_stats (bucket_time, event_type, event_count)
    SELECT 
      date_trunc('hour', timestamp) AS bucket_time,
      event_type,
      COUNT(*)::bigint AS event_count
    FROM raw_events
    WHERE timestamp < date_trunc('hour', NOW())
    GROUP BY 1, 2
    ON CONFLICT (bucket_time, event_type)
    DO UPDATE SET event_count = EXCLUDED.event_count;
  `;

  try {
    const res = await db.query(sql);
    console.log(`Hourly rollup executed successfully. Upserted ${res.rowCount} row(s).`);
    return res.rowCount;
  } catch (err) {
    console.error('Error executing hourly rollup:', err.message);
    throw err;
  }
}

module.exports = { runHourlyRollup };
