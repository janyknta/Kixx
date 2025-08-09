// src/services/Logger.ts

declare var __DEV__: boolean;

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

class LoggerService {
  private static instance: LoggerService;
  private logLevel: LogLevel = (typeof __DEV__ !== 'undefined' && __DEV__) ? LogLevel.DEBUG : LogLevel.ERROR;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000; // Keep last 1000 logs in memory

  private constructor() {}

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  /**
   * Set the minimum log level
   */
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Debug level logging (development only)
   */
  public debug(category: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  /**
   * Info level logging
   */
  public info(category: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, category, message, data);
  }

  /**
   * Warning level logging
   */
  public warn(category: string, message: string, data?: any): void {
    this.log(LogLevel.WARN, category, message, data);
  }

  /**
   * Error level logging
   */
  public error(category: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, category, message, data);
  }

  /**
   * Private method to handle all logging
   */
  private log(level: LogLevel, category: string, message: string, data?: any): void {
    if (level < this.logLevel) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data: this.sanitizeData(data),
    };

    // Add to memory logs
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Only output to console in development
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      const timestamp = new Date(logEntry.timestamp).toISOString();
      const levelStr = LogLevel[level];
      const prefix = `[${timestamp}] [${levelStr}] [${category}]`;

      switch (level) {
        case LogLevel.DEBUG:
          console.log(`${prefix} ${message}`, data || '');
          break;
        case LogLevel.INFO:
          console.info(`${prefix} ${message}`, data || '');
          break;
        case LogLevel.WARN:
          console.warn(`${prefix} ${message}`, data || '');
          break;
        case LogLevel.ERROR:
          console.error(`${prefix} ${message}`, data || '');
          break;
      }
    }
  }

  /**
   * Sanitize data to remove sensitive information
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    try {
      const dataStr = JSON.stringify(data);
      // Remove potential sensitive data patterns
      const sanitized = dataStr
        .replace(/("masterKey"\s*:\s*")[^"]*"/g, '$1[REDACTED]"')
        .replace(/("password"\s*:\s*")[^"]*"/g, '$1[REDACTED]"')
        .replace(/("pin"\s*:\s*")[^"]*"/g, '$1[REDACTED]"')
        .replace(/("key"\s*:\s*")[^"]*"/g, '$1[REDACTED]"')
        .replace(/("token"\s*:\s*")[^"]*"/g, '$1[REDACTED]"');
      
      return JSON.parse(sanitized);
    } catch {
      return '[INVALID_DATA]';
    }
  }

  /**
   * Get recent logs (for debugging or crash reporting)
   */
  public getLogs(count?: number): LogEntry[] {
    const logCount = count || this.logs.length;
    return this.logs.slice(-logCount);
  }

  /**
   * Clear all logs from memory
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get formatted logs as string (for crash reporting)
   */
  public getLogsAsString(count?: number): string {
    const logs = this.getLogs(count);
    return logs
      .map(log => {
        const timestamp = new Date(log.timestamp).toISOString();
        const levelStr = LogLevel[log.level];
        const dataStr = log.data ? ` | Data: ${JSON.stringify(log.data)}` : '';
        return `[${timestamp}] [${levelStr}] [${log.category}] ${log.message}${dataStr}`;
      })
      .join('\n');
  }
}

// Export singleton instance
export const Logger = LoggerService.getInstance();

// Export convenience functions
export const logDebug = (category: string, message: string, data?: any) => 
  Logger.debug(category, message, data);

export const logInfo = (category: string, message: string, data?: any) => 
  Logger.info(category, message, data);

export const logWarn = (category: string, message: string, data?: any) => 
  Logger.warn(category, message, data);

export const logError = (category: string, message: string, data?: any) => 
  Logger.error(category, message, data);