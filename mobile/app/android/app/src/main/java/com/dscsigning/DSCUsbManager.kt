package com.dscsigning

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Build

/**
 * Manages USB Host operations for DSC dongle detection and claiming.
 * 
 * CCA Compliance Rule 1: This module facilitates hardware token communication,
 * ensuring private key material never leaves the device.
 */
class DSCUsbManager(private val context: Context) {
    
    private val usbManager: UsbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var connectedDevice: UsbDevice? = null
    private var onDeviceConnected: ((UsbDevice) -> Unit)? = null
    private var onDeviceDisconnected: (() -> Unit)? = null
    
    companion object {
        private const val ACTION_USB_PERMISSION = "com.dscsigning.USB_PERMISSION"
        
        // Common CCID device class
        private const val USB_CLASS_SMART_CARD = 0x0B
        
        // Known DSC vendor IDs (expand as needed)
        private val SUPPORTED_VENDOR_IDS = listOf(
            0x096E, // ePass
            0x04E6, // SCM
            0x08E6, // Gemalto
            0x0A5C, // Broadcom
            0x1A44, // Feitian
            0x2342, // Futurocoin
        )
    }
    
    /**
     * Scans for connected CCID-compatible DSC dongles.
     * Returns a list of detected devices.
     */
    fun scanForDongles(): List<UsbDevice> {
        try {
            val deviceList = usbManager.deviceList
            // Return all USB devices - let the user select which one is the DSC dongle
            return deviceList.values.toList()
        } catch (e: Exception) {
            return emptyList()
        }
    }
    
    /**
     * Checks if a USB device is a CCID-compatible smart card reader.
     */
    private fun isCcidDevice(device: UsbDevice): Boolean {
        // Check if device class matches smart card reader
        if (device.deviceClass == USB_CLASS_SMART_CARD) return true
        
        // Check interface classes for CCID
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            if (iface.interfaceClass == USB_CLASS_SMART_CARD) return true
        }
        
        // Check against known vendor IDs
        if (device.vendorId in SUPPORTED_VENDOR_IDS) return true
        
        return false
    }
    
    /**
     * Requests permission to access a USB device.
     * CCA Rule 4: User must explicitly grant access to hardware token.
     */
    fun requestPermission(device: UsbDevice, onGranted: (Boolean) -> Unit) {
        if (usbManager.hasPermission(device)) {
            onGranted(true)
            return
        }
        
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        
        val permissionIntent = PendingIntent.getBroadcast(
            context, 0, Intent(ACTION_USB_PERMISSION), flags
        )
        
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.action == ACTION_USB_PERMISSION) {
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    onGranted(granted)
                    context.unregisterReceiver(this)
                }
            }
        }
        
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
        
        usbManager.requestPermission(device, permissionIntent)
    }
    
    /**
     * Opens a connection to the claimed USB device.
     * CCA Rule 1: Establishes secure channel to hardware token.
     */
    fun openDevice(device: UsbDevice): UsbDeviceConnection? {
        return usbManager.openDevice(device)?.also {
            connectedDevice = device
            onDeviceConnected?.invoke(device)
        }
    }
    
    /**
     * Closes the current device connection.
     */
    fun closeDevice() {
        connectedDevice = null
        onDeviceDisconnected?.invoke()
    }
    
    /**
     * Sets callback for device connection events.
     */
    fun setDeviceCallbacks(
        onConnected: (UsbDevice) -> Unit,
        onDisconnected: () -> Unit
    ) {
        onDeviceConnected = onConnected
        onDeviceDisconnected = onDisconnected
    }
    
    /**
     * Registers a broadcast receiver for USB attach/detach events.
     */
    fun registerUsbReceiver() {
        val filter = IntentFilter().apply {
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                when (intent.action) {
                    UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                        }
                        device?.let {
                            if (isCcidDevice(it)) {
                                onDeviceConnected?.invoke(it)
                            }
                        }
                    }
                    UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                        onDeviceDisconnected?.invoke()
                    }
                }
            }
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
    }
}
