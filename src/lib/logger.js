// ════════════════════════════════════════════════════════════════════════════
//  ICT GOLD BOT PRO — Logger v1.0
// ════════════════════════════════════════════════════════════════════════════

const winston = require('winston');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'ISO-8601' }),
  winston.format.json()
);

const logger = winston.createLogger({
  levels,
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10485760,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: fileFormat,
      maxsize: 10485760,
      maxFiles: 10,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'trades.log'),
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'ISO-8601' }),
        winston.format.printf((info) => {
          if (info.message.includes('TRADE')) {
            return JSON.stringify(info);
          }
          return null;
        })
      ),
      maxsize: 10485760,
      maxFiles: 5,
    }),
  ],
});

logger.stream = {
  write: (message) => logger.http(message.trim()),
};

logger.createChild = (context) => {
  return logger.child({ context });
};

module.exports = logger;
