import { WebView } from 'react-native-webview';
import DSCService from './DSCService';
import BackendService from './BackendService';

/**
 * WebView Bridge - Injects window.SignBridge into WebViews.
 * 
 * Allows hybrid/web content to call native signing functions
 * regardless of the web app's own framework.
 * 
 * CCA Compliance:
 * - Rule 1: Private keys never leave hardware token
 * - Rule 2: PIN handled securely in native layer
 * - Rule 3: PAdES/CAdES signatures with timestamps
 * - Rule 4: Retry limits enforced by token
 * - Rule 5: Audit trail logging
 */

/**
 * JavaScript code to inject into WebView.
 * Creates window.SignBridge interface for web apps.
 */
const INJECTED_JAVASCRIPT = `
(function() {
  // Prevent multiple injections
  if (window.SignBridge) return;

  /**
   * window.SignBridge - Native signing interface for web apps.
   * 
   * CCA Rule 1: All operations delegate to hardware token.
   * CCA Rule 2: PIN verification happens on token.
   */
  window.SignBridge = {
    /**
     * Lists connected DSC dongles.
     * @returns {Promise<Array>} Array of token info objects
     */
    listTokens: function() {
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'LIST_TOKENS',
          id: Date.now()
        }));
        
        // Response handler will be set up by native bridge
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    },

    /**
     * Connects to a DSC dongle.
     * @param {string} serialNumber - Serial number of the dongle
     * @returns {Promise<boolean>} Connection status
     */
    connectDevice: function(serialNumber) {
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CONNECT_DEVICE',
          serialNumber: serialNumber,
          id: Date.now()
        }));
        
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    },

    /**
     * Verifies PIN on the hardware token.
     * 
     * CCA Rule 2: PIN is sent directly to hardware token.
     * 
     * @param {string} pin - User's PIN
     * @returns {Promise<boolean>} Verification result
     */
    verifyPin: function(pin) {
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'VERIFY_PIN',
          pin: pin,
          id: Date.now()
        }));
        
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    },

    /**
     * Gets certificate from the token.
     * 
     * CCA Rule 1: Certificate retrieval does not expose private key.
     * 
     * @returns {Promise<Object>} Certificate info
     */
    getCertificate: function() {
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'GET_CERTIFICATE',
          id: Date.now()
        }));
        
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    },

    /**
     * Signs a document hash using the hardware token.
     * 
     * CCA Rule 1: Signing happens entirely on the hardware token.
     * 
     * @param {string} documentHash - Hash of the document to sign (hex)
     * @param {string} algorithm - Signing algorithm (default: SHA256WithRSA)
     * @returns {Promise<Object>} Signature object
     */
    sign: function(documentHash, algorithm) {
      algorithm = algorithm || 'SHA256WithRSA';
      
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SIGN',
          documentHash: documentHash,
          algorithm: algorithm,
          id: Date.now()
        }));
        
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    },

    /**
     * Disconnects from the current device.
     * @returns {Promise<boolean>} Disconnection status
     */
    disconnect: function() {
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DISCONNECT',
          id: Date.now()
        }));
        
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    },

    /**
     * Generates a document hash via the backend.
     * 
     * CCA Rule 3: Hash generation for signing.
     * 
     * @param {string} documentId - ID of the document to hash
     * @returns {Promise<Object>} Hash result
     */
    hashDocument: function(documentId) {
      return new Promise((resolve, reject) => {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HASH_DOCUMENT',
          documentId: documentId,
          id: Date.now()
        }));
        
        window._signBridgeCallbacks = window._signBridgeCallbacks || {};
        window._signBridgeCallbacks[Date.now()] = { resolve, reject };
      });
    }
  };

  // Notify web app that SignBridge is ready
  window.dispatchEvent(new Event('SignBridgeReady'));
  
  console.log('[SignBridge] Native signing interface injected successfully');
})();
`;

/**
 * WebView Bridge component.
 * Injects window.SignBridge into WebViews for hybrid app support.
 */
export class WebViewBridge {
  private webViewRef: React.RefObject<WebView>;

  constructor(webViewRef: React.RefObject<WebView>) {
    this.webViewRef = webViewRef;
  }

  /**
   * Gets the JavaScript to inject into the WebView.
   */
  static getInjectedJavaScript(): string {
    return INJECTED_JAVASCRIPT;
  }

  /**
   * Handles messages from the WebView.
   * Call this in WebView's onMessage handler.
   */
  async handleMessage(event: any): Promise<void> {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      const { type, id } = data;

      let result: any;

      switch (type) {
        case 'LIST_TOKENS':
          result = await DSCService.listTokens();
          break;

        case 'CONNECT_DEVICE':
          result = await DSCService.connectDevice(data.serialNumber);
          break;

        case 'VERIFY_PIN':
          result = await DSCService.verifyPin(data.pin);
          break;

        case 'GET_CERTIFICATE':
          result = await DSCService.getCertificate();
          break;

        case 'SIGN':
          result = await DSCService.sign(data.documentHash, data.algorithm);
          break;

        case 'DISCONNECT':
          result = await DSCService.disconnect();
          break;

        case 'HASH_DOCUMENT':
          result = await BackendService.hashDocument(data.documentId);
          break;

        default:
          throw new Error('Unknown message type: ' + type);
      }

      // Send result back to WebView
      this.sendToWebView({
        type: 'RESPONSE',
        id: id,
        success: true,
        result: result,
      });

    } catch (error: any) {
      this.sendToWebView({
        type: 'RESPONSE',
        id: data?.id,
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * Sends a message to the WebView.
   */
  private sendToWebView(data: any): void {
    this.webViewRef.current?.injectJavaScript(`
      window._handleSignBridgeResponse(${JSON.stringify(data)});
    `);
  }
}

/**
 * Example HTML test page for verifying the WebView bridge works.
 */
export const TEST_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>DSC Signing Test</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    button { padding: 10px 20px; margin: 10px; font-size: 16px; }
    #result { margin-top: 20px; padding: 10px; background: #f5f5f5; }
    .success { color: green; }
    .error { color: red; }
  </style>
</head>
<body>
  <h1>DSC Signing Bridge Test</h1>
  
  <button onclick="testListTokens()">List Tokens</button>
  <button onclick="testGetCertificate()">Get Certificate</button>
  <button onclick="testSign()">Sign Hash</button>
  
  <div id="result">Ready...</div>

  <script>
    // Response handler for SignBridge
    window._handleSignBridgeResponse = function(data) {
      const resultDiv = document.getElementById('result');
      if (data.success) {
        resultDiv.innerHTML = '<span class="success">Success:</span> ' + 
          JSON.stringify(data.result, null, 2);
      } else {
        resultDiv.innerHTML = '<span class="error">Error:</span> ' + data.error;
      }
    };

    // Wait for SignBridge to be ready
    window.addEventListener('SignBridgeReady', function() {
      console.log('SignBridge is ready!');
    });

    async function testListTokens() {
      try {
        const tokens = await window.SignBridge.listTokens();
        document.getElementById('result').innerHTML = 
          '<span class="success">Tokens found:</span> ' + JSON.stringify(tokens);
      } catch (e) {
        document.getElementById('result').innerHTML = 
          '<span class="error">Error:</span> ' + e.message;
      }
    }

    async function testGetCertificate() {
      try {
        const cert = await window.SignBridge.getCertificate();
        document.getElementById('result').innerHTML = 
          '<span class="success">Certificate:</span> ' + JSON.stringify(cert);
      } catch (e) {
        document.getElementById('result').innerHTML = 
          '<span class="error">Error:</span> ' + e.message;
      }
    }

    async function testSign() {
      try {
        const testHash = 'a1b2c3d4e5f67890';
        const signature = await window.SignBridge.sign(testHash, 'SHA256WithRSA');
        document.getElementById('result').innerHTML = 
          '<span class="success">Signature:</span> ' + JSON.stringify(signature);
      } catch (e) {
        document.getElementById('result').innerHTML = 
          '<span class="error">Error:</span> ' + e.message;
      }
    }
  </script>
</body>
</html>
`;

export default WebViewBridge;
