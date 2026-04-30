#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_BACKUP_DIR="${ROOT_DIR}/backups/database"
BACKUP_DIR="${1:-${BACKUP_TARGET_DIR:-$DEFAULT_BACKUP_DIR}}"
mkdir -p "$BACKUP_DIR"

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  . "${ROOT_DIR}/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL chưa được cấu hình trong .env" >&2
  exit 1
fi

# Prisma thường thêm query như ?schema=public, nhưng pg_dump không chấp nhận.
PG_DATABASE_URL="${DATABASE_URL%%\?*}"

PASS_SOURCE=()
PASS_VALUE=""

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "${BACKUP_PASSPHRASE_FILE}" ]; then
  PASS_SOURCE=(-pass file:"${BACKUP_PASSPHRASE_FILE}")
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  PASS_SOURCE=(-pass pass:"${BACKUP_PASSPHRASE}")
else
  read -r -s -p "Nhập mật khẩu mã hóa backup: " PASS_VALUE
  echo
  read -r -s -p "Nhập lại mật khẩu: " PASS_CONFIRM
  echo

  if [ "$PASS_VALUE" != "$PASS_CONFIRM" ]; then
    echo "Mật khẩu không khớp." >&2
    exit 1
  fi

  PASS_SOURCE=(-pass pass:"$PASS_VALUE")
fi

TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
RAW_DUMP="$(mktemp "/tmp/soban-retail-${TIMESTAMP}-XXXXXX.dump")"
OUTPUT_FILE="${BACKUP_DIR}/soban-retail-${TIMESTAMP}.dump.enc"

cleanup() {
  rm -f "$RAW_DUMP"
}
trap cleanup EXIT

pg_dump "$PG_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "$RAW_DUMP"

openssl enc -aes-256-cbc -pbkdf2 -salt \
  -in "$RAW_DUMP" \
  -out "$OUTPUT_FILE" \
  "${PASS_SOURCE[@]}"

ln -sfn "$OUTPUT_FILE" "${BACKUP_DIR}/latest.dump.enc"

echo "Đã tạo backup mã hóa: $OUTPUT_FILE"
