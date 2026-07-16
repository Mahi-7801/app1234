package com.dscsigning.app

import android.app.Activity
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Bundle

/**
 * Handles USB device attached events.
 * When a DSC dongle is plugged in, this activity launches the main app.
 */
class UsbDeviceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val device = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }
        
        // Launch main activity with device info
        val mainIntent = Intent(this, MainActivity::class.java).apply {
            action = "USB_DEVICE_ATTACHED"
            putExtra("vendorId", device?.vendorId ?: 0)
            putExtra("productId", device?.productId ?: 0)
            putExtra("deviceName", device?.deviceName ?: "")
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(mainIntent)
        finish()
    }
}
