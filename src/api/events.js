const express = require('express');
const router = express.Router();
const db = require('../db');
const rateLimiter = require('../middleware/rateLimiter');

router.post('/', rateLimiter, async (req, res) => {
  try {
    const { event_type, timestamp, metadata } = req.body || {};

    if (!event_type || typeof event_type !== 'string' || event_type.trim() === '') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'event_type is required and must be a non-empty string'
      });
    }

    let parsedTimestamp;
    if (!timestamp) {
      parsedTimestamp = new Date().toISOString();
    } else {
      if (typeof timestamp !== 'string' || isNaN(Date.parse(timestamp))) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'timestamp must be a valid ISO 8601 string'
        });
      }
      parsedTimestamp = new Date(timestamp).toISOString();
    }

    const payloadMetadata = (metadata && typeof metadata === 'object' && !Array.isArray(metadata))
      ? metadata
      : {};

    const insertSql = `
      INSERT INTO raw_events (event_type, timestamp, metadata)
      VALUES ($1, $2, $3)
      RETURNING id, event_type, timestamp, metadata
    `;

    const result = await db.query(insertSql, [
      event_type.trim(),
      parsedTimestamp,
      JSON.stringify(payloadMetadata)
    ]);

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error inserting raw event:', err.message);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

module.exports = router;
