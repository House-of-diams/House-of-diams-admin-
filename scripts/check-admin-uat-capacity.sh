#!/usr/bin/env bash
set -euo pipefail
bytes=${1:?required bytes}
entries=${2:?required entries}
compressed=${3:?archive bytes}
[[ "$bytes" =~ ^[0-9]+$ && "$entries" =~ ^[0-9]+$ && "$compressed" =~ ^[0-9]+$ ]] || exit 2
# /tmp can be a separate tmpfs. It holds only the compressed transfer.
# The release filesystem needs unpacked bytes plus 25% metadata margin and 512MiB.
required_bytes=$((bytes + bytes / 4 + 536870912))
required_entries=$((entries + 20000))
for location in /tmp /opt/hod-admin/releases; do
  need_bytes=$required_bytes
  need_entries=$required_entries
  if [[ "$location" = /tmp ]]; then
    need_bytes=$((compressed + 134217728))
    need_entries=100
  fi
  # When both paths share a filesystem, reserve both archive and unpacked space.
  if [[ $(stat -c %d /tmp) = $(stat -c %d /opt/hod-admin/releases) ]]; then
    need_bytes=$((required_bytes + compressed + 134217728))
    need_entries=$required_entries
  fi
  available_bytes=$(df -B1 --output=avail "$location" | tail -1 | tr -d ' ')
  available_entries=$(df --output=iavail "$location" | tail -1 | tr -d ' ')
  if (( available_bytes < need_bytes || available_entries < need_entries )); then
    printf 'Capacity check failed at %s: need %s bytes / %s inodes; available %s bytes / %s inodes. No release was uploaded or activated.\n' "$location" "$need_bytes" "$need_entries" "$available_bytes" "$available_entries"
    exit 1
  fi
done
echo 'Disk and inode capacity checks passed'
