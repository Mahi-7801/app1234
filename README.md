# Type-C DSC Mobile Signing Solution

A cross-platform mobile SDK + app that lets users sign documents using a physical Type-C DSC (Digital Signature Certificate) USB dongle, from Android and iOS, inside native apps and mobile WebViews — without desktop software.

## Project for RTIH/APIS/NIC Hackathon

This solution is CCA (Controller of Certifying Authorities) guideline compliant.

## Tech Stack

- **Mobile App**: React Native with Expo (Custom Dev Client)
- **Android Native Module**: Kotlin (USB Host API + CCID Protocol)
- **iOS Native Module**: Swift (CryptoTokenKit/TKSmartCard)
- **Backend**: InsForge (Postgres + Auth + Storage + Serverless Functions)
- **Database**: PostgreSQL via InsForge

## Project Structure

```
hacktiong/
├── backend/
│   ├── schema.sql              # Database schema
│   ├── functions/              # Serverless functions
│   │   ├── hash-document.js    # Document hashing with DB persistence
│   │   ├── submit-timestamp.js # RFC 3161 timestamping with session tracking
│   │   ├── assemble-signature.js # PAdES/CAdES signature assembly
│   │   └── audit-log.js        # Audit trail logging
│   ├── run-schema.mjs          # Schema deployment script
│   └── .env                    # Environment variables (gitignored)
│
├── mobile/
│   ├── android/nativemodule/   # Android native module
│   │   ├── src/main/java/com/dscsigning/
│   │   │   ├── DSCUsbManager.kt      # USB Host detection
│   │   │   ├── CcidTransport.kt      # CCID protocol layer (dynamic endpoints)
│   │   │   ├── P11Wrapper.kt         # PKCS#11-style interface
│   │   │   ├── DSCSigningModule.kt   # React Native bridge
│   │   │   └── DSCSigningPackage.kt  # Package registration
│   │   └── build.gradle
│   │
│   ├── ios/nativemodule/       # iOS native module
│   │   ├── DSCSigningModule.swift    # CryptoTokenKit implementation
│   │   ├── Bridging-Header.h
│   │   ├── DSCSigning.podspec
│   │   └── package.json
│   │
│   └── app/                    # React Native app
│       ├── App.tsx
│       ├── .env                # Environment variables (gitignored)
│       └── src/
│           ├── screens/
│           │   ├── HomeScreen.tsx
│           │   ├── PINEntryScreen.tsx
│           │   ├── DocumentSelectScreen.tsx
│           │   └── SignConfirmationScreen.tsx
│           └── services/
│               ├── DSCService.ts      # Native module interface
│               ├── BackendService.ts  # InsForge API interface
│               └── WebViewBridge.ts   # WebView JS injection
│
└── README.md
```

## CCA Compliance

This solution follows all 5 CCA guidelines:

| Rule | Requirement | Implementation |
|------|-------------|----------------|
| 1 | Private key never leaves hardware token | Signing happens entirely on token; only signature blob returned |
| 2 | PIN handled securely | PIN sent directly to token via native layer; memory-wiped after use |
| 3 | PAdES/CAdES with RFC 3161 timestamp | Backend submits to CCA-approved TSA (mock for demo) |
| 4 | Token enforces retry limits | Token policy enforced; app respects lockout (3 attempts) |
| 5 | Full audit trail | All signing sessions logged in InsForge Postgres |

## Quick Start for Judges

### Prerequisites

1. Node.js 18+ installed
2. Expo CLI: `npm install -g expo-cli`
3. Android Studio (for Android) or Xcode (for iOS)
4. A Type-C DSC dongle (generic CCID-compliant)

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
# Edit .env with your InsForge credentials:
#   SUPABASE_URL=https://your-project.supabase.co
#   SUPABASE_SERVICE_KEY=your-service-role-key
#   DATABASE_URL=postgresql://...

# Run schema
node run-schema.mjs
```

### Mobile App Setup

```bash
cd mobile/app

# Install dependencies
npm install

# Configure environment variables
# Edit .env with your InsForge credentials:
#   EXPO_PUBLIC_INSFORGE_URL=https://your-project.supabase.co
#   EXPO_PUBLIC_INSFORGE_ANON_KEY=your-anon-key

# Start Expo dev server
npx expo start

# Run on Android (requires custom dev client)
npx expo run:android

# Run on iOS (requires custom dev client)
npx expo run:ios
```

### Testing the Demo

1. **Connect DSC Dongle**: Plug your Type-C DSC dongle into your phone
2. **Open App**: Launch the DSC Mobile Signing app
3. **Scan**: The app will detect your dongle
4. **Connect**: Tap on the detected dongle
5. **Enter PIN**: Enter your DSC token PIN (sent directly to token)
6. **Select Document**: Choose a document to sign
7. **Sign**: Confirm and sign the document
8. **Audit**: View the audit trail in InsForge

### WebView Testing

The app includes a WebView bridge for hybrid apps:

```typescript
import { WebView } from 'react-native-webview';
import { WebViewBridge, TEST_HTML } from './src/services/WebViewBridge';

const bridge = new WebViewBridge(webViewRef);

<WebView
  ref={webViewRef}
  source={{ html: TEST_HTML }}
  injectedJavaScript={WebViewBridge.getInjectedJavaScript()}
  onMessage={(event) => bridge.handleMessage(event)}
/>
```

## Architecture

### Android Flow

```
React Native App
    ↓
DSCSigningModule (Kotlin)
    ↓
P11Wrapper → CcidTransport → USB Host API
    ↓
DSC Dongle (CCID Protocol)
```

### iOS Flow

```
React Native App
    ↓
DSCSigningModule (Swift)
    ↓
CryptoTokenKit (TKSmartCard)
    ↓
DSC Dongle (CCID Protocol)
```

### Signing Process

1. User selects document
2. Backend generates document hash (SHA-256)
3. Hash sent to hardware token via native module
4. Token signs hash with private key
5. Signature returned to app
6. Backend submits to TSA for RFC 3161 timestamp
7. PAdES/CAdES signature assembled
8. Audit trail logged to InsForge

## Security Features

- **Hardware Token Security**: Private keys never leave the DSC dongle
- **Secure PIN Entry**: PIN sent directly to token, memory-wiped after use
- **Environment Variables**: Credentials loaded from .env files, never hardcoded
- **Token Policy Enforcement**: Retry limits and lockout respected
- **Audit Trail**: Complete logging of all signing operations
- **SSL/TLS**: All backend communication encrypted
- **RLS Policies**: Row Level Security on all database tables

## Known Limitations

- Generic CCID implementation (works with most DSC dongles)
- Mock timestamp for demo (real TSA integration needed for production)
- PIN retry limits are advisory (token enforces actual limits)

## Future Enhancements

- Vendor-specific CCID optimizations
- Real TSA integration (CCA-approved)
- Biometric PIN entry
- Certificate chain validation
- Offline signing capability
- Multi-document batch signing

## License

MIT
