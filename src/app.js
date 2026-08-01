const express = require('express');
const { initDb } = require('./db');
const eventsRouter = require('./api/events');
const analyticsRouter = require('./api/analytics');
const dashboardRouter = require('./api/dashboard');
const { startScheduler } = require('./workers/scheduler');
require('dotenv').config();

const app = express();
app.set('trust proxy', true);
app.use(express.json());

// Routes
app.use('/events', eventsRouter);
app.use('/analytics', analyticsRouter);
app.use('/dashboard', dashboardRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Requested endpoint does not exist' });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled express error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const PORT = process.env.PORT || 8000;

if (require.main === module) {
  (async () => {
    try {
      await initDb();
      console.log('Database initialized successfully.');

      if (process.env.DISABLE_WORKERS !== 'true') {
        startScheduler();
      }

      app.listen(PORT, () => {
        console.log(`Analytics API Service running on port ${PORT}`);
      });
    } catch (err) {
      console.error('Failed to initialize and start API service:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = app;
