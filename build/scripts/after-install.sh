#!/bin/sh
# Install the jarvis CLI helper on Linux.
set -e
CLI=/opt/Jarvis/resources/bin/jarvis.py
if [ -f "$CLI" ]; then
  chmod 755 "$CLI"
  ln -sf "$CLI" /usr/bin/jarvis
fi
exit 0
