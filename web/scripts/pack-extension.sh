#!/bin/sh
# Builds the zip the website offers. Run after changing anything in extension/.
cd "$(dirname "$0")/../../extension" || exit 1
rm -f ../web/public/placementshield-extension.zip
zip -qr ../web/public/placementshield-extension.zip . -x '.*'
