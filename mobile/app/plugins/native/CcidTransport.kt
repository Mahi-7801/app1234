package com.dscsigning

import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbInterface
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * CCID (Chip Card Interface Device) protocol implementation over USB bulk transfers.
 * 
 * This module handles low-level communication with CCID-compliant smart card readers,
 * implementing the PC/SC specifications for smart card interoperability.
 * 
 * CCA Rule 1: All operations happen on the hardware token; we only send hashes
 * and receive signature blobs.
 */
class CcidTransport(private val connection: UsbDeviceConnection, private val iface: UsbInterface) {

    companion object {
        // CCID message types
        private const val PC_TO_RDR_ICC_POWER_ON = 0x62
        private const val PC_TO_RDR_ICC_POWER_OFF = 0x63
        private const val PC_TO_RDR_GET_SLOT_STATUS = 0x65
        private const val PC_TO_RDR_XFR_BLOCK = 0x6F
        private const val RDR_TO_PC_DATA_BLOCK = 0x80
        private const val RDR_TO_PC_SLOT_STATUS = 0x81

        // CCID status codes
        private const val SLOT_STATUS_PRESENT = 0x00
        private const val SLOT_STATUS_ABSENT = 0x01
        private const val SLOT_STATUS_ERROR = 0x02

        // APDU constants
        private const val APDU_CLA = 0x00
        private const val APDU_P1 = 0x00
        private const val APDU_P2 = 0x00

        // Buffer sizes
        private const val MAX_BUFFER_SIZE = 261
        private const val HEADER_SIZE = 10

        // CCA Rule 1: Transfer timeout for USB communication
        private const val TRANSFER_TIMEOUT = 5000
    }

    private var slotIndex: Int = 0

    // CCA Rule 1: Dynamically discover bulk transfer endpoints from the USB interface
    private val bulkOutEndpoint: android.hardware.usb.UsbEndpoint by lazy {
        findBulkEndpoint(isIn = false)
    }
    private val bulkInEndpoint: android.hardware.usb.UsbEndpoint by lazy {
        findBulkEndpoint(isIn = true)
    }

    private fun findBulkEndpoint(isIn: Boolean): android.hardware.usb.UsbEndpoint {
        for (i in 0 until iface.endpointCount) {
            val ep = iface.getEndpoint(i)
            if (ep.type == android.hardware.usb.UsbConstants.USB_ENDPOINT_XFER_BULK) {
                if (isIn && ep.direction == android.hardware.usb.UsbConstants.USB_DIR_IN) return ep
                if (!isIn && ep.direction == android.hardware.usb.UsbConstants.USB_DIR_OUT) return ep
            }
        }
        throw CcidException("Bulk ${if (isIn) "IN" else "OUT"} endpoint not found on CCID interface")
    }
    
    /**
     * Sends a CCID command to the reader and receives the response.
     */
    private fun sendCcidCommand(command: ByteArray): ByteArray {
        val sent = connection.bulkTransfer(bulkOutEndpoint, command, command.size, TRANSFER_TIMEOUT)
        if (sent < 0) {
            throw CcidException("Failed to send CCID command")
        }

        val responseBuffer = ByteArray(MAX_BUFFER_SIZE)
        val received = connection.bulkTransfer(bulkInEndpoint, responseBuffer, responseBuffer.size, TRANSFER_TIMEOUT)
        if (received < 0) {
            throw CcidException("Failed to receive CCID response")
        }

        return responseBuffer.copyOf(received)
    }
    
    /**
     * Powers on the ICC (Integrated Circuit Card) and receives the ATR.
     * CCA Rule 1: Initializes secure communication channel with hardware token.
     */
    fun powerOn(): ByteArray {
        // CCID PC_TO_RDR_IccPowerOn command
        val command = ByteArray(HEADER_SIZE + 1)
        // Message type
        command[0] = PC_TO_RDR_ICC_POWER_ON.toByte()
        // Slot
        command[5] = slotIndex.toByte()
        // Length (4 bytes, little endian) = 1 (power select byte)
        command[6] = 0x01
        command[7] = 0x00
        command[8] = 0x00
        command[9] = 0x00
        // Power select: auto
        command[10] = 0x00
        
        val response = sendCcidCommand(command)
        
        // Extract ATR from response
        if (response.size > HEADER_SIZE) {
            val atrLength = response.size - HEADER_SIZE
            return response.copyOfRange(HEADER_SIZE, HEADER_SIZE + atrLength)
        }
        
        return byteArrayOf()
    }
    
    /**
     * Powers off the ICC.
     */
    fun powerOff() {
        val command = ByteBuffer.allocate(HEADER_SIZE)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(HEADER_SIZE) // length
            .putInt(PC_TO_RDR_ICC_POWER_OFF) // message type
            .putInt(slotIndex) // slot
            .putInt(0) // length
            .array()
        
        sendCcidCommand(command)
    }
    
    /**
     * Gets the current slot status (card present/absent/error).
     */
    fun getSlotStatus(): Int {
        val command = ByteBuffer.allocate(HEADER_SIZE)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(HEADER_SIZE) // length
            .putInt(PC_TO_RDR_GET_SLOT_STATUS) // message type
            .putInt(slotIndex) // slot
            .putInt(0) // length
            .array()
        
        val response = sendCcidCommand(command)
        return when (response[7].toInt() and 0x03) {
            0x00 -> SLOT_STATUS_PRESENT
            0x01 -> SLOT_STATUS_ABSENT
            else -> SLOT_STATUS_ERROR
        }
    }
    
    /**
     * Sends an APDU command to the smart card and receives the response.
     * This is the primary interface for PKCS#11 operations.
     * 
     * CCA Rule 1: All cryptographic operations are delegated to the hardware token.
     */
    fun transmitApdu(command: ByteArray): ByteArray {
        // Wrap APDU in CCID XFR_BLOCK message
        val ccidHeader = ByteArray(HEADER_SIZE + command.size)
        // Message type: XFR_BLOCK
        ccidHeader[0] = PC_TO_RDR_XFR_BLOCK.toByte()
        // Slot
        ccidHeader[5] = slotIndex.toByte()
        // APDU length (4 bytes little endian)
        ccidHeader[6] = (command.size and 0xFF).toByte()
        ccidHeader[7] = ((command.size shr 8) and 0xFF).toByte()
        ccidHeader[8] = 0x00
        ccidHeader[9] = 0x00
        // Copy APDU data
        System.arraycopy(command, 0, ccidHeader, HEADER_SIZE, command.size)
        
        val response = sendCcidCommand(ccidHeader)
        
        // Extract response data (skip CCID header)
        if (response.size > HEADER_SIZE) {
            return response.copyOfRange(HEADER_SIZE, response.size)
        }
        
        return byteArrayOf()
    }
    
    /**
     * Selects an application on the smart card by AID.
     */
    fun selectApplication(aid: ByteArray): ByteArray {
        val apdu = byteArrayOf(
            APDU_CLA.toByte(), // CLA
            0xA4.toByte(), // INS: SELECT
            APDU_P1.toByte(),
            APDU_P2.toByte(),
            aid.size.toByte() // Lc
        ) + aid + byteArrayOf(0x00) // Le
        
        return transmitApdu(apdu)
    }
    
    /**
     * Verifies PIN by sending it to the hardware token.
     * 
     * CCA Rule 2: PIN is sent directly to hardware token, never stored in memory.
     */
    fun verifyPin(pin: ByteArray): Boolean {
        try {
            val apdu = byteArrayOf(
                0x00,
                0x20.toByte(),
                0x00,
                0x01,
                pin.size.toByte()
            ) + pin + byteArrayOf(0x00)

            val response = transmitApdu(apdu)
            return checkSuccess(response)
        } catch (e: Exception) {
            return false
        }
    }
    
    /**
     * Checks if APDU response indicates success (SW1=0x90, SW2=0x00)
     */
    private fun checkSuccess(response: ByteArray): Boolean {
        if (response.size < 2) return false
        val sw1 = response[response.size - 2].toInt() and 0xFF
        val sw2 = response[response.size - 1].toInt() and 0xFF
        return sw1 == 0x90 && sw2 == 0x00
    }
    
    /**
     * Signs a hash using the hardware token's private key.
     * 
     * CCA Rule 1: Signing operation happens entirely on the hardware token.
     * We only receive the signature blob back.
     */
    fun sign(hash: ByteArray, algorithm: SigningAlgorithm = SigningAlgorithm.SHA256WithRSA): ByteArray {
        // SELECT signing key
        val selectKeyApdu = byteArrayOf(
            0x00, // CLA
            0x22.toByte(), // INS: MANAGE SECURITY ENVIRONMENT
            0xC1.toByte(), // P1: set signature environment
            0x01, // P2: reference number
            0x04, // Lc
            0x80.toByte(), 0x01, // tag algorithm
            algorithm.value, 0x00
        )
        transmitApdu(selectKeyApdu)
        
        // Perform signing operation
        val signApdu = byteArrayOf(
            0x00, // CLA
            0x2A.toByte(), // INS: PSO
            0xBE.toByte(), // P1: compute digital signature
            0x00, // P2
            hash.size.toByte() // Lc
        ) + hash + byteArrayOf(0x00) // Le
        
        val response = transmitApdu(signApdu)
        
        // Check for success
        if (response.size < 2) {
            throw CcidException("Invalid signing response")
        }
        
        val sw1 = response[response.size - 2]
        val sw2 = response[response.size - 1]
        
        if (sw1 != 0x90.toByte() || sw2 != 0x00.toByte()) {
            throw CcidException("Signing failed: SW=${String.format("%02X%02X", sw1, sw2)}")
        }
        
        return response.copyOfRange(0, response.size - 2)
    }
    
    /**
     * Gets the certificate from the hardware token.
     * 
     * CCA Rule 1: Certificate retrieval does not expose private key material.
     */
    fun getCertificate(): ByteArray {
        val apdu = byteArrayOf(
            0x00, // CLA
            0xB0.toByte(), // INS: READ BINARY
            0x80.toByte(), // P1: use EF with logical path
            0x00, // P2
            0x00 // Le (256 bytes)
        )
        
        return transmitApdu(apdu)
    }
    
    /**
     * Gets the serial number of the smart card.
     */
    fun getSerialNumber(): String {
        val apdu = byteArrayOf(
            0x00, // CLA
            0xCA.toByte(), // INS: GET DATA
            0x9F.toByte(), // P1
            0x17, // P2
            0x00 // Le
        )
        
        val response = transmitApdu(apdu)
        if (response.size < 2) {
            return ""
        }
        
        return response.copyOfRange(0, response.size - 2).joinToString("") { 
            String.format("%02X", it) 
        }
    }
}

/**
 * Signing algorithm identifiers for PKCS#11 operations.
 */
enum class SigningAlgorithm(val value: Byte) {
    SHA1WithRSA(0x10),
    SHA256WithRSA(0x11),
    SHA384WithRSA(0x12),
    SHA512WithRSA(0x13),
    SHA256WithECDSA(0x14)
}

/**
 * Exception thrown for CCID-related errors.
 */
class CcidException(message: String, cause: Throwable? = null) : Exception(message, cause)
