const { withDangerousMod, withAndroidManifest, withMainApplication } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin for DSC Signing native module.
 * Injects custom native code during expo prebuild.
 */
function withDSCSigning(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const androidRoot = path.dirname(projectRoot);
      const appSrcMain = path.join(projectRoot, 'app', 'src', 'main');

      // Ensure directory structure exists
      const dscPackageDir = path.join(appSrcMain, 'java', 'com', 'dscsigning');
      const dscAppDir = path.join(appSrcMain, 'java', 'com', 'dscsigning', 'app');
      const xmlDir = path.join(appSrcMain, 'res', 'xml');

      fs.mkdirSync(dscPackageDir, { recursive: true });
      fs.mkdirSync(dscAppDir, { recursive: true });
      fs.mkdirSync(xmlDir, { recursive: true });

      // Copy Kotlin files
      const pluginDir = path.join(androidRoot, '..', 'plugins');
      
      const kotlinFiles = [
        'CcidTransport.kt',
        'DSCSigningModule.kt',
        'DSCSigningPackage.kt',
        'DSCUsbManager.kt',
        'P11Wrapper.kt',
      ];

      for (const file of kotlinFiles) {
        const src = path.join(pluginDir, 'native', file);
        const dest = path.join(dscPackageDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Copy UsbDeviceActivity
      const usbActivitySrc = path.join(pluginDir, 'native', 'app', 'UsbDeviceActivity.kt');
      const usbActivityDest = path.join(dscAppDir, 'UsbDeviceActivity.kt');
      if (fs.existsSync(usbActivitySrc)) {
        fs.copyFileSync(usbActivitySrc, usbActivityDest);
      }

      // Copy device_filter.xml
      const deviceFilterSrc = path.join(pluginDir, 'native', 'device_filter.xml');
      const deviceFilterDest = path.join(xmlDir, 'device_filter.xml');
      if (fs.existsSync(deviceFilterSrc)) {
        fs.copyFileSync(deviceFilterSrc, deviceFilterDest);
      }

      return config;
    },
  ]);
}

/**
 * Update MainApplication.kt to register DSCSigningPackage
 */
function withDSCSigningMainApplication(config) {
  return withMainApplication(config, (config) => {
    let mainApplication = config.modResults.contents;

    // Add import if not already present
    if (!mainApplication.includes('import com.dscsigning.DSCSigningPackage')) {
      mainApplication = mainApplication.replace(
        /import expo\.modules\.ExpoReactHostFactory/,
        'import expo.modules.ExpoReactHostFactory\n\n// CCA Rule 1: DSC signing native module\nimport com.dscsigning.DSCSigningPackage'
      );
    }

    // Add package registration if not already present
    if (!mainApplication.includes('add(DSCSigningPackage())')) {
      mainApplication = mainApplication.replace(
        /PackageList\(this\)\.packages\.apply \{[\s\S]*?\}/,
        `PackageList(this).packages.apply {\n          // CCA Rule 1: Register DSC signing native module\n          add(DSCSigningPackage())\n        }`
      );
    }

    config.modResults.contents = mainApplication;
    return config;
  });
}

/**
 * Update AndroidManifest.xml with USB permissions and activity
 */
function withDSCSigningManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Add USB Host permission
    const usesFeature = {
      $: {
        'android:name': 'android.hardware.usb.host',
        'android:required': 'true',
      },
    };

    // Check if already added
    const existingFeature = manifest['uses-feature']?.find(
      (f) => f.$['android:name'] === 'android.hardware.usb.host'
    );
    if (!existingFeature) {
      if (!manifest['uses-feature']) {
        manifest['uses-feature'] = [];
      }
      manifest['uses-feature'].push(usesFeature);
    }

    // Add UsbDeviceActivity
    const application = manifest.application?.[0];
    if (application) {
      const existingActivity = activity?.activity?.find(
        (a) => a.$['android:name'] === '.UsbDeviceActivity' || 
               a.$['android:name'] === 'com.dscsigning.app.UsbDeviceActivity'
      );

      if (!existingActivity) {
        const usbActivity = {
          $: {
            'android:name': 'com.dscsigning.app.UsbDeviceActivity',
            'android:exported': 'true',
            'android:launchMode': 'singleTask',
          },
          'intent-filter': [
            {
              action: [{ $: { 'android:name': 'android.hardware.usb.action.USB_DEVICE_ATTACHED' } }],
            },
          ],
          'meta-data': [
            {
              $: {
                'android:name': 'android.hardware.usb.action.USB_DEVICE_ATTACHED',
                'android:resource': '@xml/device_filter',
              },
            },
          ],
        };

        if (!application.activity) {
          application.activity = [];
        }
        application.activity.push(usbActivity);
      }
    }

    return config;
  });
}

module.exports = function (config) {
  config = withDSCSigning(config);
  config = withDSCSigningMainApplication(config);
  config = withDSCSigningManifest(config);
  return config;
};
