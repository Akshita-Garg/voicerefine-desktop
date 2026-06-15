const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'VoiceRefine',
    icon: 'resources/icons/icon',
    appCopyright: `Copyright (c) ${new Date().getFullYear()} Akshita Garg`,
    win32metadata: {
      CompanyName: 'VoiceRefine',
      FileDescription: 'VoiceRefine',
      OriginalFilename: 'VoiceRefine.exe',
      ProductName: 'VoiceRefine',
      InternalName: 'VoiceRefine',
    },
    // Bundle only the current user-facing local models and Windows sidecar binary.
    // extraResource items land in process.resourcesPath at runtime.
    extraResource: [
      'resources/models/gemma-3-1b-it-Q4_K_M.gguf',
      'resources/models/parakeet-tdt-0.6b-v3-GGUF',
      'resources/models/sherpa-onnx-whisper-tiny.en',
      'resources/bin/crispasr-windows-x86_64-cpu',
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
          {
            name: 'overlay_window',
            config: 'vite.overlay.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
