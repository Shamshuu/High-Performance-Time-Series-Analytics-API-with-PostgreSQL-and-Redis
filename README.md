# High-Performance Time-Series Analytics API with PostgreSQL and Redis

A production-grade backend service built with Node.js, Express, PostgreSQL, and Redis for high-throughput time-series event ingestion, idempotent background rollups, sliding-window rate limiting, and low-latency analytics querying (<500ms p95).

---

## Architecture Overview

```
                      +---------------------------------------+
                      |         Client Applications           |
                      +---------------------------------------+
                         | (POST /events)     | (GET /analytics)
                         v                    v
           +-----------------------------------------------------+
           |                  API Service                        |
           |  - Express App                                      |
           |  - Redis Sliding-Window Rate Limiter (200 req/min)  |
           |  - Redis Response Cache (60s TTL for /dashboard)    |
           |  - Smart Dynamic Query Router                       |
           +-----------------------------------------------------+
                  /               |                  \
                 /                |                   \
                v                 v                    v
       +-----------------+  +------------+   +-------------------+
       | PostgreSQL DB   |  | Redis DB   |   | Background Workers|
       | - raw_events    |  | - ZSET     |   | - Hourly Rollups  |
       | - hourly_stats  |  |   Rate-Lim |   | - Daily Rollups   |
       | - daily_stats   |  | - Summary  |   | - 30-day Purging  |
       +-----------------+  |   Cache    |   +-------------------+
                            +------------+
```

For full diagram and detailed breakdown, see [ARCHITECTURE.md](file:///c:/GPP/Week28/High-Performance-Time-Series-Analytics-API-with-PostgreSQL-and-Redis/ARCHITECTURE.md).

---

## Features & Implementation Details

- **Time-Series Data Modeling**: PostgreSQL `raw_events` table indexed on `timestamp DESC` and `event_type` with flexible `JSONB` metadata.
- **Idempotent Background Rollups**: Scheduled processes utilizing `INSERT ... ON CONFLICT (bucket_time, event_type) DO UPDATE SET event_count = EXCLUDED.event_count` for safe re-runnable data summarization into `hourly_stats` and `daily_stats`.
- **Sliding Window Rate Limiter**: Redis ZSET implementation (`rate_limit:<ip>`) enforcing a rolling limit of 200 requests/minute per client IP.
- **Dynamic Query Routing**: Intelligently routes queries across pre-aggregated `hourly_stats`/`daily_stats` and unaggregated `raw_events` for real-time accuracy and sub-500ms response times.
- **Dashboard Response Caching**: Redis-backed transparent caching middleware with 60s TTL for `GET /dashboard/summary`.
- **Data Retention & Housekeeping**: Batch purging of `raw_events` older than 30 days while preserving aggregated statistics.

---

## API Documentation

### 1. Ingest Event
- **Endpoint**: `POST /events`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "event_type": "pageview",
    "timestamp": "2023-10-01T14:30:00Z",
    "metadata": { "url": "/home", "user_id": "123" }
  }
  ```
- **Responses**:
  - `201 Created`: Event inserted successfully.
  - `400 Bad Request`: Invalid payload or timestamp format.
  - `429 Too Many Requests`: Exceeded 200 requests per minute.

### 2. Get Aggregated Analytics
- **Endpoint**: `GET /analytics`
- **Query Parameters**:
  - `start_date` (ISO 8601 string, required)
  - `end_date` (ISO 8601 string, required)
  - `interval` (`hour` or `day`, required)
  - `event_type` (string, optional)
- **Response** (`200 OK`):
  ```json
  [
    {
      "bucket": "2023-10-01T14:00:00Z",
      "event_type": "pageview",
      "count": 1540
    }
  ]
  ```

### 3. Get Dashboard Summary
- **Endpoint**: `GET /dashboard/summary`
- **Response** (`200 OK`):
  ```json
  {
    "metrics": [
      { "event_type": "pageview", "last_24h_count": 45000 },
      { "event_type": "signup", "last_24h_count": 120 }
    ]
  }
  ```

---

## Getting Started

### Prerequisites
- Docker & Docker Compose
- Node.js >= 18 (for local non-docker testing)

### Quick Start (Docker Compose)
1. Clone the repository:
   ```bash
   git clone <repo_url>
   cd High-Performance-Time-Series-Analytics-API-with-PostgreSQL-and-Redis
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Start system with Docker Compose:
   ```bash
   docker-compose up -d --build
   ```
4. Verify health status:
   ```bash
   curl http://localhost:8000/health
   ```

### Running Tests & Benchmarks
- **Run Unit & Integration Tests**:
  ```bash
  npm test
  ```
- **Run Test Coverage**:
  ```bash
  npm run test:coverage
  ```
- **Execute Load Test Benchmark**:
  ```bash
  npm run benchmark
  ```