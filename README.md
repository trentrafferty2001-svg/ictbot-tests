# ICT Gold Bot Pro v13.0

Advanced algorithmic trading bot implementing ICT (Inner Circle Trader) methodology for Gold (XAUUSD), Bitcoin (BTC), and Nasdaq (NAS100) trading.

## 🚀 Features

- **ICT Methodology** - Full implementation of FVG, OB, MSS, Liquidity Sweeps, OTE, Silver Bullet, and Power of 3
- **Multi-Symbol Support** - Trade Gold, Bitcoin, and Nasdaq with symbol-aware parameters
- **Database Persistence** - PostgreSQL with Prisma ORM for reliable state management
- **Real-time Monitoring** - Live price feed, position tracking, and performance metrics
- **Telegram Integration** - Full bot control and alerts via Telegram
- **Circuit Breakers** - Protects against cascading failures
- **Comprehensive Logging** - Winston-based structured logging with rotation
- **Health Checks** - Automated health monitoring with alerts
- **Backtesting** - Validate strategies on historical data
- **Web Dashboard** - Full-featured UI for monitoring and control

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis (optional, for caching)
- MetaAPI account with deployed MT4/MT5

## 🛠️ Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
