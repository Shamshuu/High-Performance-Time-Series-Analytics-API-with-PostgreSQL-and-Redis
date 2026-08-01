const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const { start_date, end_date, interval, event_type } = req.query;

    if (!start_date || !end_date || !interval) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'start_date, end_date, and interval parameters are required'
      });
    }

    if (interval !== 'hour' && interval !== 'day') {
      return res.status(400).json({
        error: 'Bad Request',
        message: "interval must be either 'hour' or 'day'"
      });
    }

    if (isNaN(Date.parse(start_date)) || isNaN(Date.parse(end_date))) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'start_date and end_date must be valid ISO 8601 strings'
      });
    }

    const startDateObj = new Date(start_date);
    const endDateObj = new Date(end_date);

    if (startDateObj > endDateObj) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'start_date cannot be after end_date'
      });
    }

    const eventTypeParam = event_type ? event_type.trim() : null;

    let sqlQuery = '';
    if (interval === 'hour') {
      sqlQuery = `
        WITH max_hourly AS (
          SELECT COALESCE(MAX(bucket_time), '1970-01-01 00:00:00+00'::timestamptz) AS max_bucket FROM hourly_stats
        ),
        rolled_up AS (
          SELECT 
            bucket_time AS bucket,
            event_type,
            event_count::bigint AS count
          FROM hourly_stats
          WHERE bucket_time >= date_trunc('hour', $1::timestamptz)
            AND bucket_time <= $2::timestamptz
            AND ($3::varchar IS NULL OR event_type = $3)
        ),
        raw_unaggregated AS (
          SELECT 
            date_trunc('hour', timestamp) AS bucket,
            event_type,
            COUNT(*)::bigint AS count
          FROM raw_events, max_hourly
          WHERE timestamp >= $1::timestamptz
            AND timestamp <= $2::timestamptz
            AND ($3::varchar IS NULL OR event_type = $3)
            AND (timestamp >= date_trunc('hour', NOW()) OR timestamp >= max_hourly.max_bucket + INTERVAL '1 hour')
          GROUP BY 1, 2
        )
        SELECT bucket, event_type, SUM(count)::bigint AS count
        FROM (
          SELECT bucket, event_type, count FROM rolled_up
          UNION ALL
          SELECT bucket, event_type, count FROM raw_unaggregated
        ) combined
        GROUP BY bucket, event_type
        ORDER BY bucket ASC, event_type ASC;
      `;
    } else {
      // interval === 'day'
      sqlQuery = `
        WITH max_daily AS (
          SELECT COALESCE(MAX(bucket_time), '1970-01-01 00:00:00+00'::timestamptz) AS max_bucket FROM daily_stats
        ),
        rolled_up_daily AS (
          SELECT 
            bucket_time AS bucket,
            event_type,
            event_count::bigint AS count
          FROM daily_stats
          WHERE bucket_time >= date_trunc('day', $1::timestamptz)
            AND bucket_time <= $2::timestamptz
            AND ($3::varchar IS NULL OR event_type = $3)
        ),
        hourly_today AS (
          SELECT 
            date_trunc('day', bucket_time) AS bucket,
            event_type,
            SUM(event_count)::bigint AS count
          FROM hourly_stats, max_daily
          WHERE bucket_time >= date_trunc('day', $1::timestamptz)
            AND bucket_time <= $2::timestamptz
            AND ($3::varchar IS NULL OR event_type = $3)
            AND (bucket_time >= date_trunc('day', NOW()) OR bucket_time >= max_daily.max_bucket + INTERVAL '1 day')
          GROUP BY 1, 2
        ),
        raw_today_ongoing AS (
          SELECT 
            date_trunc('day', timestamp) AS bucket,
            event_type,
            COUNT(*)::bigint AS count
          FROM raw_events, max_daily
          WHERE timestamp >= $1::timestamptz
            AND timestamp <= $2::timestamptz
            AND ($3::varchar IS NULL OR event_type = $3)
            AND (timestamp >= date_trunc('hour', NOW()) OR timestamp >= max_daily.max_bucket + INTERVAL '1 day')
          GROUP BY 1, 2
        )
        SELECT bucket, event_type, SUM(count)::bigint AS count
        FROM (
          SELECT bucket, event_type, count FROM rolled_up_daily
          UNION ALL
          SELECT bucket, event_type, count FROM hourly_today
          UNION ALL
          SELECT bucket, event_type, count FROM raw_today_ongoing
        ) combined
        GROUP BY bucket, event_type
        ORDER BY bucket ASC, event_type ASC;
      `;
    }

    const result = await db.query(sqlQuery, [start_date, end_date, eventTypeParam]);

    const formattedResults = result.rows.map(row => ({
      bucket: new Date(row.bucket).toISOString(),
      event_type: row.event_type,
      count: parseInt(row.count, 10)
    }));

    return res.status(200).json(formattedResults);
  } catch (err) {
    console.error('Error fetching analytics:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

module.exports = router;
