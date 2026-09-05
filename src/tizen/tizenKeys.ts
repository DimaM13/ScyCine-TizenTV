// Samsung Smart TV Tizen Hardware Key Codes
export const TIZEN_KEYS = {
  // Navigation
  KEY_LEFT: 37,
  KEY_UP: 38,
  KEY_RIGHT: 39,
  KEY_DOWN: 40,
  KEY_ENTER: 13,
  KEY_RETURN: 10009, // Tizen TV Back/Return key

  // Media Controls
  KEY_PLAY: 415,
  KEY_PAUSE: 19,
  KEY_PLAY_PAUSE: 10252,
  KEY_STOP: 413,
  KEY_FAST_FORWARD: 417,
  KEY_REWIND: 412,

  // Color Keys
  KEY_RED: 403,
  KEY_GREEN: 404,
  KEY_YELLOW: 405,
  KEY_BLUE: 406,

  // Numbers
  KEY_0: 48,
  KEY_1: 49,
  KEY_2: 50,
  KEY_3: 51,
  KEY_4: 52,
  KEY_5: 53,
  KEY_6: 54,
  KEY_7: 55,
  KEY_8: 56,
  KEY_9: 57
};

/**
 * Registers special hardware keys with Tizen TV input device system.
 * Needs to be called on application startup.
 */
export function registerTizenKeys() {
  if (typeof window === 'undefined') return;

  const tizen = (window as any).tizen;
  if (!tizen || !tizen.tvinputdevice) {
    console.log('[TizenKeys] Not running on Samsung Tizen OS device. Using standard keyboard events.');
    return;
  }

  const keysToRegister = [
    'MediaPlay',
    'MediaPause',
    'MediaPlayPause',
    'MediaFastForward',
    'MediaRewind',
    'MediaStop',
    'ColorF0Red',
    'ColorF1Green',
    'ColorF2Yellow',
    'ColorF3Blue',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
  ];

  keysToRegister.forEach((keyName) => {
    try {
      tizen.tvinputdevice.registerKey(keyName);
    } catch (e) {
      console.warn(`[TizenKeys] Could not register key: ${keyName}`, e);
    }
  });

  console.log('[TizenKeys] Samsung Smart TV input keys registered successfully.');
}

/**
 * Handles TV exit when user presses Back on the root screen.
 */
export function exitTizenApp() {
  const tizen = (window as any).tizen;
  if (tizen && tizen.application) {
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (e) {
      console.error('[TizenKeys] Failed to exit Tizen app:', e);
    }
  } else {
    console.log('[TizenKeys] exitTizenApp called (in browser environment)');
  }
}
