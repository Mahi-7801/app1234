import { AppState, AppStateStatus } from 'react-native';

/**
 * Session Manager - Handles signing session security.
 * 
 * When the app goes to background during/after signing,
 * the session is invalidated and PIN re-verification is required on return.
 * 
 * CCA Rule 2: PIN verification state is managed securely.
 * CCA Rule 5: Session invalidation is logged for audit trail.
 */
class SessionManager {
  private static _instance: SessionManager;
  private static _sessionValid: boolean = false;
  private static _lastActivityTime: number = Date.now();
  private static _sessionTimeout: number = 30000; // 30 seconds timeout
  private static _appStateSubscription: any = null;
  private static _onSessionInvalidated: (() => void) | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): SessionManager {
    if (!SessionManager._instance) {
      SessionManager._instance = new SessionManager();
    }
    return SessionManager._instance;
  }

  /**
   * Start monitoring app state changes.
   * When app goes to background, invalidate session.
   */
  static startMonitoring(onSessionInvalidated: () => void) {
    SessionManager._onSessionInvalidated = onSessionInvalidated;

    // Remove existing subscription if any
    if (SessionManager._appStateSubscription) {
      SessionManager._appStateSubscription.remove();
    }

    SessionManager._appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          // App is going to background - invalidate session
          SessionManager.invalidateSession();
        } else if (nextState === 'active') {
          // App is coming to foreground - check if session is still valid
          if (!SessionManager._sessionValid) {
            // Session was invalidated while in background
            SessionManager._onSessionInvalidated?.();
          }
        }
      }
    );
  }

  /**
   * Stop monitoring app state changes.
   */
  static stopMonitoring() {
    if (SessionManager._appStateSubscription) {
      SessionManager._appStateSubscription.remove();
      SessionManager._appStateSubscription = null;
    }
  }

  /**
   * Mark session as valid after PIN verification.
   */
  static validateSession() {
    SessionManager._sessionValid = true;
    SessionManager._lastActivityTime = Date.now();
  }

  /**
   * Invalidate the current session (requires PIN re-verification).
   */
  static invalidateSession() {
    if (SessionManager._sessionValid) {
      // Log session invalidation for audit trail
      console.log('[SessionManager] Session invalidated at', new Date().toISOString());
    }
    SessionManager._sessionValid = false;
  }

  /**
   * Check if the current session is valid.
   * Session is invalid if:
   * 1. PIN was never verified, OR
   * 2. Session timed out (30 seconds of inactivity), OR
   * 3. App was backgrounded
   */
  static isSessionValid(): boolean {
    if (!SessionManager._sessionValid) {
      return false;
    }

    // Check for session timeout
    const timeSinceLastActivity = Date.now() - SessionManager._lastActivityTime;
    if (timeSinceLastActivity > SessionManager._sessionTimeout) {
      SessionManager.invalidateSession();
      return false;
    }

    // Update last activity time
    SessionManager._lastActivityTime = Date.now();
    return true;
  }

  /**
   * Get remaining session time in seconds.
   */
  static getRemainingSessionTime(): number {
    const timeSinceLastActivity = Date.now() - SessionManager._lastActivityTime;
    const remaining = Math.max(0, (SessionManager._sessionTimeout - timeSinceLastActivity) / 1000);
    return Math.floor(remaining);
  }

  /**
   * Reset session completely (on logout or new signing flow).
   */
  static resetSession() {
    SessionManager._sessionValid = false;
    SessionManager._lastActivityTime = Date.now();
  }
}

export default SessionManager;
