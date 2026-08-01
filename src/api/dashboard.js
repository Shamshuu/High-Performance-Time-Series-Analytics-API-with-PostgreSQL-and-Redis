const express = require('express');
const router = express.Router();
const db = require('../db');
const cacheMiddleware = require('../middleware/cache');

router.get('/summary', cacheMiddleware(60), async (req, res) => {
  try {
    const sqlQuery = `
      WITH hourly_counts AS (
        SELECT event_type, SUM(event_count)::bigint AS count
        FROM hourly_stats
        WHERE bucket_time >= NOW() - INTERVAL '24 hours'
        GROUP BY event_type
      ),
      raw_counts AS (
        SELECT event_type, COUNT(*)::bigint AS count
        FROM raw_events
        WHERE timestamp >= NOW() - INTERVAL '24 hours'
          AND timestamp >= COALESCE(
            (SELECT MAX(bucket_time) + INTERVAL '1 hour' FROM hourly_stats WHERE bucket_time >= NOW() - INTERVAL '24 hours'),
            NOW() - INTERVAL '24 hours'
          )
        GROUP BY event_type
      )
      SELECT event_type, SUM(count)::bigint AS last_24h_count
      FROM (
        SELECT event_type, count FROM hourly_counts
        UNION ALL
        SELECT event_type, count FROM raw_counts
      ) combined
      GROUP BY event_type
      ORDER BY last_24h_count DESC;
    `;

    const result = await db.query(sqlQuery);

    const metrics = result.rows.map(row => ({
      event_type: row.event_type,
      last_24h_count: parseInt(row.last_24h_count, 10)
    }));

    return res.status(200).json({ metrics });
  } catch (err) {
    console.error('Error fetching dashboard summary:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

module.exports = router;
