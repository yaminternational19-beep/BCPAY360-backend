/**
 * Centralized Logger Utility
 * Provides structured logging with timestamps and environment awareness.
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// Current log level (default to 1 in dev, 2 in prod)
const CURRENT_LOG_LEVEL = process.env.NODE_ENV === 'production'
    ? LOG_LEVELS.INFO
    : LOG_LEVELS.DEBUG;

const formatMessage = (level, moduleName, message, metadata = null) => {
    const timestamp = new Date().toISOString();
    let logStr = `[${timestamp}] [${level}] [${moduleName}]: ${message}`;

    if (metadata) {
        if (metadata instanceof Error) {
            logStr += `\nStack trace: ${metadata.stack}`;
        } else if (typeof metadata === 'object') {
            logStr += ` | Data: ${JSON.stringify(metadata)}`;
        } else {
            logStr += ` | ${metadata}`;
        }
    }
    return logStr;
};

export const logger = {
    debug: (moduleName, message, metadata) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
            console.debug(formatMessage('DEBUG', moduleName, message, metadata));
        }
    },

    info: (moduleName, message, metadata) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
            console.info(formatMessage('INFO', moduleName, message, metadata));
        }
    },

    warn: (moduleName, message, metadata) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
            console.warn(formatMessage('WARN', moduleName, message, metadata));
        }
    },

    error: (moduleName, message, metadata) => {
        if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
            console.error(formatMessage('ERROR', moduleName, message, metadata));
        }
    }
};

export default logger;
