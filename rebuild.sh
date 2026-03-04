#!/bin/bash
# Пересборка и перезапуск проекта invotaxi (Ubuntu + supervisor)

set -e
cd "$(dirname "$0")"
PROJECT_ROOT="$(pwd)"

echo "=== 0. Проверка обновлений из git ==="
git fetch origin
BRANCH=$(git rev-parse --abbrev-ref HEAD)
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || true)
if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
  echo "Найдены обновления. Выполняю git pull..."
  git pull origin "$BRANCH"
else
  echo "Версия актуальна."
fi

echo ""
echo "=== 1. Backend: зависимости и миграции ==="
cd "$PROJECT_ROOT/backend"
source venv/bin/activate
pip install -r requirements.txt -q
python manage.py migrate --noinput
python manage.py collectstatic --noinput 2>/dev/null || true

echo ""
echo "=== 2. Frontend: сборка ==="
cd "$PROJECT_ROOT/frontend"
npm install
npm run build

echo ""
echo "=== 3. Перезапуск supervisor ==="
sudo supervisorctl restart invotaxi_backend invotaxi_frontend

echo ""
echo "=== Готово ==="
