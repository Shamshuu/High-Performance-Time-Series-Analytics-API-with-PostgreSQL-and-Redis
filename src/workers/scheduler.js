const cron = require('node-cron');
const { runHourlyRollup } = require('./hourlyWorker');
const { runDailyRollup } = require('./dailyWorker');
const { runRetentionPurge } = require('./retentionWorker');

let cronTasks = [];

function startScheduler() {
  stopScheduler();
  console.log('Starting background worker scheduler...');

  const task1 = cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron] Running hourly rollup worker...');
    try {
      await runHourlyRollup();
    } catch (err) {
      console.error('[Cron] Hourly rollup worker failed:', err.message);
    }
  });

  const task2 = cron.schedule('10 * * * *', async () => {
    console.log('[Cron] Running daily rollup worker...');
    try {
      await runDailyRollup();
    } catch (err) {
      console.error('[Cron] Daily rollup worker failed:', err.message);
    }
  });

  const task3 = cron.schedule('0 2 * * *', async () => {
    console.log('[Cron] Running data retention worker...');
    try {
      await runRetentionPurge(30);
    } catch (err) {
      console.error('[Cron] Data retention worker failed:', err.message);
    }
  });

  cronTasks = [task1, task2, task3];
  return cronTasks;
}

function stopScheduler() {
  cronTasks.forEach(task => {
    if (task && typeof task.stop === 'function') {
      task.stop();
    }
  });
  cronTasks = [];
}

module.exports = { startScheduler, stopScheduler };
