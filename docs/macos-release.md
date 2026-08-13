# macOS release signing

The release workflow builds Intel (`x64`) and Apple Silicon (`arm64`) DMG and ZIP files on every `v*.*.*` tag. A macOS app can be built without credentials, but Gatekeeper will warn users about an unsigned app.

For a public release, add these repository Actions secrets before pushing the tag:

- `MAC_CSC_LINK`: base64-encoded Developer ID Application `.p12` certificate
- `MAC_CSC_KEY_PASSWORD`: password for that certificate
- `APPLE_API_KEY`: base64-encoded App Store Connect API key `.p8`
- `APPLE_API_KEY_ID`: App Store Connect key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID

With all five values present, Electron Builder signs the app and submits it for notarization automatically. This requires an active Apple Developer Program membership and a Developer ID Application certificate. If the secrets are absent, the workflow still creates an unsigned test build, which is not appropriate for a public macOS release.
