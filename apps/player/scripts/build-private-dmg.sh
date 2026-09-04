#!/bin/zsh
set -euo pipefail

ROOT=${0:A:h:h}
cd "$ROOT"
npm run build
rm -rf release
mkdir -p release/stage/app release/dmg-root
rsync -a --exclude='*.mp3' --exclude='*.wav' dist/ release/stage/app/dist/
cp -R electron release/stage/app/
cp package.json release/stage/app/
cp -R node_modules/electron/dist/Electron.app 'release/BlackMamba Music.app'
npx asar pack release/stage/app 'release/BlackMamba Music.app/Contents/Resources/app.asar'
/usr/libexec/PlistBuddy \
  -c 'Set :CFBundleName BlackMamba Music' \
  -c 'Set :CFBundleDisplayName BlackMamba Music' \
  -c 'Set :CFBundleIdentifier records.blackmamba.music' \
  -c 'Set :CFBundleShortVersionString 0.2.0' \
  -c 'Set :CFBundleVersion 0.2.0' \
  'release/BlackMamba Music.app/Contents/Info.plist'
codesign --force --deep --sign - 'release/BlackMamba Music.app'
cp -R 'release/BlackMamba Music.app' release/dmg-root/
ln -s /Applications release/dmg-root/Applications
hdiutil create -volname 'BlackMamba Music' -srcfolder release/dmg-root -ov -format UDZO 'release/BlackMamba-Music-0.2.0-arm64.dmg'
