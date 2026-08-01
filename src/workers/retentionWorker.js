const db = require('../db');

async function runRetentionPurge(retentionDays = 30, batchSize = 5000) {
  let totalDeleted = 0;
  let rowsDeletedInBatch = 0;

  try {
    do {
      const sql = `
        DELETE FROM raw_events
        WHERE id IN (
          SELECT id FROM raw_events
          WHERE timestamp < NOW() - INTERVAL '${parseInt(retentionDays, 10)} days'
          LIMIT ${parseInt(batchSize, 10)}
        );
      `;
      const res = await db.query(sql);
      rowsDeletedInBatch = res ? res.rowCount || 0 : 0;
      totalDeleted += rowsDeletedInBatch;
    } while (rowsDeletedInBatch >= batchSize);

    console.log(`Retention purge completed. Purged total of ${totalDeleted} raw event(s) older than ${retentionDays} days.`);
    return totalDeleted;
  } catch (err) {
    console.error('Error executing data retention purge:', err.message);
    throw err;
  }
}

module.exports = { runRetentionPurge };
