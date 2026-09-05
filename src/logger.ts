import { Preferences } from './storage/preferences';

export class RemoteLogger {
  private static queue: Array<{ level: string; tag: string; message: string; data?: any }> = [];
  private static isFlushing: boolean = false;
  private static isInitialized: boolean = false;

  public static init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    // Capture global JS unhandled errors
    window.addEventListener('error', (event) => {
      this.error('GLOBAL_ERR', `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, {
        error: event.error ? event.error.stack || event.error.message : null
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.error('PROMISE_REJECTION', 'Unhandled Promise Rejection', {
        reason: event.reason ? (event.reason.stack || event.reason.message || String(event.reason)) : null
      });
    });

    this.info('TIZEN_APP', 'RemoteLogger initialized on Samsung Smart TV');
  }

  public static info(tag: string, message: string, data?: any) {
    console.log(`[${tag}] ${message}`, data !== undefined ? data : '');
    this.enqueue('info', tag, message, data);
  }

  public static warn(tag: string, message: string, data?: any) {
    console.warn(`[${tag}] ${message}`, data !== undefined ? data : '');
    this.enqueue('warn', tag, message, data);
  }

  public static error(tag: string, message: string, data?: any) {
    console.error(`[${tag}] ${message}`, data !== undefined ? data : '');
    this.enqueue('error', tag, message, data);
  }

  private static enqueue(level: string, tag: string, message: string, data?: any) {
    this.queue.push({ level, tag, message, data });
    this.scheduleFlush();
  }

  private static scheduleFlush() {
    if (this.isFlushing) return;
    this.isFlushing = true;

    setTimeout(() => {
      this.flushQueue();
    }, 100);
  }

  private static async flushQueue() {
    if (this.queue.length === 0) {
      this.isFlushing = false;
      return;
    }

    const itemsToSend = [...this.queue];
    this.queue = [];

    const serverUrl = Preferences.getServerUrl();
    if (!serverUrl) {
      this.isFlushing = false;
      return;
    }

    for (const item of itemsToSend) {
      try {
        await fetch(`${serverUrl}/api/debug/tizen-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      } catch (e) {
        // Network error, ignore to prevent recursive errors
      }
    }

    this.isFlushing = false;
    if (this.queue.length > 0) {
      this.scheduleFlush();
    }
  }
}
