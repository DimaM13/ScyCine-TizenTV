// SkyCine Cinema TV Native Entry Point for Samsung Tizen OS

import './style.css';
import { App } from './app';
import { RemoteLogger } from './logger';

// Initialize remote TV logging to server console immediately
RemoteLogger.init();

// Global error catcher to display any fatal error visually on TV screen
window.onerror = function(message, source, lineno, colno, error) {
  RemoteLogger.error('GLOBAL_ERR', `${message} at ${source}:${lineno}:${colno}`, { stack: error?.stack });
  try {
    const root = document.getElementById('root') || document.body;
    const errBox = document.createElement('div');
    errBox.id = 'skycine-fatal-error';
    errBox.style.cssText = 'position:fixed;top:40px;left:40px;right:40px;padding:32px;background:#180606;border:3px solid #ef4444;border-radius:16px;color:#fca5a5;font-family:monospace;font-size:22px;z-index:999999;box-shadow:0 0 50px rgba(239,68,68,0.5);';
    errBox.innerHTML = '<h2 style="color:#ef4444;margin-bottom:12px;font-size:28px;">SkyCine TV Runtime Error</h2>' +
      '<div style="margin-bottom:8px;color:#ffffff;"><strong>' + String(message) + '</strong></div>' +
      '<div style="font-size:16px;color:#94a3b8;margin-bottom:12px;">' + String(source) + ':' + lineno + ':' + colno + '</div>' +
      '<pre style="white-space:pre-wrap;font-size:14px;color:#cbd5e1;">' + (error && error.stack ? error.stack : '') + '</pre>';
    root.appendChild(errBox);
  } catch (e) {}
};

window.addEventListener('unhandledrejection', function(event) {
  console.error('[SkyCine TV Unhandled Rejection]:', event.reason);
});

function launchApp() {
  try {
    console.log('[SkyCine] DOM Ready State:', document.readyState);
    console.log('[SkyCine] Launching Native App instance...');
    const app = new App();
    app.start();
    console.log('[SkyCine] App launched successfully!');
  } catch (err: any) {
    console.error('[SkyCine] Failed to launch App:', err);
    if ((window as any).onerror) {
      (window as any).onerror(String(err), 'main.ts', 0, 0, err);
    }
  }
}

// Immediate execution if DOM is already parsed (asynchronous SystemJS legacy loader)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', launchApp);
} else {
  launchApp();
}

