# Windows Release Notes

VoiceRefine currently uses two Windows distribution paths.

## Local Test ZIP

Use this when you want a simple packaged app folder for local testing or very early private sharing.

```powershell
npm run make
```

Output:

```text
out/make/zip/win32/x64/VoiceRefine-win32-x64-1.0.0.zip
```

Users unzip the file and run `VoiceRefine.exe`.

## Windows Web Installer

Use this for a more normal Windows setup flow.

```powershell
npm run make:win:installer
```

Output:

```text
dist/nsis-web/VoiceRefineSetup-1.0.0.exe
dist/nsis-web/voicerefine-desktop-1.0.0-x64.nsis.7z
dist/nsis-web/latest.yml
```

The setup EXE is small. The `.7z` file contains the app and bundled local models. For release hosting, upload all files from `dist/nsis-web` together so the setup EXE can find the model package.

This still keeps transcription and transform local after installation. The web installer only changes how the app is delivered.

## Why Not One Offline Setup EXE Yet?

The current local model payload is several GB. A single embedded NSIS setup EXE failed during compilation because NSIS could not memory-map the large compressed app package. The web installer avoids that by keeping the large package as a separate file.

## Code Signing

Unsigned Windows apps can trigger Microsoft Defender SmartScreen warnings. A public Windows release should be signed with an Authenticode code-signing certificate.

For electron-builder, signing can be provided through environment variables before running the installer build:

```powershell
$env:CSC_LINK="C:\path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD="certificate-password"
npm run make:win:installer
```

Do not commit certificates or passwords to Git. Store signing credentials in a local secret store or GitHub Actions secrets when release automation is added.

## Recommended Next Packaging Step

The web installer is workable for beta distribution, but the better long-term design is:

- Small signed installer
- First-launch download for optional local models
- Built-in integrity checks for downloaded model files
- A full offline installer only for users who explicitly want it
