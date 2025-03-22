import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

/**
 * Log levels for tracking events
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

/**
 * Types of events to log
 */
export enum EventType {
  AUTH = 'auth',
  API = 'api',
  SQUARE = 'square',
  WEBHOOK = 'webhook',
  TOKEN = 'token',
  SYSTEM = 'system'
}

/**
 * Log an event to Firestore and function logs
 */
export const logEvent = async (
  eventType: EventType,
  level: LogLevel,
  message: string,
  data?: any,
  userId?: string
) => {
  try {
    // Prepare log entry
    const logEntry = {
      eventType,
      level,
      message,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ...(data && { data }),
      ...(userId && { userId })
    };

    // Write to Firestore
    await admin.firestore().collection('system_logs').add(logEntry);

    // Also log to function logs
    const logData = {
      eventType,
      ...(data && { data }),
      ...(userId && { userId })
    };

    switch (level) {
      case LogLevel.DEBUG:
        logger.debug(message, logData);
        break;
      case LogLevel.INFO:
        logger.info(message, logData);
        break;
      case LogLevel.WARNING:
        logger.warn(message, logData);
        break;
      case LogLevel.ERROR:
        logger.error(message, logData);
        break;
      default:
        logger.info(message, logData);
    }

    return true;
  } catch (error) {
    // If logging fails, at least try to log the error to function logs
    logger.error('Failed to log event to Firestore', {
      eventType,
      level,
      message,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
};

/**
 * Log an authentication event
 */
export const logAuthEvent = async (
  level: LogLevel,
  message: string,
  data?: any,
  userId?: string
) => {
  return logEvent(EventType.AUTH, level, message, data, userId);
};

/**
 * Log a Square API event
 */
export const logSquareEvent = async (
  level: LogLevel,
  message: string,
  data?: any,
  userId?: string
) => {
  return logEvent(EventType.SQUARE, level, message, data, userId);
};

/**
 * Logs errors with consistent format
 */
export const logError = async (
  eventType: EventType,
  message: string,
  error: any,
  userId?: string
) => {
  const errorData = {
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined
  };

  return logEvent(
    eventType,
    LogLevel.ERROR,
    message,
    errorData,
    userId
  );
}; 