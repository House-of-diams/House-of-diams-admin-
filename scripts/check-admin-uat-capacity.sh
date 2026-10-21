#!/usr/bin/env bash
set -euo pipefail
bytes=${1:?required bytes}
entries=${2:?required entries}
[[ "$bytes" =~ ^[0-9]+$ && "$entries" =~ ^[0-9]+$ ]] || exit 2
# Include compressed transfer, unpacked release, metadata and 1 GiB headroom.
required_bytes=$((bytes * 2 + 1073741824))
required_entries=$((entries + 20000))
for location in /tmp /opt/hod-admin/releases; do
  available_bytes=$(df -B1 --output=avail "$location" | tail -1 | tr -d ' ')
  available_entries=$(df -i --output=iavail "$location" | tail -1 | tr -d ' ')
  if (( available_bytes < required_bytes || available_entries < required_entries )); then
    printf 'Capacity check failed at %s: need %s bytes / %s inodes; available %s bytes / %s inodes. No release was uploaded or activated.\n' "$location" "$required_bytes" "$required_entries" "$available_bytes" "$available_entries"
    exit 1
  fi
done
echo 'Disk and inode capacity checks passed'
