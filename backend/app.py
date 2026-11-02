"""
Clientify — API de fidelización por puntos para barberías.
Flask + SQLite. Ejecutar:  python app.py   ->  API en http://localhost:5000/api
Si existe ../frontend/dist (npm run build), también sirve la webapp React.
"""
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timedelta
from functools import wraps
from urllib.parse import quote

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
DB_PATH = os.environ.get("CLIENTIFY_DB") or os.path.join(BASE_DIR, "..", "data", "clientify.db")
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
DIST_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

DEFAULT_SETTINGS = {
    "business_name": "Barbería El Filo",
    "welcome_bonus": "5",
    "referral_bonus_referrer": "10",
    "referral_bonus_referred": "5",
    "points_per_dollar": "1",
    "birthday_bonus": "10",
    "inactive_days": "45",
    "whatsapp_country_code": "593",
    "reactivation_message": "Hola {nombre}, te extrañamos en {negocio}. Tienes {puntos} puntos esperándote: "
                            "pasa esta semana y cámbialos por un beneficio.",
    "birthday_message": "¡Feliz cumpleaños, {nombre}! De parte de {negocio} te regalamos {bono} puntos. "
                        "Pasa por la barbería a celebrarlo.",
}
TEXT_SETTINGS = ["business_name", "reactivation_message", "birthday_message"]
INT_SETTINGS = [k for k in DEFAULT_SETTINGS if k not in TEXT_SETTINGS]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    points INTEGER NOT NULL DEFAULT 0,
    referral_code TEXT UNIQUE,
    referred_by INTEGER REFERENCES users(id),
    birthday TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'servicio',
    points_cost INTEGER NOT NULL,
    stock INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    points INTEGER NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    reward_id INTEGER NOT NULL REFERENCES rewards(id),
    points INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pendiente',
    created_at TEXT NOT NULL,
    resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


# ---------------------------------------------------------------- helpers
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def rows(cursor):
    return [dict(r) for r in cursor.fetchall()]


def row(cursor):
    r = cursor.fetchone()
    return dict(r) if r else None


def err(msg, status=400):
    return jsonify({"error": msg}), status


def body():
    return request.get_json(silent=True) or {}


def unique_code(db, table, column, prefix=""):
    while True:
        code = prefix + secrets.token_hex(3).upper()
        if not db.execute(f"SELECT 1 FROM {table} WHERE {column}=?", (code,)).fetchone():
            return code


def setting(key):
    r = get_db().execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return r["value"] if r else DEFAULT_SETTINGS.get(key)


def setting_int(key):
    try:
        return int(setting(key))
    except (TypeError, ValueError):
        return 0


def all_settings():
    s = {k: setting(k) for k in DEFAULT_SETTINGS}
    for k in INT_SETTINGS:
        s[k] = int(s[k])
    return s


def add_points(db, user_id, points, type_, description, created_by=None):
    """Única vía para mover puntos: actualiza saldo y deja rastro en el historial."""
    db.execute("UPDATE users SET points = points + ? WHERE id=?", (points, user_id))
    db.execute(
        "INSERT INTO transactions (user_id, type, points, description, created_by, created_at)"
        " VALUES (?,?,?,?,?,?)", (user_id, type_, points, description, created_by, now()))


def public_user(u):
    return {k: u[k] for k in ("id", "name", "email", "phone", "role", "points",
                              "referral_code", "birthday", "created_at")}


def clean_birthday(value):
    """Devuelve 'YYYY-MM-DD', '' si viene vacío, o None si la fecha no es válida."""
    value = (value or "").strip()
    if not value:
        return ""
    try:
        d = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None
    return value if date(1900, 1, 1) <= d <= date.today() else None


def grant_birthday_bonus(db, u, created_by=None):
    """Regala los puntos de cumpleaños, una sola vez por año. Devuelve los puntos otorgados (0 si no aplica)."""
    bonus = setting_int("birthday_bonus")
    if bonus <= 0 or not u["birthday"]:
        return 0
    year = datetime.now().strftime("%Y")
    if db.execute("SELECT 1 FROM transactions WHERE user_id=? AND type='cumpleanos' AND created_at LIKE ?",
                  (u["id"], year + "%")).fetchone():
        return 0
    add_points(db, u["id"], bonus, "cumpleanos", "Regalo de cumpleaños", created_by)
    return bonus


def whatsapp_url(phone, message):
    """Enlace wa.me con el mensaje ya escrito, o None si el cliente no tiene un teléfono usable."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("00"):
        digits = digits[2:]
    cc = re.sub(r"\D", "", setting("whatsapp_country_code") or "")
    if not digits:
        return None
    if digits.startswith("0"):
        digits = cc + digits.lstrip("0")
    elif not (cc and digits.startswith(cc) and len(digits) >= 11) and len(digits) <= 10:
        digits = cc + digits
    return f"https://wa.me/{digits}?text={quote(message)}"


def render_message(template, client):
    """Rellena {nombre}, {negocio}, {puntos} y {bono} sin fallar si la plantilla trae otras llaves."""
    values = {"nombre": (client["name"].split() or [""])[0], "negocio": setting("business_name"),
              "puntos": client["points"], "bono": setting_int("birthday_bonus")}
    for k, v in values.items():
        template = template.replace("{" + k + "}", str(v))
    return template


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    # Migración mínima: bases creadas antes de existir la fecha de cumpleaños.
    if "birthday" not in [r[1] for r in db.execute("PRAGMA table_info(users)")]:
        db.execute("ALTER TABLE users ADD COLUMN birthday TEXT")
    for k, v in DEFAULT_SETTINGS.items():
        db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)", (k, v))
    if not db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        db.execute(
            "INSERT INTO users (name, email, phone, password_hash, role, referral_code, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            ("Administrador", os.environ.get("ADMIN_EMAIL", "admin@barberia.com"), "",
             generate_password_hash(os.environ.get("ADMIN_PASSWORD", "admin123")),
             "admin", unique_code(db, "users", "referral_code"), now()))
    if not db.execute("SELECT 1 FROM rewards").fetchone():
        for name, desc, cat, cost, stock in [
            ("Corte clásico (sin estilo)", "Corte de cabello tradicional, sin diseño.", "servicio", 60, None),
            ("Corte con estilo / diseño", "Fade, diseño, líneas o corte específico a elección.", "servicio", 100, None),
            ("Cera para cabello", "Cera de fijación media, acabado mate.", "producto", 120, 20),
        ]:
            db.execute("INSERT INTO rewards (name, description, category, points_cost, stock,"
                       " created_at) VALUES (?,?,?,?,?,?)", (name, desc, cat, cost, stock, now()))
    db.commit()
    db.close()


# ---------------------------------------------------------------- auth
def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    if "user" not in g:
        g.user = get_db().execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return g.user


def login_required(view):
    @wraps(view)
    def wrapped(*a, **kw):
        if not current_user():
            return err("No has iniciado sesión.", 401)
        return view(*a, **kw)
    return wrapped


def role_required(role):
    def deco(view):
        @wraps(view)
        def wrapped(*a, **kw):
            u = current_user()
            if not u:
                return err("No has iniciado sesión.", 401)
            if u["role"] != role:
                return err("No tienes acceso a esta sección.", 403)
            return view(*a, **kw)
        return wrapped
    return deco


admin_required = role_required("admin")
client_required = role_required("client")


@app.get("/api/me")
def me():
    u = current_user()
    if not u:
        return err("No has iniciado sesión.", 401)
    return jsonify(public_user(u))


@app.get("/api/public")
def public_info():
    """Datos públicos para la pantalla de registro / login."""
    data = {"business_name": setting("business_name"),
            "welcome_bonus": setting_int("welcome_bonus"),
            "referral_bonus_referred": setting_int("referral_bonus_referred"),
            "referral_bonus_referrer": setting_int("referral_bonus_referrer"),
            "referrer": None}
    code = (request.args.get("ref") or "").strip().upper()
    if code:
        r = get_db().execute("SELECT name FROM users WHERE referral_code=? AND role='client'",
                             (code,)).fetchone()
        data["referrer"] = r["name"] if r else None
    return jsonify(data)


@app.post("/api/login")
def login():
    d = body()
    email = (d.get("email") or "").strip().lower()
    u = get_db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not u or not check_password_hash(u["password_hash"], d.get("password") or ""):
        return err("Correo o contraseña incorrectos.", 401)
    session.clear()
    session["user_id"] = u["id"]
    return jsonify(public_user(u))


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.put("/api/profile")
@client_required
def update_profile():
    """El cliente completa o corrige su fecha de cumpleaños."""
    birthday = clean_birthday(body().get("birthday"))
    if birthday is None:
        return err("La fecha de cumpleaños no es válida.")
    db = get_db()
    uid = current_user()["id"]
    db.execute("UPDATE users SET birthday=? WHERE id=?", (birthday or None, uid))
    db.commit()
    return jsonify(public_user(db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()))


@app.post("/api/password")
@login_required
def change_password():
    """Cambio de clave propio: exige la clave actual."""
    d = body()
    u = current_user()
    if not check_password_hash(u["password_hash"], d.get("current_password") or ""):
        return err("La clave actual no es correcta.")
    new = d.get("new_password") or ""
    if len(new) < 6:
        return err("La nueva clave debe tener al menos 6 caracteres.")
    if new == d.get("current_password"):
        return err("La nueva clave debe ser distinta de la actual.")
    db = get_db()
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), u["id"]))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/register")
def register():
    db = get_db()
    d = body()
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    phone = (d.get("phone") or "").strip()
    password = d.get("password") or ""
    ref_code = (d.get("ref") or "").strip().upper()
    birthday = clean_birthday(d.get("birthday"))

    referrer = None
    if ref_code:
        referrer = db.execute("SELECT id, name FROM users WHERE referral_code=? AND role='client'",
                              (ref_code,)).fetchone()
    if len(name) < 2:
        return err("Ingresa tu nombre.")
    if "@" not in email:
        return err("Ingresa un correo válido.")
    if len(password) < 6:
        return err("La contraseña debe tener al menos 6 caracteres.")
    if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        return err("Ya existe una cuenta con ese correo.")
    if ref_code and not referrer:
        return err("El código de referido no es válido.")
    if birthday is None:
        return err("La fecha de cumpleaños no es válida.")

    cur = db.execute(
        "INSERT INTO users (name, email, phone, password_hash, role, referral_code, referred_by,"
        " birthday, created_at) VALUES (?,?,?,?, 'client', ?,?,?,?)",
        (name, email, phone, generate_password_hash(password),
         unique_code(db, "users", "referral_code"), referrer["id"] if referrer else None,
         birthday or None, now()))
    uid = cur.lastrowid
    if setting_int("welcome_bonus"):
        add_points(db, uid, setting_int("welcome_bonus"), "bienvenida", "Bono de bienvenida")
    if referrer:
        if setting_int("referral_bonus_referred"):
            add_points(db, uid, setting_int("referral_bonus_referred"), "referido",
                       f"Bono por registrarte con el código de {referrer['name']}")
        if setting_int("referral_bonus_referrer"):
            add_points(db, referrer["id"], setting_int("referral_bonus_referrer"), "referido",
                       f"Bono por referir a {name}")
    db.commit()
    session.clear()
    session["user_id"] = uid
    u = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return jsonify(public_user(u)), 201


# ---------------------------------------------------------------- cliente
@app.get("/api/account")
@client_required
def account():
    db = get_db()
    uid = current_user()["id"]
    u = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if u["birthday"] and u["birthday"][5:7] == datetime.now().strftime("%m"):
        if grant_birthday_bonus(db, u):  # una vez al año, la primera vez que abre la app en su mes
            db.commit()
            u = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    # El aviso no depende de esta respuesta: la app puede pedir la cuenta varias veces seguidas
    # (React StrictMode en desarrollo, recargas) y el regalo solo se entrega en la primera.
    recent = db.execute(
        "SELECT points FROM transactions WHERE user_id=? AND type='cumpleanos' AND created_at >= ?"
        " ORDER BY id DESC LIMIT 1",
        (uid, (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M"))).fetchone()
    return jsonify({
        "birthday_gift": recent["points"] if recent else 0,
        "user": public_user(u),
        "rewards": rows(db.execute("SELECT * FROM rewards WHERE active=1 ORDER BY points_cost")),
        "history": rows(db.execute(
            "SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 30", (uid,))),
        "redemptions": rows(db.execute(
            "SELECT r.*, w.name AS reward_name FROM redemptions r JOIN rewards w ON w.id=r.reward_id"
            " WHERE r.user_id=? ORDER BY r.id DESC LIMIT 20", (uid,))),
        "referrals": rows(db.execute(
            "SELECT name, created_at FROM users WHERE referred_by=? ORDER BY id DESC", (uid,))),
        "settings": all_settings(),
    })


@app.post("/api/redeem/<int:reward_id>")
@client_required
def redeem(reward_id):
    db = get_db()
    uid = current_user()["id"]
    reward = db.execute("SELECT * FROM rewards WHERE id=? AND active=1", (reward_id,)).fetchone()
    if not reward:
        return err("Ese beneficio ya no está disponible.")
    if reward["stock"] is not None and reward["stock"] <= 0:
        return err("Ese producto está agotado por ahora.")
    points = db.execute("SELECT points FROM users WHERE id=?", (uid,)).fetchone()["points"]
    if points < reward["points_cost"]:
        return err(f"Te faltan {reward['points_cost'] - points} pts para «{reward['name']}».")
    code = unique_code(db, "redemptions", "code", "C-")
    db.execute("INSERT INTO redemptions (user_id, reward_id, points, code, created_at)"
               " VALUES (?,?,?,?,?)", (uid, reward["id"], reward["points_cost"], code, now()))
    add_points(db, uid, -reward["points_cost"], "canje", f"Canje: {reward['name']} ({code})")
    if reward["stock"] is not None:
        db.execute("UPDATE rewards SET stock = stock - 1 WHERE id=?", (reward["id"],))
    db.commit()
    return jsonify({"code": code, "reward": reward["name"]}), 201


# ---------------------------------------------------------------- admin
@app.get("/api/admin/dashboard")
@admin_required
def admin_dashboard():
    db = get_db()
    one = lambda sql: db.execute(sql).fetchone()[0]
    stats = {
        "clients": one("SELECT COUNT(*) FROM users WHERE role='client'"),
        "new_clients_30d": one("SELECT COUNT(*) FROM users WHERE role='client'"
                               f" AND created_at >= '{(datetime.now() - timedelta(days=30)):%Y-%m-%d}'"),
        "points_out": one("SELECT COALESCE(SUM(points),0) FROM users WHERE role='client'"),
        "points_redeemed": one("SELECT COALESCE(SUM(points),0) FROM redemptions WHERE status!='cancelado'"),
        "pending": one("SELECT COUNT(*) FROM redemptions WHERE status='pendiente'"),
        "delivered": one("SELECT COUNT(*) FROM redemptions WHERE status='entregado'"),
        "referred": one("SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL"),
    }
    # Puntos otorgados vs canjeados, últimos 14 días
    start = datetime.now().date() - timedelta(days=13)
    daily = {(start + timedelta(days=i)).isoformat(): {"earned": 0, "redeemed": 0} for i in range(14)}
    for r in db.execute(
            "SELECT substr(created_at,1,10) AS d, SUM(points) AS earned FROM transactions"
            " WHERE points>0 AND type!='reembolso' AND created_at >= ? GROUP BY d",
            (start.isoformat(),)):
        if r["d"] in daily:
            daily[r["d"]]["earned"] = r["earned"]
    for r in db.execute(
            "SELECT substr(created_at,1,10) AS d, SUM(points) AS redeemed FROM redemptions"
            " WHERE status!='cancelado' AND created_at >= ? GROUP BY d", (start.isoformat(),)):
        if r["d"] in daily:
            daily[r["d"]]["redeemed"] = r["redeemed"]
    return jsonify({
        "stats": stats,
        "daily": [{"date": d, **v} for d, v in daily.items()],
        "pending": rows(db.execute(
            "SELECT r.*, u.name AS client_name, w.name AS reward_name FROM redemptions r"
            " JOIN users u ON u.id=r.user_id JOIN rewards w ON w.id=r.reward_id"
            " WHERE r.status='pendiente' ORDER BY r.id DESC LIMIT 6")),
        "activity": rows(db.execute(
            "SELECT t.*, u.name AS client_name FROM transactions t JOIN users u ON u.id=t.user_id"
            " ORDER BY t.id DESC LIMIT 8")),
        "top": rows(db.execute(
            "SELECT id, name, points FROM users WHERE role='client' ORDER BY points DESC LIMIT 5")),
        "top_rewards": rows(db.execute(
            "SELECT w.name, COUNT(r.id) AS n FROM rewards w LEFT JOIN redemptions r"
            " ON r.reward_id=w.id AND r.status!='cancelado' GROUP BY w.id ORDER BY n DESC LIMIT 5")),
    })


@app.get("/api/admin/clients")
@admin_required
def admin_clients():
    q = (request.args.get("q") or "").strip()
    sql = ("SELECT u.id, u.name, u.email, u.phone, u.points, u.referral_code, u.created_at,"
           " r.name AS referrer_name,"
           " (SELECT COUNT(*) FROM users x WHERE x.referred_by=u.id) AS n_referrals,"
           " (SELECT MAX(created_at) FROM transactions t WHERE t.user_id=u.id AND t.type='visita') AS last_visit"
           " FROM users u LEFT JOIN users r ON r.id=u.referred_by WHERE u.role='client'")
    params = []
    if q:
        sql += " AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)"
        params = [f"%{q}%"] * 3
    sql += " ORDER BY u.id DESC"
    return jsonify(rows(get_db().execute(sql, params)))


def _client_or_404(uid):
    return get_db().execute("SELECT * FROM users WHERE id=? AND role='client'", (uid,)).fetchone()


@app.get("/api/admin/clients/by-code/<code>")
@admin_required
def admin_client_by_code(code):
    """Resuelve el código del QR del cliente (su referral_code) a su ficha."""
    c = get_db().execute("SELECT id FROM users WHERE referral_code=? AND role='client'",
                         (code.strip().upper(),)).fetchone()
    if not c:
        return err("No hay ningún cliente con ese código.", 404)
    return jsonify({"id": c["id"]})


@app.post("/api/admin/clients")
@admin_required
def admin_client_create():
    """Registro rápido en el mostrador: el admin define la clave inicial y se la entrega al cliente."""
    db = get_db()
    d = body()
    name = (d.get("name") or "").strip()
    phone = (d.get("phone") or "").strip()
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    birthday = clean_birthday(d.get("birthday"))
    if len(name) < 2:
        return err("Ingresa el nombre del cliente.")
    if birthday is None:
        return err("La fecha de cumpleaños no es válida.")
    if "@" not in email:
        return err("Ingresa un correo válido.")
    if len(password) < 6:
        return err("La clave debe tener al menos 6 caracteres.")
    if db.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        return err("Ya existe una cuenta con ese correo.")
    if phone and db.execute("SELECT 1 FROM users WHERE phone=? AND role='client'", (phone,)).fetchone():
        return err("Ya existe un cliente con ese teléfono.")
    code = unique_code(db, "users", "referral_code")
    cur = db.execute(
        "INSERT INTO users (name, email, phone, password_hash, role, referral_code, birthday, created_at)"
        " VALUES (?,?,?,?, 'client', ?,?,?)",
        (name, email, phone, generate_password_hash(password), code, birthday or None, now()))
    uid = cur.lastrowid
    if setting_int("welcome_bonus"):
        add_points(db, uid, setting_int("welcome_bonus"), "bienvenida", "Bono de bienvenida",
                   current_user()["id"])
    db.commit()
    return jsonify({"id": uid}), 201


@app.get("/api/admin/clients/<int:uid>")
@admin_required
def admin_client_detail(uid):
    db = get_db()
    c = _client_or_404(uid)
    if not c:
        return err("Cliente no encontrado.", 404)
    referrer = None
    if c["referred_by"]:
        referrer = row(db.execute("SELECT id, name FROM users WHERE id=?", (c["referred_by"],)))
    return jsonify({
        "client": public_user(c),
        "referrer": referrer,
        "history": rows(db.execute(
            "SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC", (uid,))),
        "redemptions": rows(db.execute(
            "SELECT r.*, w.name AS reward_name FROM redemptions r JOIN rewards w ON w.id=r.reward_id"
            " WHERE r.user_id=? ORDER BY r.id DESC", (uid,))),
        "referrals": rows(db.execute(
            "SELECT id, name, created_at FROM users WHERE referred_by=?", (uid,))),
        "points_per_dollar": setting_int("points_per_dollar"),
    })


@app.post("/api/admin/clients/<int:uid>/password")
@admin_required
def admin_client_password(uid):
    """El admin restablece la clave de un cliente que la olvidó y se la entrega en persona."""
    if not _client_or_404(uid):
        return err("Cliente no encontrado.", 404)
    new = body().get("new_password") or ""
    if len(new) < 6:
        return err("La clave debe tener al menos 6 caracteres.")
    db = get_db()
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), uid))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/clients/<int:uid>/visit")
@admin_required
def admin_client_visit(uid):
    c = _client_or_404(uid)
    if not c:
        return err("Cliente no encontrado.", 404)
    d = body()
    try:
        amount = float(str(d.get("amount", "0")).replace(",", "."))
    except ValueError:
        amount = 0
    pts = int(amount * setting_int("points_per_dollar"))
    if pts <= 0:
        return err("Ingresa un monto mayor a 0.")
    concept = (d.get("concept") or "").strip() or "Visita"
    db = get_db()
    add_points(db, uid, pts, "visita", f"{concept} (${amount:.2f})", current_user()["id"])
    db.commit()
    return jsonify({"points": pts})


@app.post("/api/admin/clients/<int:uid>/adjust")
@admin_required
def admin_client_adjust(uid):
    c = _client_or_404(uid)
    if not c:
        return err("Cliente no encontrado.", 404)
    d = body()
    try:
        pts = int(d.get("points", 0))
    except (TypeError, ValueError):
        pts = 0
    if pts == 0:
        return err("El ajuste no puede ser 0.")
    if c["points"] + pts < 0:
        return err("El ajuste dejaría el saldo en negativo.")
    db = get_db()
    add_points(db, uid, pts, "ajuste", (d.get("reason") or "").strip() or "Ajuste manual",
               current_user()["id"])
    db.commit()
    return jsonify({"points": pts})


def _reward_payload(d):
    name = (d.get("name") or "").strip()
    try:
        cost = int(d.get("points_cost") or 0)
        stock = d.get("stock")
        stock = None if stock in (None, "") else int(stock)
    except (TypeError, ValueError):
        return None, "Puntos y stock deben ser números enteros."
    if not name or cost <= 0:
        return None, "El beneficio necesita un nombre y un costo en puntos mayor a 0."
    if stock is not None and stock < 0:
        return None, "El stock no puede ser negativo."
    cat = d.get("category") if d.get("category") in ("servicio", "producto") else "servicio"
    return (name, (d.get("description") or "").strip(), cat, cost, stock), None


@app.get("/api/admin/rewards")
@admin_required
def admin_rewards():
    return jsonify(rows(get_db().execute(
        "SELECT w.*, (SELECT COUNT(*) FROM redemptions r WHERE r.reward_id=w.id"
        " AND r.status!='cancelado') AS n_redeemed FROM rewards w ORDER BY active DESC, points_cost")))


@app.post("/api/admin/rewards")
@admin_required
def admin_reward_create():
    vals, e = _reward_payload(body())
    if e:
        return err(e)
    db = get_db()
    db.execute("INSERT INTO rewards (name, description, category, points_cost, stock, created_at)"
               " VALUES (?,?,?,?,?,?)", (*vals, now()))
    db.commit()
    return jsonify({"ok": True}), 201


@app.put("/api/admin/rewards/<int:rid>")
@admin_required
def admin_reward_update(rid):
    vals, e = _reward_payload(body())
    if e:
        return err(e)
    db = get_db()
    db.execute("UPDATE rewards SET name=?, description=?, category=?, points_cost=?, stock=?"
               " WHERE id=?", (*vals, rid))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/rewards/<int:rid>/toggle")
@admin_required
def admin_reward_toggle(rid):
    db = get_db()
    db.execute("UPDATE rewards SET active = 1 - active WHERE id=?", (rid,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/admin/redemptions")
@admin_required
def admin_redemptions():
    status = request.args.get("status", "pendiente")
    q = (request.args.get("q") or "").strip().upper()
    sql = ("SELECT r.*, u.name AS client_name, w.name AS reward_name FROM redemptions r"
           " JOIN users u ON u.id=r.user_id JOIN rewards w ON w.id=r.reward_id WHERE 1=1")
    params = []
    if status in ("pendiente", "entregado", "cancelado"):
        sql += " AND r.status=?"
        params.append(status)
    if q:
        sql += " AND r.code LIKE ?"
        params.append(f"%{q}%")
    sql += " ORDER BY r.id DESC"
    return jsonify(rows(get_db().execute(sql, params)))


@app.post("/api/admin/redemptions/<int:rid>/<action>")
@admin_required
def admin_redemption_action(rid, action):
    db = get_db()
    r = db.execute("SELECT r.*, w.stock FROM redemptions r JOIN rewards w ON w.id=r.reward_id"
                   " WHERE r.id=?", (rid,)).fetchone()
    if not r or r["status"] != "pendiente":
        return err("Ese canje ya fue procesado.")
    if action == "entregar":
        db.execute("UPDATE redemptions SET status='entregado', resolved_at=? WHERE id=?", (now(), rid))
    elif action == "cancelar":
        db.execute("UPDATE redemptions SET status='cancelado', resolved_at=? WHERE id=?", (now(), rid))
        add_points(db, r["user_id"], r["points"], "reembolso",
                   f"Devolución por canje cancelado ({r['code']})", current_user()["id"])
        if r["stock"] is not None:
            db.execute("UPDATE rewards SET stock = stock + 1 WHERE id=?", (r["reward_id"],))
    else:
        return err("Acción no válida.")
    db.commit()
    return jsonify({"ok": True, "code": r["code"]})


@app.get("/api/admin/settings")
@admin_required
def admin_settings_get():
    return jsonify(all_settings())


@app.put("/api/admin/settings")
@admin_required
def admin_settings_put():
    d = body()
    db = get_db()
    for key in DEFAULT_SETTINGS:
        if key not in d:
            continue
        val = str(d[key]).strip()
        if key in INT_SETTINGS and not val.isdigit():
            return err("Los valores numéricos deben ser enteros ≥ 0.")
        if key in TEXT_SETTINGS and not val:
            return err("Los textos de la configuración no pueden quedar vacíos.")
        db.execute("INSERT INTO settings (key, value) VALUES (?,?)"
                   " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, val))
    db.commit()
    return jsonify(all_settings())


# ---------------------------------------------------------------- reactivación y cumpleaños
@app.get("/api/admin/inactive")
@admin_required
def admin_inactive():
    """Clientes que no vienen hace más de `inactive_days` (sin visitas: desde que se registraron)."""
    limit = setting_int("inactive_days")
    template = setting("reactivation_message")
    today = datetime.now()
    out = []
    for c in rows(get_db().execute(
            "SELECT u.id, u.name, u.phone, u.points, u.created_at,"
            " (SELECT MAX(created_at) FROM transactions t WHERE t.user_id=u.id AND t.type='visita') AS last_visit"
            " FROM users u WHERE u.role='client'")):
        days = (today - datetime.strptime((c["last_visit"] or c["created_at"])[:16], "%Y-%m-%d %H:%M")).days
        if days < limit:
            continue
        out.append({**c, "days": days,
                    "whatsapp_url": whatsapp_url(c["phone"], render_message(template, c))})
    out.sort(key=lambda c: c["days"], reverse=True)
    return jsonify({"days_limit": limit, "clients": out})


@app.get("/api/admin/birthdays")
@admin_required
def admin_birthdays():
    """Cumpleaños de los próximos 30 días, con el enlace de saludo y si ya se regaló este año."""
    db = get_db()
    today = date.today()
    template = setting("birthday_message")
    out = []
    for c in rows(db.execute(
            "SELECT id, name, phone, points, birthday FROM users WHERE role='client' AND birthday IS NOT NULL")):
        month, day = int(c["birthday"][5:7]), int(c["birthday"][8:10])
        nxt = _birthday_in_year(month, day, today.year)
        if nxt < today:
            nxt = _birthday_in_year(month, day, today.year + 1)
        days = (nxt - today).days
        if days > 30:
            continue
        granted = bool(db.execute(
            "SELECT 1 FROM transactions WHERE user_id=? AND type='cumpleanos' AND created_at LIKE ?",
            (c["id"], str(today.year) + "%")).fetchone())
        out.append({**c, "days": days, "granted": granted,
                    "whatsapp_url": whatsapp_url(c["phone"], render_message(template, c))})
    out.sort(key=lambda c: c["days"])
    return jsonify({"bonus": setting_int("birthday_bonus"), "clients": out})


def _birthday_in_year(month, day, year):
    try:
        return date(year, month, day)
    except ValueError:  # 29 de febrero en un año no bisiesto
        return date(year, 3, 1)


@app.post("/api/admin/clients/<int:uid>/birthday-gift")
@admin_required
def admin_birthday_gift(uid):
    c = _client_or_404(uid)
    if not c:
        return err("Cliente no encontrado.", 404)
    db = get_db()
    pts = grant_birthday_bonus(db, c, current_user()["id"])
    if not pts:
        return err("No se puede regalar: ya se entregó este año, no tiene cumpleaños cargado o el bono está en 0.")
    db.commit()
    return jsonify({"points": pts})


# ---------------------------------------------------------------- SPA (build de React)
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path):
    if path.startswith("api/"):
        return err("No encontrado.", 404)
    if not os.path.isdir(DIST_DIR):
        return ("Frontend no compilado. En desarrollo usa `npm run dev` en /frontend "
                "(http://localhost:5173).", 200)
    full = os.path.join(DIST_DIR, path)
    if path and os.path.isfile(full):
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


init_db()

if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "1") == "1", host="0.0.0.0",
            port=int(os.environ.get("PORT", "5000")))
