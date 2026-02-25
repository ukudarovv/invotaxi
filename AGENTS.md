# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

Invo Taxi is a taxi dispatch application for a disability advocacy organization in Kazakhstan. It has three components: Django backend, React+Vite frontend admin dashboard, and a Flutter mobile app (optional for cloud dev).

### Services

| Service | Port | How to start |
|---------|------|-------------|
| Backend (Django) | 8000 | `cd backend && source venv/bin/activate && python manage.py runserver 0.0.0.0:8000` |
| Frontend (Vite) | 5173 | `cd frontend && npm run dev -- --host 0.0.0.0` |

### Non-obvious notes

- **python3.12-venv** must be installed (`sudo apt-get install -y python3.12-venv`) before creating the virtualenv. The system Python is 3.12 and the `venv` module is not included by default.
- Backend uses **SQLite** in dev mode (no external DB needed). The database file is at `backend/db.sqlite3`.
- WebSocket uses **InMemoryChannelLayer** in dev (no Redis needed).
- The `SECRET_KEY` has a fallback default in `settings.py`, so no `.env` file is strictly required for dev.
- **OTP codes** in dev mode are printed to the Django server's stdout. You can also read them from the database via `python manage.py shell` (query `accounts.models.OTPCode`).
- After running `python manage.py migrate`, load test data with `python manage.py load_mock_data`. This creates 5 regions, 10 drivers, 51 passengers, and 5 sample orders.
- Frontend login requires an admin user. Create one with: `cd backend && source venv/bin/activate && python manage.py shell -c "from accounts.models import User; User.objects.create_superuser(username='admin', password='admin123', role='admin')"`.
- The frontend at `package.json` has a `pnpm.overrides` section but uses **npm** (has `package-lock.json`). Use `npm install` not pnpm.
- `npm run build` runs `vite build`. No dedicated lint or TypeScript check scripts are configured in the frontend.
- Backend tests: `cd backend && source venv/bin/activate && python manage.py test`. Currently 0 tests defined.
- The Flutter mobile app (`invo_taxi_app/`) requires Flutter SDK which is not available in the cloud VM. Skip it for cloud development.
