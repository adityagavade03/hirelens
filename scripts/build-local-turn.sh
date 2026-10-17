#!/bin/sh
# Build the pinned official release into the project, without installing a service.
set -eu
project=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
archive="$project/.data/turn/coturn-4.18.0.tar.gz"
expected=28d55294ac596fbd129b293a85e7bb1c5dc4bd15b7fb55c500f355149e5f4e28
mkdir -p "$project/.data/turn/runtime"
if [ ! -f "$archive" ]; then
  curl --fail --location --max-time 120 'https://github.com/coturn/coturn/archive/refs/tags/4.18.0.tar.gz' -o "$archive"
fi
actual=$(sha256sum "$archive" | cut -d ' ' -f 1)
[ "$actual" = "$expected" ] || { echo 'Coturn source checksum does not match the reviewed release.' >&2; exit 1; }
# A path without spaces avoids upstream Makefile path assumptions.
build=$(mktemp -d /tmp/hirelens-coturn-XXXXXXXX)
tar -xzf "$archive" -C "$build"
cd "$build/coturn-4.18.0"
./configure --prefix="$build/runtime" --disable-prometheus
make -j2
cp bin/turnserver bin/turnutils_uclient "$project/.data/turn/runtime/"
printf '%s\n' 'Coturn built. Binaries are under .data/turn/runtime; no service has been exposed or started.'
