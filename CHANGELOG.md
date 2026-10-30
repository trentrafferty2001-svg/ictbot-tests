# Changelog

## [12.0.0] - 2026-06-19

### Added
- Complete CI/CD pipeline with GitHub Actions
- Docker support with Dockerfile
- Health check endpoint
- Backup and restore scripts
- Environment validation on startup
- Graceful shutdown handling
- Memory usage monitoring
- Metrics collection
- Structured logging with Winston
- Rate limiting with express-rate-limit
- Security headers with Helmet

### Fixed
- Race condition in state writes
- Cron lock vulnerability
- Telegram queue memory leak
- Rate limit store growth
- Markdown injection vulnerability

## [11.0.0] - 2026-06-10

### Added
- State backup restoration
- Distributed lock for cron
- Trade verification retry with backoff

## [10.0.0] - 2026-06-01

### Added
- ICT analysis (FVG, OB, MSS, OTE)
- Multi-timeframe analysis
- Risk management
- Position management with TP1/TP2/TP3
- A/B testing framework
