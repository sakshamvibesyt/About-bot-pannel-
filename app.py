import os
import sqlite3
import secrets
import json
import hmac
import hashlib
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime
from functools import wraps

from flask import Flask, render_template, request, jsonify, session, g, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("RENDER", "").lower() == "true",
    SESSION_COOKIE_NAME="saksham_panel_session",
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get(
    "PANEL_DB",
    os.path.join(BASE_DIR, "panel.db")
)

# Bot service is the single source of truth for group coins.
BOT_API_URL = os.environ.get("BOT_API_URL", "").strip().rstrip("/")
BOT_API_SECRET = os.environ.get("BOT_API_SECRET", "").strip()
# Telegram WebApp identity verification. Set this to the same bot token used by the bot service.
TELEGRAM_BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()


# =========================================================
# DATABASE
# =========================================================

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    conn = g.pop("db", None)

    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE,
            telegram_username TEXT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            coins INTEGER NOT NULL DEFAULT 0,
            xp INTEGER NOT NULL DEFAULT 0,
            level INTEGER NOT NULL DEFAULT 1,
            vip INTEGER NOT NULL DEFAULT 0,
            elite INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS shop_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            price INTEGER NOT NULL,
            item_type TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            price INTEGER NOT NULL,
            created_at TEXT NOT NULL,

            FOREIGN KEY(user_id)
                REFERENCES users(id),

            FOREIGN KEY(item_id)
                REFERENCES shop_items(id)
        );

        CREATE TABLE IF NOT EXISTS activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL,

            FOREIGN KEY(user_id)
                REFERENCES users(id)
        );
    """)

    # Existing panel databases are upgraded in-place. This stores only the
    # selected Telegram group, never a second coin balance.
    columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "coin_chat_id" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN coin_chat_id INTEGER")

    count = conn.execute(
        "SELECT COUNT(*) FROM shop_items"
    ).fetchone()[0]

    if count == 0:
        conn.executemany(
            """
            INSERT INTO shop_items
            (name, description, price, item_type)
            VALUES (?, ?, ?, ?)
            """,
            [
                (
                    "VIP",
                    "Activate VIP status on your panel account.",
                    500,
                    "vip"
                ),
                (
                    "ELITE",
                    "Activate Elite status on your panel account.",
                    1500,
                    "elite"
                ),
                (
                    "Custom Title",
                    "Unlock a custom title slot.",
                    1000,
                    "title"
                ),
                (
                    "Mystery Reward",
                    "Redeem a surprise reward.",
                    750,
                    "mystery"
                ),
            ]
        )

    conn.commit()
    conn.close()


# =========================================================
# AUTH
# =========================================================

def login_required(fn):

    @wraps(fn)
    def wrapper(*args, **kwargs):

        if not session.get("user_id"):
            return jsonify({
                "ok": False,
                "error": "LOGIN_REQUIRED"
            }), 401

        user = current_user()
        try:
            tg = telegram_webapp_user()
        except RuntimeError as exc:
            session.clear()
            return jsonify({"ok": False, "error": str(exc)}), 401

        if not user or not user["telegram_id"] or int(user["telegram_id"]) != int(tg["id"]):
            session.clear()
            response = jsonify({
                "ok": False,
                "error": "TELEGRAM_ACCOUNT_CHANGED"
            })
            response.headers["Cache-Control"] = "no-store"
            return response, 401

        return fn(*args, **kwargs)

    return wrapper


def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return None

    return db().execute(
        "SELECT * FROM users WHERE id=?",
        (user_id,)
    ).fetchone()


def add_activity(user_id, text):
    db().execute(
        """
        INSERT INTO activity
        (user_id, text, created_at)
        VALUES (?, ?, ?)
        """,
        (
            user_id,
            text,
            datetime.utcnow().isoformat(
                timespec="seconds"
            )
        )
    )


def bot_request(path, method="GET", payload=None, query=None):
    if not BOT_API_URL or not BOT_API_SECRET:
        raise RuntimeError("Bot connection is not configured.")

    url = BOT_API_URL + path
    if query:
        url += "?" + urllib.parse.urlencode(query)

    data = None
    headers = {"X-Panel-Secret": BOT_API_SECRET, "Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    last_error = None
    # Render services can briefly sleep; retry so a cold bot service does not
    # become a fake 0-coin wallet in the panel.
    for attempt in range(2):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                body = response.read().decode("utf-8")
                result = json.loads(body or "{}")

            if not result.get("ok"):
                raise RuntimeError(result.get("error", "Bot API request failed."))
            return result

        except urllib.error.HTTPError as exc:
            try:
                result = json.loads(exc.read().decode("utf-8") or "{}")
            except Exception:
                result = {}
            message = result.get("error", f"Bot API HTTP {exc.code}")
            last_error = RuntimeError(message)
        except Exception as exc:
            last_error = RuntimeError(f"Bot connection failed: {exc}")

        if attempt == 0:
            time.sleep(1)

    raise last_error or RuntimeError("Bot API request failed.")


def telegram_webapp_user():
    """Verify Telegram WebApp initData and return the trusted Telegram user."""
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Telegram WebApp verification is not configured on the panel.")

    raw = request.headers.get("X-Telegram-Init-Data", "").strip()
    if not raw:
        raise RuntimeError("Open the panel from Telegram to continue.")

    params = urllib.parse.parse_qs(raw, keep_blank_values=True)
    supplied_hash = params.pop("hash", [""])[0]
    if not supplied_hash:
        raise RuntimeError("Invalid Telegram WebApp data.")

    pairs = []
    for key in sorted(params):
        pairs.append(f"{key}={params[key][0]}")
    data_check_string = "\n".join(pairs)

    secret_key = hmac.new(
        b"WebAppData",
        TELEGRAM_BOT_TOKEN.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, supplied_hash):
        raise RuntimeError("Invalid Telegram WebApp signature.")

    try:
        auth_date = int(params.get("auth_date", ["0"])[0])
    except (TypeError, ValueError):
        auth_date = 0
    if not auth_date or abs(time.time() - auth_date) > 86400:
        raise RuntimeError("Telegram WebApp session expired. Reopen the panel from Telegram.")

    try:
        tg_user = json.loads(params.get("user", ["{}"]) [0])
        tg_id = int(tg_user.get("id", 0))
    except (TypeError, ValueError, json.JSONDecodeError):
        tg_user, tg_id = {}, 0

    if tg_id <= 0:
        raise RuntimeError("Telegram account could not be verified.")

    return {
        "id": tg_id,
        "username": tg_user.get("username") or "",
        "first_name": tg_user.get("first_name") or "",
    }


def verified_telegram_id():
    try:
        return int(telegram_webapp_user()["id"])
    except Exception:
        return None


def user_coin_chat_id(user):
    if not user or not user["telegram_id"]:
        return None
    try:
        telegram_id = int(user["telegram_id"])
    except (TypeError, ValueError):
        return None

    selected = user["coin_chat_id"] if "coin_chat_id" in user.keys() else None
    try:
        groups = bot_request("/panel-api/groups", query={"user_id": telegram_id}).get("groups", [])
    except Exception:
        return int(selected) if selected else None

    valid = {int(group["chat_id"]) for group in groups}
    if selected and int(selected) in valid:
        return int(selected)

    # If the Telegram account belongs to exactly one bot group, select it
    # automatically so the wallet cannot remain at a misleading zero.
    if len(groups) == 1:
        new_chat = int(groups[0]["chat_id"])
        conn = db()
        conn.execute("UPDATE users SET coin_chat_id=? WHERE id=?", (new_chat, user["id"]))
        conn.commit()
        return new_chat

    return None


def wallet_for_user(user):
    empty = {
        "chat_id": None,
        "balance": 0,
        "vip": False,
        "elite": False,
        "groups": [],
        "wallet_online": False,
    }
    if not user or not user["telegram_id"]:
        empty["wallet_error"] = "Telegram account is not linked to this panel account."
        return empty

    try:
        telegram_id = int(user["telegram_id"])
        groups = bot_request(
            "/panel-api/groups",
            query={"user_id": telegram_id},
        ).get("groups", [])
        chat_id = user_coin_chat_id(user)

        if not chat_id:
            empty.update({"groups": groups, "wallet_online": True})
            empty["wallet_error"] = "Select your Telegram group to show its coin balance."
            return empty

        result = bot_request(
            "/panel-api/wallet",
            query={"chat_id": int(chat_id), "user_id": telegram_id},
        )
        return {**result, "groups": groups, "wallet_online": True}
    except Exception as exc:
        empty["wallet_error"] = str(exc)
        return empty


def serialize_user(user, wallet=None):

    if not user:
        return None

    wallet = wallet or {}
    return {
        "id": user["id"],
        "username": user["username"],
        "telegram_username": user["telegram_username"],
        "telegram_id": user["telegram_id"],
        "coins": int(wallet.get("balance", 0)),
        "coin_chat_id": wallet.get("chat_id"),
        "coin_groups": wallet.get("groups", []),
        "xp": user["xp"],
        "level": user["level"],
        "vip": bool(wallet.get("vip", user["vip"])),
        "elite": bool(wallet.get("elite", user["elite"])),
        "created_at": user["created_at"],
        "wallet_online": bool(wallet.get("wallet_online", False)),
        "wallet_warning": wallet.get("wallet_error"),
    }


# =========================================================
# MAIN PAGE
# =========================================================

@app.get("/")
@app.get("/panel")
def index():

    return render_template(
        "index.html",
        cache_version=int(datetime.utcnow().timestamp())
    )


@app.get("/health")
def health():

    return jsonify({
        "ok": True,
        "service": "Saksham Panel"
    })


# =========================================================
# REGISTER
# =========================================================

@app.post("/api/register")
def register():

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username", "")
    ).strip().lower()

    password = str(
        data.get("password", "")
    )

    try:
        tg = telegram_webapp_user()
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 401

    telegram_id = str(tg["id"])
    telegram_username = ("@" + tg["username"]) if tg.get("username") else None

    if len(username) < 3 or len(username) > 32:

        return jsonify({
            "ok": False,
            "error": "Username must be 3-32 characters."
        }), 400

    if not username.replace("_", "").isalnum():

        return jsonify({
            "ok": False,
            "error": "Use only letters, numbers and underscore."
        }), 400

    if len(password) < 6:

        return jsonify({
            "ok": False,
            "error": "Password must be at least 6 characters."
        }), 400

    conn = db()

    try:

        conn.execute(
            """
            INSERT INTO users
            (
                telegram_id,
                telegram_username,
                username,
                password_hash,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                telegram_id,
                telegram_username,
                username,
                generate_password_hash(password),
                datetime.utcnow().isoformat(
                    timespec="seconds"
                )
            )
        )

        conn.commit()

    except sqlite3.IntegrityError:

        return jsonify({
            "ok": False,
            "error": "Username or Telegram account is already registered."
        }), 409

    user = conn.execute(
        "SELECT * FROM users WHERE username=?",
        (username,)
    ).fetchone()

    session.clear()
    session["user_id"] = user["id"]

    add_activity(
        user["id"],
        "Account created"
    )

    conn.commit()

    return jsonify({
        "ok": True,
        "message": "Account created successfully.",
        "user": serialize_user(user, wallet_for_user(user))
    })


# =========================================================
# LOGIN
# =========================================================

@app.post("/api/login")
def login():

    data = request.get_json(
        silent=True
    ) or {}

    username = str(
        data.get("username", "")
    ).strip().lower()

    password = str(
        data.get("password", "")
    )

    if not username or not password:

        return jsonify({
            "ok": False,
            "error": "Enter username and password."
        }), 400

    conn = db()

    user = conn.execute(
        """
        SELECT *
        FROM users
        WHERE username=?
        """,
        (username,)
    ).fetchone()

    if not user:

        return jsonify({
            "ok": False,
            "error": "Invalid username or password."
        }), 401

    if not check_password_hash(
        user["password_hash"],
        password
    ):

        return jsonify({
            "ok": False,
            "error": "Invalid username or password."
        }), 401

    try:
        tg = telegram_webapp_user()
    except RuntimeError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 401

    incoming_tg_id = str(tg["id"])
    incoming_tg_username = ("@" + tg["username"]) if tg.get("username") else None

    # A panel account is permanently bound to its Telegram account once linked.
    # This prevents another Telegram account on the same device from inheriting it.
    if user["telegram_id"] and str(user["telegram_id"]) != incoming_tg_id:
        return jsonify({
            "ok": False,
            "error": "This panel account is linked to another Telegram account."
        }), 403

    if not user["telegram_id"]:
        try:
            conn.execute(
                "UPDATE users SET telegram_id=?, telegram_username=? WHERE id=?",
                (incoming_tg_id, incoming_tg_username, user["id"]),
            )
            conn.commit()
            user = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
        except sqlite3.IntegrityError:
            return jsonify({
                "ok": False,
                "error": "This Telegram account is already linked to another panel account."
            }), 409
    else:
        conn.execute(
            "UPDATE users SET telegram_username=? WHERE id=?",
            (incoming_tg_username or user["telegram_username"], user["id"]),
        )
        conn.commit()

    # Clear any old session first.
    session.clear()

    session["user_id"] = user["id"]

    now = datetime.utcnow().isoformat(
        timespec="seconds"
    )

    conn.execute(
        """
        UPDATE users
        SET last_login=?
        WHERE id=?
        """,
        (now, user["id"])
    )

    add_activity(
        user["id"],
        "Logged in"
    )

    conn.commit()

    fresh_user = conn.execute(
        "SELECT * FROM users WHERE id=?",
        (user["id"],)
    ).fetchone()

    return jsonify({
        "ok": True,
        "message": "Login successful.",
        "user": serialize_user(fresh_user, wallet_for_user(fresh_user))
    })


# =========================================================
# LOGOUT API
# =========================================================

@app.post("/api/logout")
def logout_api():

    session.clear()

    response = jsonify({
        "ok": True,
        "message": "Logged out successfully."
    })

    response.headers["Cache-Control"] = "no-store"

    return response


# =========================================================
# LOGOUT BROWSER FALLBACK
# =========================================================

@app.get("/logout")
def logout_page():

    session.clear()

    return redirect(
        url_for("index"),
        code=302
    )


# =========================================================
# CURRENT USER
# =========================================================

@app.get("/api/me")
@login_required
def me():

    user = current_user()

    if not user:

        session.clear()

        return jsonify({
            "ok": False,
            "error": "SESSION_EXPIRED"
        }), 401

    wallet = wallet_for_user(user)

    return jsonify({
        "ok": True,
        "user": serialize_user(user, wallet),
        "wallet_warning": wallet.get("wallet_error"),
    })


@app.get("/api/groups")
@login_required
def groups():
    user = current_user()
    if not user or not user["telegram_id"]:
        return jsonify({"ok": True, "groups": []})
    try:
        result = bot_request("/panel-api/groups", query={"user_id": int(user["telegram_id"])})
        selected = user_coin_chat_id(user)
    except (ValueError, RuntimeError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503
    return jsonify({"ok": True, "groups": result.get("groups", []), "selected": selected})


@app.post("/api/groups/select")
@login_required
def select_group():
    data = request.get_json(silent=True) or {}
    try:
        chat_id = int(data.get("chat_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid group."}), 400
    user = current_user()
    if not user or not user["telegram_id"]:
        return jsonify({"ok": False, "error": "Telegram account is not linked."}), 400
    try:
        groups = bot_request("/panel-api/groups", query={"user_id": int(user["telegram_id"])})["groups"]
    except (ValueError, RuntimeError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503
    if chat_id not in {int(g["chat_id"]) for g in groups}:
        return jsonify({"ok": False, "error": "You are not linked to this group."}), 403
    conn = db()
    conn.execute("UPDATE users SET coin_chat_id=? WHERE id=?", (chat_id, user["id"]))
    conn.commit()
    fresh = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    wallet = wallet_for_user(fresh)
    return jsonify({"ok": True, "user": serialize_user(fresh, wallet), "wallet_warning": wallet.get("wallet_error")})


# =========================================================
# SHOP
# =========================================================

@app.get("/api/shop")
@login_required
def shop():

    rows = db().execute(
        """
        SELECT
            id,
            name,
            description,
            price,
            item_type
        FROM shop_items
        WHERE active=1
        ORDER BY price
        """
    ).fetchall()

    return jsonify({
        "ok": True,
        "items": [
            dict(row)
            for row in rows
        ]
    })


@app.post("/api/shop/buy")
@login_required
def buy():

    data = request.get_json(silent=True) or {}

    try:
        item_id = int(data.get("item_id"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "Invalid item."}), 400

    conn = db()
    item = conn.execute(
        "SELECT * FROM shop_items WHERE id=? AND active=1",
        (item_id,)
    ).fetchone()
    if not item:
        return jsonify({"ok": False, "error": "Item not found."}), 404

    user = conn.execute("SELECT * FROM users WHERE id=?", (session["user_id"],)).fetchone()
    if not user or not user["telegram_id"]:
        return jsonify({"ok": False, "error": "Telegram account is not linked."}), 400

    chat_id = user_coin_chat_id(user)
    if not chat_id:
        return jsonify({"ok": False, "error": "Select a Telegram group first."}), 400

    try:
        debit = bot_request(
            "/panel-api/wallet/debit",
            method="POST",
            payload={
                "chat_id": int(chat_id),
                "user_id": int(user["telegram_id"]),
                "amount": int(item["price"]),
            },
        )
    except RuntimeError as exc:
        status = 400 if str(exc) == "NOT_ENOUGH_COINS" else 503
        return jsonify({"ok": False, "error": "Not enough coins." if status == 400 else str(exc)}), status

    try:
        if item["item_type"] == "vip":
            conn.execute("UPDATE users SET vip=1 WHERE id=?", (user["id"],))
        elif item["item_type"] == "elite":
            conn.execute("UPDATE users SET elite=1 WHERE id=?", (user["id"],))

        conn.execute(
            "INSERT INTO purchases(user_id,item_id,price,created_at) VALUES(?,?,?,?)",
            (user["id"], item["id"], item["price"], datetime.utcnow().isoformat(timespec="seconds")),
        )
        add_activity(user["id"], f"Purchased {item['name']} for {item['price']} coins")
        conn.commit()
    except Exception as exc:
        conn.rollback()
        # The wallet debit already succeeded; keep the user informed rather than
        # pretending the purchase failed. The transaction is still recorded by
        # the bot wallet itself.
        return jsonify({
            "ok": True,
            "message": f"{item['name']} purchased. Wallet updated.",
            "warning": str(exc),
            "user": serialize_user(user, {"balance": debit["balance"], "chat_id": chat_id}),
        })

    fresh = conn.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    try:
        wallet = wallet_for_user(fresh)
    except RuntimeError:
        wallet = {"balance": debit["balance"], "chat_id": chat_id}

    return jsonify({
        "ok": True,
        "message": f"{item['name']} purchased.",
        "user": serialize_user(fresh, wallet)
    })


# =========================================================
# ACTIVITY
# =========================================================

@app.get("/api/activity")
@login_required
def activity():

    rows = db().execute(
        """
        SELECT
            text,
            created_at
        FROM activity
        WHERE user_id=?
        ORDER BY id DESC
        LIMIT 20
        """,
        (session["user_id"],)
    ).fetchall()

    return jsonify({
        "ok": True,
        "activity": [
            dict(row)
            for row in rows
        ]
    })


# =========================================================
# STATS
# =========================================================

@app.get("/api/stats")
@login_required
def stats():

    user_id = session["user_id"]

    conn = db()

    purchases = conn.execute(
        """
        SELECT COUNT(*)
        FROM purchases
        WHERE user_id=?
        """,
        (user_id,)
    ).fetchone()[0]

    rank = conn.execute(
        """
        SELECT COUNT(*) + 1
        FROM users
        WHERE xp >
        (
            SELECT xp
            FROM users
            WHERE id=?
        )
        """,
        (user_id,)
    ).fetchone()[0]

    return jsonify({
        "ok": True,
        "rank": rank,
        "purchases": purchases
    })


# =========================================================
# CHANGE PASSWORD
# =========================================================

@app.post("/api/settings/password")
@login_required
def change_password():

    data = request.get_json(
        silent=True
    ) or {}

    old_password = str(
        data.get("old_password", "")
    )

    new_password = str(
        data.get("new_password", "")
    )

    user = current_user()

    if not user:

        return jsonify({
            "ok": False,
            "error": "Session expired."
        }), 401

    if not check_password_hash(
        user["password_hash"],
        old_password
    ):

        return jsonify({
            "ok": False,
            "error": "Current password is incorrect."
        }), 400

    if len(new_password) < 6:

        return jsonify({
            "ok": False,
            "error": "New password must be at least 6 characters."
        }), 400

    db().execute(
        """
        UPDATE users
        SET password_hash=?
        WHERE id=?
        """,
        (
            generate_password_hash(new_password),
            user["id"]
        )
    )

    add_activity(
        user["id"],
        "Password changed"
    )

    db().commit()

    return jsonify({
        "ok": True,
        "message": "Password changed successfully."
    })


# =========================================================
# INIT
# =========================================================

with app.app_context():
    init_db()


if __name__ == "__main__":

    port = int(
        os.environ.get("PORT", "5000")
    )

    app.run(
        host="0.0.0.0",
        port=port
    )
