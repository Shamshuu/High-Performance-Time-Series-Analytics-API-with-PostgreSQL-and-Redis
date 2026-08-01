const request = require('supertest');
const db = require('../src/db');
const app = require('../src/app');

// Mock db query and redis client for reliable unit testing
jest.mock('../src/db', () => {
  const original = jest.requireActual('../src/db');
  return {
    ...original,
    query: jest.fn(),
    redisClient: {
      status: 'ready',
      connect: jest.fn().mockResolvedValue(true),
      multi: jest.fn().mockReturnValue({
        zremrangebyscore: jest.fn(),
        zadd: jest.fn(),
        zcard: jest.fn(),
        expire: jest.fn(),
        exec: jest.fn().mockResolvedValue([
          [null, 0],
          [null, 1],
          [null, 5],
          [null, 1]
        ])
      }),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK')
    }
  };
});

describe('API Endpoints Contract & Logic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /events (Ingestion API)', () => {
    it('should return 400 Bad Request if event_type is missing', async () => {
      const res = await request(app)
        .post('/events')
        .send({ timestamp: new Date().toISOString() });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Bad Request');
    });

    it('should return 400 Bad Request if timestamp is invalid ISO 8601 string', async () => {
      const res = await request(app)
        .post('/events')
        .send({ event_type: 'click', timestamp: 'invalid-date-string' });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Bad Request');
    });

    it('should accept valid event and default timestamp to UTC if omitted', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1234',
          event_type: 'pageview',
          timestamp: new Date().toISOString(),
          metadata: { url: '/home' }
        }]
      });

      const res = await request(app)
        .post('/events')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ event_type: 'pageview', metadata: { url: '/home' } });

      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('event_type', 'pageview');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return 500 when database insertion fails', async () => {
      db.query.mockRejectedValueOnce(new Error('Database Connection Error'));

      const res = await request(app)
        .post('/events')
        .send({ event_type: 'signup' });

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('GET /analytics (Analytics API)', () => {
    it('should return 400 Bad Request if required query params are missing', async () => {
      const res = await request(app).get('/analytics');
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('error', 'Bad Request');
    });

    it('should return 400 Bad Request if interval is invalid', async () => {
      const res = await request(app).get('/analytics?start_date=2023-10-01T00:00:00Z&end_date=2023-10-02T00:00:00Z&interval=invalid');
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain('interval must be either');
    });

    it('should return 400 Bad Request if dates are not valid ISO 8601', async () => {
      const res = await request(app).get('/analytics?start_date=bad-date&end_date=2023-10-02T00:00:00Z&interval=hour');
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain('valid ISO 8601');
    });

    it('should return 400 Bad Request if start_date is after end_date', async () => {
      const res = await request(app).get('/analytics?start_date=2023-10-05T00:00:00Z&end_date=2023-10-02T00:00:00Z&interval=hour');
      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain('start_date cannot be after end_date');
    });

    it('should return 200 OK with aggregated buckets array for hour interval', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          bucket: new Date('2023-10-01T14:00:00Z'),
          event_type: 'pageview',
          count: '1540'
        }]
      });

      const start = '2023-10-01T00:00:00Z';
      const end = '2023-10-02T00:00:00Z';
      const res = await request(app).get(`/analytics?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&interval=hour&event_type=pageview`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('count', 1540);
    });

    it('should return 200 OK with aggregated buckets array for day interval', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          bucket: new Date('2023-10-01T00:00:00Z'),
          event_type: 'pageview',
          count: '5000'
        }]
      });

      const start = '2023-10-01T00:00:00Z';
      const end = '2023-10-02T00:00:00Z';
      const res = await request(app).get(`/analytics?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&interval=day`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('count', 5000);
    });

    it('should return 500 when analytics database query fails', async () => {
      db.query.mockRejectedValueOnce(new Error('Analytics DB Failure'));

      const start = '2023-10-01T00:00:00Z';
      const end = '2023-10-02T00:00:00Z';
      const res = await request(app).get(`/analytics?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&interval=hour`);

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('GET /dashboard/summary (Dashboard Summary & Caching)', () => {
    it('should return 200 OK with metrics array on cache miss', async () => {
      db.redisClient.get.mockResolvedValueOnce(null);
      db.query.mockResolvedValueOnce({
        rows: [
          { event_type: 'pageview', last_24h_count: '45000' },
          { event_type: 'signup', last_24h_count: '120' }
        ]
      });

      const res = await request(app).get('/dashboard/summary');

      expect(res.statusCode).toEqual(200);
      expect(res.headers['x-cache']).toEqual('MISS');
      expect(res.body).toHaveProperty('metrics');
      expect(res.body.metrics[0]).toEqual({ event_type: 'pageview', last_24h_count: 45000 });
    });

    it('should return cached metrics on cache hit without querying database', async () => {
      const cachedPayload = JSON.stringify({
        metrics: [{ event_type: 'pageview', last_24h_count: 45000 }]
      });
      db.redisClient.get.mockResolvedValueOnce(cachedPayload);

      const res = await request(app).get('/dashboard/summary');

      expect(res.statusCode).toEqual(200);
      expect(res.headers['x-cache']).toEqual('HIT');
      expect(res.body.metrics[0]).toEqual({ event_type: 'pageview', last_24h_count: 45000 });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('should return 500 if dashboard query fails', async () => {
      db.redisClient.get.mockResolvedValueOnce(null);
      db.query.mockRejectedValueOnce(new Error('Dashboard DB error'));

      const res = await request(app).get('/dashboard/summary');

      expect(res.statusCode).toEqual(500);
      expect(res.body).toHaveProperty('error', 'Internal Server Error');
    });
  });

  describe('GET /health & 404 Route', () => {
    it('should return 200 OK on /health', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('status', 'OK');
    });

    it('should return 404 Not Found for non-existent route', async () => {
      const res = await request(app).get('/non-existent-route');
      expect(res.statusCode).toEqual(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });
  });

});
