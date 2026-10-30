// ════════════════════════════════════════════════════════════════════════════
//  Logger - Simple structured logger with levels
//  No external dependencies
// ════════════════════════════════════════════════════════════════════════════

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  http: 1,
};

const LEVEL_NAMES = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
};

const currentLevel = LEVELS[LOG_LEVEL] ?? 1;

function formatMessage(level, message, data) {
  const timestamp = new Date().toISOString();
  const levelName = LEVEL_NAMES[level] || 'INFO';
  
  let msg = `[${timestamp}] ${levelName}: ${message}`;
  if (data && Object.keys(data).length > 0) {
    msg += ' ' + JSON.stringify(data);
  }
  return msg;
}

function log(level, message, data = {}) {
  if (level < currentLevel) return;
  
  const formatted = formatMessage(level, message, data);
  
  if (level >= 3) {
    console.error(formatted);
  } else if (level >= 2) {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

const logger = {
  debug: (message, data) => log(0, message, data),
  info: (message, data) => log(1, message, data),
  warn: (message, data) => log(2, message, data),
  error: (message, data) => log(3, message, data),
  http: (message, data) => log(1, message, data),
};

function createChildLogger(module) {
  return {
    debug: (message, data) => log(0, `[${module}] ${message}`, data),
    info: (message, data) => log(1, `[${module}] ${message}`, data),
    warn: (message, data) => log(2, `[${module}] ${message}`, data),
    error: (message, data) => log(3, `[${module}] ${message}`, data),
    http: (message, data) => log(1, `[${module}] ${message}`, data),
  };
}

const compatLogger = {
  info: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.info(msg, args[0]);
    } else {
      logger.info(msg + ' ' + args.join(' '));
    }
  },
  warn: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.warn(msg, args[0]);
    } else {
      logger.warn(msg + ' ' + args.join(' '));
    }
  },
  error: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.error(msg, args[0]);
    } else {
      logger.error(msg + ' ' + args.join(' '));
    }
  },
  debug: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.debug(msg, args[0]);
    } else {
      logger.debug(msg + ' ' + args.join(' '));
    }
  },
  http: (msg, ...args) => {
    if (args.length > 0 && typeof args[0] === 'object') {
      logger.http(msg, args[0]);
    } else {
      logger.http(msg + ' ' + args.join(' '));
    }
  },
};

module.exports = {
  logger,
  createChildLogger,
  compatLogger,
  info: (msg, data) => logger.info(msg, data),
  warn: (msg, data) => logger.warn(msg, data),
  error: (msg, data) => logger.error(msg, data),
  debug: (msg, data) => logger.debug(msg, data),
  http: (msg, data) => logger.http(msg, data),
};
