const { v4: uuidv4 } = require('uuid');
const { redisClient } = require('../db');

// In-memory fallback if Redis is down or unavailable
const inMemoryStore = new Map();

async function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const windowStart = now - 60000; // 60 seconds ago
  const key = `rate_limit:${ip}`;

  try {
    if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
      await redisClient.connect().catch(() => {});
    }

    const member = `${now}-${uuidv4()}`;
    const multi = redisClient.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, member);
    multi.zcard(key);
    multi.expire(key, 60);

    const results = await multi.exec();
    
    // results[2][1] contains the count from zcard
    const requestCount = results && results[2] ? results[2][1] : 1;

    if (requestCount > 200) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Maximum 200 requests per minute allowed.'
      });
    }

    return next();
  } catch (err) {
    // Fallback to in-memory sliding window algorithm if Redis fails
    let timestamps = inMemoryStore.get(ip) || [];
    timestamps = timestamps.filter(ts => ts > windowStart);
    timestamps.push(now);
    inMemoryStore.set(ip, timestamps);

    if (timestamps.length > 200) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Maximum 200 requests per minute allowed.'
      });
    }

    return next();
  }
}

module.exports = rateLimiter;
