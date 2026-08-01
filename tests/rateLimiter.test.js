const request = require('supertest');
const db = require('../src/db');
const app = require('../src/app');

describe('Rate Limiter Unit & Integration Tests', () => {

  it('should enforce 200 requests per minute limit per client IP address returning 429', async () => {
    let callCount = 0;
    
    // Spy or mock db query so POST /events doesn't wait on external DB
    jest.spyOn(db, 'query').mockImplementation(async () => {
      return {
        rows: [{
          id: 'test-uuid-999',
          event_type: 'test_rate_limit',
          timestamp: new Date().toISOString(),
          metadata: {}
        }]
      };
    });

    // Mock redisClient to return > 200 count after 200 calls
    jest.spyOn(db.redisClient, 'multi').mockImplementation(() => ({
      zremrangebyscore: jest.fn(),
      zadd: jest.fn(),
      zcard: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockImplementation(async () => {
        callCount++;
        return [
          [null, 0],
          [null, 1],
          [null, callCount], // zcard return value
          [null, 1]
        ];
      })
    }));

    const targetIp = '203.0.113.45';
    let hit429 = false;

    for (let i = 0; i < 205; i++) {
      const res = await request(app)
        .post('/events')
        .set('X-Forwarded-For', targetIp)
        .send({ event_type: 'test_rate_limit' });

      if (res.statusCode === 429) {
        hit429 = true;
        expect(res.body).toHaveProperty('error', 'Too Many Requests');
        break;
      }
    }

    expect(hit429).toBe(true);
  });

});
