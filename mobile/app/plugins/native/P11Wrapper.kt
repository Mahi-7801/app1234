package com.dscsigning

import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbInterface

/**
 * PKCS#11-style interface wrapper for DSC operations.
 * 
 * This module provides a high-level API for interacting with DSC dongles,
 * abstracting the underlying CCID transport layer.
 * 
 * CCA Compliance:
 * - Rule 1: Private keys never leave the hardware token
 * - Rule 2: PIN verification happens on the token
 * - Rule 4: Retry/lockout limits enforced by token policy
 */
class P11Wrapper(private val ccidTransport: CcidTransport) {
    
    companion object {
        // AID for common DSC applications
        private val DSC_APP_AID = byteArrayOf(
            0xA0.toByte(), 0x00, 0x00, 0x01, 0x61, 0x00, 0x00, 0x00, 0x00
        )
        
        // Alternative AIDs for different vendors
        private val VENDOR_AIDS = mapOf(
            // ePass2003 PKCS#15 AID
            "ePass" to byteArrayOf(0xA0.toByte(), 0x00, 0x00, 0x03, 0x08),
            // Gemalto
            "Gemalto" to byteArrayOf(0xA0.toByte(), 0x00, 0x00, 0x00, 0x18),
            // Standard PKCS#15
            "PKCS15" to byteArrayOf(0xA0.toByte(), 0x00, 0x00, 0x63, 0x50, 0x4B, 0x43, 0x53, 0x2D, 0x31, 0x35),
        )
        
        // Select MF (Master File) APDU
        private val SELECT_MF = byteArrayOf(
            0x00, 0xA4.toByte(), 0x00, 0x00, 0x02, 0x3F, 0x00
        )
    }
    
    private var isInitialized = false
    private var applicationSelected = false
    
    /**
     * Initializes the PKCS#11 wrapper and selects the DSC application.
     * CCA Rule 1: Establishes communication channel with hardware token.
     */
    fun initialize(): Boolean {
        try {
            try {
                ccidTransport.powerOn()
            } catch (e: Exception) {
                // Continue anyway
            }

            var appSelected = false

            try {
                ccidTransport.transmitApdu(SELECT_MF)
                appSelected = true
            } catch (e: Exception) {
                // Continue to next approach
            }

            if (!appSelected) {
                for ((name, aid) in VENDOR_AIDS) {
                    try {
                        ccidTransport.selectApplication(aid)
                        appSelected = true
                        break
                    } catch (e: Exception) {
                        continue
                    }
                }
            }

            if (!appSelected) {
                try {
                    ccidTransport.selectApplication(DSC_APP_AID)
                    appSelected = true
                } catch (e: Exception) {
                    // Continue anyway
                }
            }

            isInitialized = true
            applicationSelected = appSelected
            return appSelected
        } catch (e: Exception) {
            isInitialized = false
            applicationSelected = false
            return false
        }
    }
    
    /**
     * Selects the appropriate application on the smart card.
     */
    private fun selectApplication() {
        try {
            ccidTransport.selectApplication(DSC_APP_AID)
            applicationSelected = true
        } catch (e: CcidException) {
            // Try vendor-specific AIDs
            for ((_, aid) in VENDOR_AIDS) {
                try {
                    ccidTransport.selectApplication(aid)
                    applicationSelected = true
                    return
                } catch (ex: CcidException) {
                    continue
                }
            }
            throw CcidException("No supported application found on token")
        }
    }
    
    /**
     * Lists available tokens (smart cards) in the reader.
     */
    fun listTokens(): List<TokenInfo> {
        if (!isInitialized) {
            throw CcidException("P11Wrapper not initialized")
        }
        
        val tokens = mutableListOf<TokenInfo>()
        
        try {
            val serialNumber = ccidTransport.getSerialNumber()
            val certificate = ccidTransport.getCertificate()
            
            tokens.add(
                TokenInfo(
                    serialNumber = serialNumber,
                    label = "DSC Token",
                    certificate = certificate,
                    isPresent = true
                )
            )
        } catch (e: CcidException) {
            // Card might not be present or initialized
        }
        
        return tokens
    }
    
    /**
     * Verifies the user's PIN on the hardware token.
     */
    fun verifyPin(pin: ByteArray): Boolean {
        if (!isInitialized || !applicationSelected) {
            throw CcidException("P11Wrapper not properly initialized")
        }
        
        // CCA Rule 2: PIN goes directly to hardware token
        return ccidTransport.verifyPin(pin)
    }
    
    /**
     * Gets the certificate from the token.
     */
    fun getCertificate(): ByteArray {
        if (!isInitialized || !applicationSelected) {
            throw CcidException("P11Wrapper not properly initialized")
        }
        
        return ccidTransport.getCertificate()
    }
    
    /**
     * Signs a hash using the token's private key.
     */
    fun sign(hash: ByteArray, algorithm: SigningAlgorithm = SigningAlgorithm.SHA256WithRSA): ByteArray {
        if (!isInitialized || !applicationSelected) {
            throw CcidException("P11Wrapper not properly initialized")
        }
        
        return ccidTransport.sign(hash, algorithm)
    }
    
    /**
     * Shuts down the PKCS#11 wrapper.
     */
    fun shutdown() {
        if (isInitialized) {
            try {
                ccidTransport.powerOff()
            } catch (e: Exception) {
                // Ignore cleanup errors
            }
            isInitialized = false
            applicationSelected = false
        }
    }
}

/**
 * Information about a detected token.
 */
data class TokenInfo(
    val serialNumber: String,
    val label: String,
    val certificate: ByteArray,
    val isPresent: Boolean
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as TokenInfo
        return serialNumber == other.serialNumber
    }
    
    override fun hashCode(): Int {
        return serialNumber.hashCode()
    }
}
