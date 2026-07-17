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
  if (window.SignBridge) return;

  let _callbackCounter = 0;
  window._signBridgeCallbacks = window._signBridgeCallbacks || {};

  window.SignBridge = {
    listTokens: function() {
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'LIST_TOKENS',
          id: id
        }));
      });
    },

    connectDevice: function(serialNumber) {
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'CONNECT_DEVICE',
          serialNumber: serialNumber,
          id: id
        }));
      });
    },

    verifyPin: function(pin) {
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'VERIFY_PIN',
          pin: pin,
          id: id
        }));
      });
    },

    getCertificate: function() {
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'GET_CERTIFICATE',
          id: id
        }));
      });
    },

    sign: function(documentHash, algorithm) {
      algorithm = algorithm || 'SHA256WithRSA';
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'SIGN',
          documentHash: documentHash,
          algorithm: algorithm,
          id: id
        }));
      });
    },

    disconnect: function() {
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DISCONNECT',
          id: id
        }));
      });
    },

    hashDocument: function(documentId) {
      return new Promise((resolve, reject) => {
        const id = ++_callbackCounter;
        window._signBridgeCallbacks[id] = { resolve, reject };
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HASH_DOCUMENT',
          documentId: documentId,
          id: id
        }));
      });
    }
  };

  window._handleSignBridgeResponse = function(data) {
    const cb = window._signBridgeCallbacks[data.id];
    if (cb) {
      delete window._signBridgeCallbacks[data.id];
      if (data.success) {
        cb.resolve(data.result);
      } else {
        cb.reject(new Error(data.error || 'SignBridge operation failed'));
      }
    }
  };

  window.dispatchEvent(new Event('SignBridgeReady'));
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
      true;
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
    window._handleSignBridgeResponse = function(data) {
      const resultDiv = document.getElementById('result');
      if (data.success) {
        resultDiv.textContent = 'Success: ' + JSON.stringify(data.result, null, 2);
        resultDiv.className = 'success';
      } else {
        resultDiv.textContent = 'Error: ' + data.error;
        resultDiv.className = 'error';
      }
    };

    window.addEventListener('SignBridgeReady', function() {
      console.log('SignBridge is ready!');
    });

    async function testListTokens() {
      try {
        const tokens = await window.SignBridge.listTokens();
        document.getElementById('result').textContent = 'Tokens found: ' + JSON.stringify(tokens);
        document.getElementById('result').className = 'success';
      } catch (e) {
        document.getElementById('result').textContent = 'Error: ' + e.message;
        document.getElementById('result').className = 'error';
      }
    }

    async function testGetCertificate() {
      try {
        const cert = await window.SignBridge.getCertificate();
        document.getElementById('result').textContent = 'Certificate: ' + JSON.stringify(cert);
        document.getElementById('result').className = 'success';
      } catch (e) {
        document.getElementById('result').textContent = 'Error: ' + e.message;
        document.getElementById('result').className = 'error';
      }
    }

    async function testSign() {
      try {
        const testHash = 'a1b2c3d4e5f67890';
        const signature = await window.SignBridge.sign(testHash, 'SHA256WithRSA');
        document.getElementById('result').textContent = 'Signature: ' + JSON.stringify(signature);
        document.getElementById('result').className = 'success';
      } catch (e) {
        document.getElementById('result').textContent = 'Error: ' + e.message;
        document.getElementById('result').className = 'error';
      }
    }
  </script>
</body>
</html>
`;

export default WebViewBridge;
