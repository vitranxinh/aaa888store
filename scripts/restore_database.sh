#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_SCRIPT="${ROOT_DIR}/scripts/backup_database.sh"
INPUT_FILE="${1:-}"

if [ -z "$INPUT_FILE" ]; then
  echo "Cách dùng: bash scripts/restore_database.sh /duong-dan/toi/file.dump.enc" >&2
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo "Không tìm thấy file backup: $INPUT_FILE" >&2
  exit 1
fi

if [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  . "${ROOT_DIR}/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL chưa được cấu hình trong .env" >&2
  exit 1
fi

# Prisma thường thêm query như ?schema=public, nhưng pg_restore không chấp nhận.
PG_DATABASE_URL="${DATABASE_URL%%\?*}"

PASS_SOURCE=()
PASS_VALUE=""

if [ -n "${BACKUP_PASSPHRASE_FILE:-}" ] && [ -f "${BACKUP_PASSPHRASE_FILE}" ]; then
  PASS_SOURCE=(-pass file:"${BACKUP_PASSPHRASE_FILE}")
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  PASS_SOURCE=(-pass pass:"${BACKUP_PASSPHRASE}")
else
  read -r -s -p "Nhập mật khẩu giải mã backup: " PASS_VALUE
  echo
  PASS_SOURCE=(-pass pass:"$PASS_VALUE")
fi

DECRYPTED_DUMP="$(mktemp "/tmp/soban-retail-restore-XXXXXX.dump")"

cleanup() {
  rm -f "$DECRYPTED_DUMP"
}
trap cleanup EXIT

echo "Tạo backup an toàn trước khi restore..."
"$BACKUP_SCRIPT"

echo "Đang giải mã backup..."
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in "$INPUT_FILE" \
  -out "$DECRYPTED_DUMP" \
  "${PASS_SOURCE[@]}"

echo "Đang restore từ: $INPUT_FILE"
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "$PG_DATABASE_URL" \
  "$DECRYPTED_DUMP"

echo "Đã restore xong dữ liệu từ: $INPUT_FILE"
