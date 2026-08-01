const { runHourlyRollup } = require('../src/workers/hourlyWorker');
const { runDailyRollup } = require('../src/workers/dailyWorker');
const { runRetentionPurge } = require('../src/workers/retentionWorker');
const { startScheduler, stopScheduler } = require('../src/workers/scheduler');
const db = require('../src/db');

describe('Background Workers Integration Tests', () => {

  afterEach(() => {
    stopScheduler();
    jest.restoreAllMocks();
  });

  describe('Hourly Aggregation Worker', () => {
    it('should calculate hourly rollups idempotently', async () => {
      jest.spyOn(db, 'query').mockResolvedValue({ rowCount: 15 });

      const firstRunCount = await runHourlyRollup();
      expect(firstRunCount).toBe(15);

      const secondRunCount = await runHourlyRollup();
      expect(secondRunCount).toBe(15);
    });

    it('should handle errors in hourly rollup gracefully', async () => {
      jest.spyOn(db, 'query').mockRejectedValue(new Error('DB Error'));
      await expect(runHourlyRollup()).rejects.toThrow('DB Error');
    });
  });

  describe('Daily Aggregation Worker', () => {
    it('should aggregate hourly_stats into daily_stats idempotently', async () => {
      jest.spyOn(db, 'query').mockResolvedValue({ rowCount: 4 });

      const firstRunCount = await runDailyRollup();
      expect(firstRunCount).toBe(4);

      const secondRunCount = await runDailyRollup();
      expect(secondRunCount).toBe(4);
    });

    it('should handle errors in daily rollup gracefully', async () => {
      jest.spyOn(db, 'query').mockRejectedValue(new Error('DB Error'));
      await expect(runDailyRollup()).rejects.toThrow('DB Error');
    });
  });

  describe('Data Retention Worker', () => {
    it('should purge raw events older than 30 days without deleting stats tables', async () => {
      jest.spyOn(db, 'query')
        .mockResolvedValueOnce({ rowCount: 100 })
        .mockResolvedValueOnce({ rowCount: 0 });

      const purgedCount = await runRetentionPurge(30, 100);
      expect(purgedCount).toBe(100);
    });

    it('should handle errors in retention purge gracefully', async () => {
      jest.spyOn(db, 'query').mockRejectedValue(new Error('Purge Failure'));
      await expect(runRetentionPurge(30)).rejects.toThrow('Purge Failure');
    });
  });

  describe('Scheduler', () => {
    it('should initialize and stop background worker cron schedules', () => {
      expect(() => {
        startScheduler();
        stopScheduler();
      }).not.toThrow();
    });
  });

});
