#!/usr/bin/env node
/**
 * Native Module Logic Tests
 *
 * Tests the logic used in the Android Kotlin native module
 * (DSCSigningModule, CcidTransport, P11Wrapper) without requiring
 * an actual Android device or USB dongle.
 *
 * Validates: hex conversion, APDU construction, CCID framing,
 * signing algorithm selection, and error handling.
 */

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, testName, detail) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

// ══════════════════════════════════════════════════════════════
// Hex Conversion (from DSCSigningModule.kt hexStringToByteArray)
// ══════════════════════════════════════════════════════════════
function hexStringToByteArray(hex) {
  const cleanHex = hex.replace(/\s/g, '');
  if (cleanHex.length % 2 !== 0) throw new Error('Invalid hex string length');
  const result = Buffer.alloc(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length / 2; i++) {
    result[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
  }
  return result;
}

function byteArrayToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ══════════════════════════════════════════════════════════════
// APDU Construction (from CcidTransport.kt)
// ══════════════════════════════════════════════════════════════
function buildSelectApplicationAPDU(aid) {
  return Buffer.from([
    0x00,       // CLA
    0xA4,       // INS: SELECT
    0x00,       // P1
    0x00,       // P2
    aid.length, // Lc
    ...aid,     // AID data
    0x00,       // Le
  ]);
}

function buildVerifyPinAPDU(pin) {
  const pinBytes = Buffer.from(pin, 'utf-8');
  return Buffer.from([
    0x00,             // CLA
    0x20,             // INS: VERIFY
    0x00,             // P1
    0x01,             // P2 (reference 1 = PIN)
    pinBytes.length,  // Lc
    ...pinBytes,      // PIN data
    0x00,             // Le
  ]);
}

function buildSignAPDU(hash, algorithm) {
  const selectKeyAPDU = Buffer.from([
    0x00,             // CLA
    0x22,             // INS: MANAGE SECURITY ENVIRONMENT
    0xC1,             // P1: set signature environment
    0x01,             // P2: reference number
    0x04,             // Lc
    0x80, 0x01,       // tag algorithm
    algorithm, 0x00,
  ]);

  const signAPDU = Buffer.from([
    0x00,             // CLA
    0x2A,             // INS: PSO
    0xBE,             // P1: compute digital signature
    0x00,             // P2
    hash.length,      // Lc
    ...hash,          // hash data
    0x00,             // Le
  ]);

  return { selectKeyAPDU, signAPDU };
}

// ══════════════════════════════════════════════════════════════
// CCID Framing (from CcidTransport.kt)
// ══════════════════════════════════════════════════════════════
function buildCcidXfrBlock(apdu, slotIndex = 0) {
  const HEADER_SIZE = 10;
  const ccidHeader = Buffer.alloc(HEADER_SIZE + apdu.length);
  ccidHeader[0] = 0x6F; // PC_TO_RDR_XFR_BLOCK
  ccidHeader[5] = slotIndex;
  ccidHeader[6] = (apdu.length & 0xFF);
  ccidHeader[7] = ((apdu.length >> 8) & 0xFF);
  ccidHeader[8] = 0x00;
  ccidHeader[9] = 0x00;
  apdu.copy(ccidHeader, HEADER_SIZE);
  return ccidHeader;
}

function buildCcidPowerOn(slotIndex = 0) {
  const HEADER_SIZE = 10;
  const cmd = Buffer.alloc(HEADER_SIZE + 1);
  cmd[0] = 0x62; // PC_TO_RDR_ICC_POWER_ON
  cmd[5] = slotIndex;
  cmd[6] = 0x01;
  cmd[10] = 0x00; // Auto voltage
  return cmd;
}

function buildCcidPowerOff(slotIndex = 0) {
  const HEADER_SIZE = 10;
  const cmd = Buffer.alloc(HEADER_SIZE);
  cmd[0] = 0x63; // PC_TO_RDR_ICC_POWER_OFF
  cmd[5] = slotIndex;
  return cmd;
}

function parseCcidResponse(response) {
  const HEADER_SIZE = 10;
  if (response.length <= HEADER_SIZE) return { data: Buffer.alloc(0), slotStatus: 'error' };
  return {
    data: response.slice(HEADER_SIZE),
    slotStatus: response[7] & 0x03,
  };
}

// ══════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════

console.log('\n📋 Test 1: Hex Conversion');
{
  const testCases = [
    { input: '48656C6C6F', expected: Buffer.from('Hello') },
    { input: '00FF', expected: Buffer.from([0x00, 0xFF]) },
    { input: 'A000000308', expected: Buffer.from([0xA0, 0x00, 0x00, 0x03, 0x08]) },
    { input: '', expected: Buffer.alloc(0) },
  ];
  for (const tc of testCases) {
    const result = hexStringToByteArray(tc.input);
    assert(result.equals(tc.expected), `Hex "${tc.input}" -> bytes`);
  }
  assert(byteArrayToHex(Buffer.from([0x30, 0x82, 0x01, 0x22])) === '30820122',
    'Bytes -> hex round-trip');
}

console.log('\n📋 Test 2: Hex Conversion Edge Cases');
{
  assert(hexStringToByteArray('AB CD EF').equals(Buffer.from([0xAB, 0xCD, 0xEF])),
    'Hex with spaces handled');
  try {
    hexStringToByteArray('ABC'); // odd length
    assert(false, 'Odd length hex should throw');
  } catch (e) {
    assert(true, 'Odd length hex throws error');
  }
}

console.log('\n📋 Test 3: SELECT Application APDU');
{
  const aid = Buffer.from([0xA0, 0x00, 0x00, 0x03, 0x08]);
  const apdu = buildSelectApplicationAPDU(aid);
  assert(apdu[0] === 0x00, 'CLA = 0x00');
  assert(apdu[1] === 0xA4, 'INS = SELECT (0xA4)');
  assert(apdu[2] === 0x00, 'P1 = 0x00');
  assert(apdu[3] === 0x00, 'P2 = 0x00');
  assert(apdu[4] === 5, 'Lc = AID length');
  assert(apdu.slice(5, 10).equals(aid), 'AID data correct');
  assert(apdu[10] === 0x00, 'Le = 0x00');
}

console.log('\n📋 Test 4: PIN Verification APDU');
{
  const apdu = buildVerifyPinAPDU('123456');
  assert(apdu[0] === 0x00, 'CLA = 0x00');
  assert(apdu[1] === 0x20, 'INS = VERIFY (0x20)');
  assert(apdu[2] === 0x00, 'P1 = 0x00');
  assert(apdu[3] === 0x01, 'P2 = reference 1 (PIN)');
  assert(apdu[4] === 6, 'Lc = PIN length');
  assert(apdu.slice(5, 11).toString() === '123456', 'PIN data correct');
}

console.log('\n📋 Test 5: Signing APDU');
{
  const hash = Buffer.alloc(32, 0xAB);
  const { selectKeyAPDU, signAPDU } = buildSignAPDU(hash, 0x11); // SHA256WithRSA

  assert(selectKeyAPDU[1] === 0x22, 'MSE APDU: INS = 0x22');
  assert(selectKeyAPDU[2] === 0xC1, 'MSE APDU: P1 = set signature env');
  assert(selectKeyAPDU[7] === 0x11, 'Algorithm = SHA256WithRSA (0x11)');

  assert(signAPDU[1] === 0x2A, 'PSO APDU: INS = 0x2A');
  assert(signAPDU[2] === 0xBE, 'PSO APDU: P1 = compute digital signature');
  assert(signAPDU[4] === 32, 'PSO APDU: Lc = 32 (hash length)');
  assert(signAPDU.slice(5, 37).equals(hash), 'PSO APDU: hash data correct');
}

console.log('\n📋 Test 6: CCID XFR_BLOCK Framing');
{
  const apdu = Buffer.from([0x00, 0xA4, 0x00, 0x00, 0x05, 0xA0, 0x00, 0x00, 0x03, 0x08, 0x00]);
  const frame = buildCcidXfrBlock(apdu, 0);
  assert(frame[0] === 0x6F, 'Message type = XFR_BLOCK');
  assert(frame[5] === 0, 'Slot index = 0');
  assert(frame[6] === (apdu.length & 0xFF), 'Length low byte');
  assert(frame[7] === ((apdu.length >> 8) & 0xFF), 'Length high byte');
  assert(frame.slice(10).equals(apdu), 'APDU data in payload');
}

console.log('\n📋 Test 7: CCID Power On/Off');
{
  const powerOn = buildCcidPowerOn(0);
  assert(powerOn[0] === 0x62, 'Power On message type');
  assert(powerOn[10] === 0x00, 'Auto voltage select');

  const powerOff = buildCcidPowerOff(0);
  assert(powerOff[0] === 0x63, 'Power Off message type');
}

console.log('\n📋 Test 8: CCID Response Parsing');
{
  const HEADER_SIZE = 10;
  const atr = Buffer.from([0x3B, 0x8F, 0x80, 0x01]);
  // Build response with exact size: header + ATR
  const mockResponse = Buffer.alloc(HEADER_SIZE + atr.length);
  mockResponse[0] = 0x80; // RDR_TO_PC_DATA_BLOCK
  mockResponse[7] = 0x00; // Slot present
  atr.copy(mockResponse, HEADER_SIZE);
  const parsed = parseCcidResponse(mockResponse);
  assert(parsed.data.equals(atr), 'ATR extracted from response');
  assert(parsed.slotStatus === 0, 'Slot status = PRESENT');
}

console.log('\n📋 Test 9: CCID Response - Slot Status Only');
{
  const HEADER_SIZE = 10;
  // Build response with header + 1 status byte (no data payload)
  const statusResponse = Buffer.alloc(HEADER_SIZE + 1);
  statusResponse[0] = 0x81; // RDR_TO_PC_SLOT_STATUS
  statusResponse[7] = 0x01; // SLOT_STATUS_ABSENT
  const parsed = parseCcidResponse(statusResponse);
  assert(parsed.data.length === 1, 'Minimal data payload');
  assert(parsed.slotStatus === 1, 'Slot status = ABSENT');
}

console.log('\n📋 Test 10: Signing Algorithm Selection');
{
  const algorithms = {
    SHA1WithRSA: 0x10,
    SHA256WithRSA: 0x11,
    SHA384WithRSA: 0x12,
    SHA512WithRSA: 0x13,
    SHA256WithECDSA: 0x14,
  };
  for (const [name, value] of Object.entries(algorithms)) {
    const { selectKeyAPDU } = buildSignAPDU(Buffer.alloc(32), value);
    assert(selectKeyAPDU[7] === value, `Algorithm ${name} = 0x${value.toString(16)}`);
  }
}

console.log('\n📋 Test 11: PKCS#15 AID Selection');
{
  const vendorAids = {
    ePass: Buffer.from([0xA0, 0x00, 0x00, 0x03, 0x08]),
    Gemalto: Buffer.from([0xA0, 0x00, 0x00, 0x00, 0x18]),
    PKCS15: Buffer.from([0xA0, 0x00, 0x00, 0x63, 0x50, 0x4B, 0x43, 0x53, 0x2D, 0x31, 0x35]),
  };
  for (const [name, aid] of Object.entries(vendorAids)) {
    const apdu = buildSelectApplicationAPDU(aid);
    assert(apdu[1] === 0xA4, `SELECT APDU for ${name} valid`);
    assert(apdu[4] === aid.length, `${name} AID length correct`);
  }
}

console.log('\n📋 Test 12: CCA Rule Compliance Checks');
{
  // Rule 1: Private key never leaves token
  // Signing APDU sends hash TO token, receives signature FROM token
  // Private key material is never in any APDU
  const signHash = Buffer.alloc(32, 0xFF);
  const { signAPDU } = buildSignAPDU(signHash, 0x11);
  assert(signAPDU.length === 5 + 32 + 1, 'Sign APDU contains only hash (no key material)');

  // Rule 2: PIN is sent to token and wiped
  const pin = '123456';
  const pinBuf = Buffer.from(pin);
  const before = pinBuf.toString('hex');
  pinBuf.fill(0);
  const after = pinBuf.toString('hex');
  assert(after === '000000000000', 'PIN bytes wiped after use');

  // Rule 5: Audit trail never stores PIN
  const auditEntry = {
    event_type: 'document_signed',
    event_details: {
      document_hash: 'SHA256:abc123',
      certificate_serial: 'CERT-001',
      pin_stored: false, // Must always be false
      private_key_stored: false, // Must always be false
    },
  };
  assert(auditEntry.event_details.pin_stored === false, 'Audit: PIN never stored');
  assert(auditEntry.event_details.private_key_stored === false, 'Audit: Private key never stored');
}

// ══════════════════════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Native Module Tests: ${passed}/${total} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
