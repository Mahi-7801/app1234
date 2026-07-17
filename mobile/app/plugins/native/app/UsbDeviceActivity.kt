package com.dscsigning.app

import android.app.Activity
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Bundle

/**
 * CCA Rule 2: USB device connection handler.
 * Does NOT forward device data to MainActivity — dongle data is only
 * shown after the user has logged in and is on the HomeScreen.
 */
class UsbDeviceActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Do NOT start MainActivity with device data here.
        // The HomeScreen's USB listener will detect the dongle
        // only after the user has logged in.
        // This prevents showing dongle data to unauthenticated users.
        finish()
    }
}
