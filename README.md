# Saksham Panel

A standalone Flask + SQLite panel designed to be deployed separately from the existing Telegram bot.

## Render

- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`
- Runtime: Python 3.11.9

Set a strong environment variable:

`SECRET_KEY=<long-random-secret>`

The panel currently has:
- separate user accounts
- hashed passwords
- session login/logout
- Telegram WebApp identity read on the client
- coins / XP / level / rank panel data
- working panel shop with transactional coin deduction
- VIP / Elite purchase status
- activity
- password change
- responsive RGB/glass UI

### Important integration note

The standalone panel intentionally does NOT modify or depend on the existing bot database. Its rank/coins/XP/shop data are panel-local until the existing bot exposes a verified API. The next integration step can connect the panel to the bot's actual data while leaving the bot commands intact.

For production Telegram Mini App authentication, the backend should validate `Telegram.WebApp.initData` server-side before trusting Telegram identity. Do not use `initDataUnsafe` as an authentication proof.
