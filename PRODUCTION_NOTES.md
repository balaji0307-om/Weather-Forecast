# Production Readiness Notes

This project is intentionally small enough to run locally, but the backend is structured so it can grow toward production.

## Already Added

- Environment-based configuration through `.env` values.
- Optional API token protection with `WEATHER_API_TOKEN`.
- Per-IP rate limiting for API endpoints.
- Async provider calls with `httpx.AsyncClient`.
- Short-lived API response caching.
- SQLite persistence for recent searches.
- Basic request logging and security headers.
- Pytest API tests for health, recent searches, auth, and rate limiting.
- Fast initial weather response with observation and air-quality details loaded separately.
- Reused async HTTP connections for lower provider-request overhead.
- Direct public-forecast loading in the frontend so backend cold starts do not blank the first screen.

## Production Upgrade Path

- Replace SQLite with PostgreSQL or MySQL when the app needs concurrent writes, migrations, backups, and multi-instance deployment.
- Replace in-memory `response_cache` with Redis so cached weather responses survive restarts and work across multiple servers.
- Replace in-memory `rate_limit_hits` with Redis-based rate limiting so limits are shared across load-balanced instances.
- Add real user authentication only if product requirements need accounts, saved dashboards, or private user data. JWT access tokens with refresh tokens would be a common approach.
- Add structured JSON logs and external monitoring for deployed environments.
