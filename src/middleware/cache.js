const { redisClient } = require('../db');

function cacheMiddleware(ttlSeconds = 60) {
  return async (req, res, next) => {
    // Generate deterministic cache key based on path and query parameters
    const queryString = Object.keys(req.query)
      .sort()
      .map(k => `${k}=${req.query[k]}`)
      .join('&');
    
    const cacheKey = `cache:${req.path}${queryString ? ':' + queryString : ''}`;

    try {
      if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
        await redisClient.connect().catch(() => {});
      }

      const cachedData = await redisClient.get(cacheKey);

      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cachedData));
      }

      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = (body) => {
        // Intercept response and write to Redis with TTL
        if (res.statusCode === 200) {
          redisClient.setex(cacheKey, ttlSeconds, JSON.stringify(body)).catch((err) => {
            console.error('Failed to set redis cache:', err.message);
          });
        }
        return originalJson(body);
      };

      return next();
    } catch (err) {
      // Fall through to database if Redis fails
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }
  };
}

module.exports = cacheMiddleware;
