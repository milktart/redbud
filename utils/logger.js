// Simple logger that uses console.log for Docker compatibility
// This guarantees output will appear in docker compose logs

class SimpleLogger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'info';
    this.levelValue = { error: 0, warn: 1, info: 2, debug: 3 }[this.level] || 2;
  }

  format(level, message, meta) {
    const timestamp = new Date().toTimeString().slice(0, 8);
    let output = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    if (meta && Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(meta)}`;
    }
    return output;
  }

  error(message, meta) {
    if (this.levelValue >= 0) console.log(this.format('error', message, meta));
  }

  warn(message, meta) {
    if (this.levelValue >= 1) console.log(this.format('warn', message, meta));
  }

  info(message, meta) {
    if (this.levelValue >= 2) console.log(this.format('info', message, meta));
  }

  debug(message, meta) {
    if (this.levelValue >= 3) console.log(this.format('debug', message, meta));
  }
}

const logger = new SimpleLogger();

// Create a stream object for Morgan HTTP logging (optional)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
