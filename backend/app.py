"""
Clientify — API de fidelización por puntos para barberías.
Flask + SQLite. Ejecutar:  python app.py   ->  API en http://localhost:5000/api
Si existe ../frontend/dist (npm run build), también sirve la webapp React.
"""
import calendar
import hashlib
import io
import os
import re
import secrets
import sqlite3
import threading
from datetime import date, datetime, timedelta
from functools import wraps
from html import escape as html_escape
from urllib.parse import quote

from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_file, send_from_directory, session
from openpyxl import Workbook
from openpyxl.styles import Font
from werkzeug.security import check_password_hash, generate_password_hash

import mailer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))
DB_PATH = os.environ.get("CLIENTIFY_DB") or os.path.join(BASE_DIR, "..", "data", "clientify.db")
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
DIST_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                  SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE") == "1")  # 1 solo detrás de HTTPS

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
    "open_time": "09:00",
    "close_time": "19:00",
    "open_days": "1,2,3,4,5,6",  # días de atención, 1 = lunes ... 7 = domingo
    "slot_minutes": "30",
    "booking_days_ahead": "14",
    "max_active_appointments": "3",
    "points_expiry_months": "0",  # 0 = los puntos no vencen
    "expiry_warning_days": "30",  # con cuántos días de anticipación se avisa al cliente
    "referral_min_spend": "0",  # gasto mínimo ($) de la visita que activa los bonos de referido; 0 = cualquiera
    "appointment_message": "Hola {nombre}, te recordamos tu turno en {negocio}: {servicio}, {fecha} a las {hora}. "
                           "Si no puedes venir, avísanos para liberar el horario.",
}
TEXT_SETTINGS = ["business_name", "reactivation_message", "birthday_message", "open_time", "close_time",
                 "open_days", "appointment_message"]
MIN_ONE_SETTINGS = ["slot_minutes", "booking_days_ahead", "max_active_appointments"]
DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
# Recuperación de clave: parámetros de seguridad, no reglas del programa, por eso no son ajustes.
RESET_TTL_MINUTES = 60    # cuánto vale el enlace del correo
RESET_MAX_PER_HOUR = 3    # pedidos por cuenta y hora: que nadie use esto para llenar de correos a un cliente
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
    referral_rewarded INTEGER NOT NULL DEFAULT 0,
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
    amount REAL,
    concept TEXT,
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
CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    price REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reservado',
    reminded_at TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
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


def add_points(db, user_id, points, type_, description, created_by=None, amount=None, concept=None):
    """Única vía para mover puntos: actualiza saldo y deja rastro en el historial.
    `amount` y `concept` (en dólares y texto) los llenan solo las visitas y alimentan los reportes."""
    db.execute("UPDATE users SET points = points + ? WHERE id=?", (points, user_id))
    db.execute(
        "INSERT INTO transactions (user_id, type, points, description, created_by, amount, concept, created_at)"
        " VALUES (?,?,?,?,?,?,?,?)", (user_id, type_, points, description, created_by, amount, concept, now()))


def add_months(d, months):
    """Suma meses a una fecha; si el día no existe en el mes de llegada usa el último (31 ene + 1 mes = 28 feb)."""
    year, month = divmod(d.month - 1 + months, 12)
    year += d.year
    return d.replace(year=year, month=month + 1, day=min(d.day, calendar.monthrange(year, month + 1)[1]))


def _when(text):
    return datetime.strptime(text[:16], "%Y-%m-%d %H:%M")


def _consume(lots, amount):
    """Descuenta `amount` puntos de los lotes, empezando por el más antiguo."""
    while amount > 0 and lots:
        take = min(amount, lots[0][0])
        lots[0][0] -= take
        amount -= take
        if not lots[0][0]:
            lots.pop(0)


def open_lots(db, user_id):
    """Puntos ganados que aún no se gastaron ni vencieron, del más antiguo al más nuevo: [[puntos, fecha], ...].

    Lo que se descuenta (canje, ajuste negativo, vencimiento) sale primero de lo más antiguo. Los lotes siempre
    suman como mucho el saldo: si el historial y el saldo no coinciden, manda el saldo.
    """
    lots = []
    for t in db.execute("SELECT points, created_at FROM transactions WHERE user_id=? ORDER BY created_at, id",
                        (user_id,)):
        if t["points"] > 0:
            lots.append([t["points"], t["created_at"]])
        else:
            _consume(lots, -t["points"])
    balance = db.execute("SELECT points FROM users WHERE id=?", (user_id,)).fetchone()["points"]
    _consume(lots, sum(p for p, _ in lots) - balance)
    return lots


def expire_points(db, user_id):
    """Da de baja los puntos que cumplieron `points_expiry_months` desde que se ganaron. Devuelve los vencidos."""
    months = setting_int("points_expiry_months")
    if months <= 0:
        return 0

    def due():
        limit = datetime.now()
        return sum(p for p, at in open_lots(db, user_id) if add_months(_when(at), months) <= limit)

    if due() <= 0:
        return 0
    if not db.in_transaction:
        db.execute("BEGIN IMMEDIATE")  # dos peticiones a la vez no deben vencer los mismos puntos dos veces
    balance = db.execute("SELECT points FROM users WHERE id=?", (user_id,)).fetchone()["points"]
    expired = min(due(), balance)
    if expired > 0:
        add_points(db, user_id, -expired, "vencimiento", f"Vencieron {expired} pts ganados hace más de {months} meses")
    db.commit()
    return max(expired, 0)


def expiring_soon(db, user_id):
    """Puntos que vencen dentro de `expiry_warning_days` y la fecha del primero, o None."""
    months, days = setting_int("points_expiry_months"), setting_int("expiry_warning_days")
    if months <= 0 or days <= 0:
        return None
    limit = datetime.now() + timedelta(days=days)
    soon = [(p, add_months(_when(at), months)) for p, at in open_lots(db, user_id)]
    soon = [(p, d) for p, d in soon if d <= limit]
    if not soon:
        return None
    return {"points": sum(p for p, _ in soon), "date": min(d for _, d in soon).strftime("%Y-%m-%d")}


def sweep_expirations(db):
    """Vence los puntos de todos los clientes, como mucho una vez al día (no hay tarea programada)."""
    if setting_int("points_expiry_months") <= 0 or setting("last_expiry_sweep") == date.today().isoformat():
        return
    for r in db.execute("SELECT id FROM users WHERE role='client' AND points > 0").fetchall():
        expire_points(db, r["id"])
    db.execute("INSERT INTO settings (key, value) VALUES ('last_expiry_sweep', ?)"
               " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (date.today().isoformat(),))
    db.commit()


@app.before_request
def expire_before_admin_views():
    """Que los saldos, rankings y listas del admin ya descuenten lo vencido."""
    if request.path.startswith("/api/admin/") and session.get("user_id"):
        sweep_expirations(get_db())


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


def add_visit(db, user_id, amount, concept, created_by):
    """Suma los puntos de una visita pagada. Devuelve los puntos (0 si el monto no alcanza ni para uno)."""
    pts = int(amount * setting_int("points_per_dollar"))
    if pts > 0:
        add_points(db, user_id, pts, "visita", f"{concept} (${amount:.2f})", created_by, amount=amount, concept=concept)
        reward_referral(db, user_id, amount)
    return pts


def reward_referral(db, user_id, amount):
    """Entrega los bonos de referido (al que invitó y al invitado) en la primera visita pagada del invitado.

    Así crear cuentas falsas no rinde: el bono solo sale cuando el invitado paga una visita real.
    """
    u = db.execute("SELECT name, referred_by FROM users WHERE id=? AND referral_rewarded=0", (user_id,)).fetchone()
    if not u or not u["referred_by"] or amount < setting_int("referral_min_spend"):
        return
    # La marca va primero y con condición: si dos visitas llegan a la vez, solo una entrega los bonos.
    if db.execute("UPDATE users SET referral_rewarded=1 WHERE id=? AND referral_rewarded=0", (user_id,)).rowcount != 1:
        return
    referrer = db.execute("SELECT name FROM users WHERE id=?", (u["referred_by"],)).fetchone()
    if setting_int("referral_bonus_referred"):
        add_points(db, user_id, setting_int("referral_bonus_referred"), "referido",
                   f"Bono por tu primera visita con el código de {referrer['name']}")
    if setting_int("referral_bonus_referrer"):
        add_points(db, u["referred_by"], setting_int("referral_bonus_referrer"), "referido",
                   f"Bono por referir a {u['name']}: hizo su primera visita")


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


def render_message(template, client, **extra):
    """Rellena {nombre}, {negocio}, {puntos}, {bono} y lo que se pase en extra, sin fallar con otras llaves."""
    values = {"nombre": (client["name"].split() or [""])[0], "negocio": setting("business_name"),
              "puntos": client["points"], "bono": setting_int("birthday_bonus"), **extra}
    for k, v in values.items():
        template = template.replace("{" + k + "}", str(v))
    return template


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    # Migraciones mínimas: columnas que no existían en las bases creadas antes.
    cols = [r[1] for r in db.execute("PRAGMA table_info(users)")]
    if "birthday" not in cols:
        db.execute("ALTER TABLE users ADD COLUMN birthday TEXT")
    if "referral_rewarded" not in cols:
        db.execute("ALTER TABLE users ADD COLUMN referral_rewarded INTEGER NOT NULL DEFAULT 0")
        # Los referidos anteriores ya cobraron sus bonos al registrarse: que no los cobren dos veces.
        db.execute("UPDATE users SET referral_rewarded=1 WHERE referred_by IS NOT NULL")
    if "amount" not in [r[1] for r in db.execute("PRAGMA table_info(transactions)")]:
        db.execute("ALTER TABLE transactions ADD COLUMN amount REAL")
        db.execute("ALTER TABLE transactions ADD COLUMN concept TEXT")
        # Las visitas anteriores guardaban el monto solo dentro del texto ("Corte ($10.00)"): se recupera para los reportes.
        for t in db.execute("SELECT id, description FROM transactions WHERE type='visita'").fetchall():
            hit = re.fullmatch(r"(.*) \(\$(\d+(?:\.\d+)?)\)", t["description"] or "")
            if hit:
                db.execute("UPDATE transactions SET concept=?, amount=? WHERE id=?", (hit.group(1), float(hit.group(2)), t["id"]))
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
    """El cliente edita su nombre, teléfono y fecha de cumpleaños. Solo cambia los campos que vienen."""
    d = body()
    db = get_db()
    u = current_user()
    fields = {}
    if "name" in d:
        name = (d["name"] or "").strip()
        if len(name) < 2:
            return err("Ingresa tu nombre.")
        fields["name"] = name
    if "phone" in d:
        phone = (d["phone"] or "").strip()
        if phone and not re.fullmatch(r"[0-9+()\-\s]{7,20}", phone):
            return err("Ingresa un teléfono válido, solo con números.")
        if phone and phone != (u["phone"] or "") and db.execute(
                "SELECT 1 FROM users WHERE phone=? AND role='client' AND id!=?", (phone, u["id"])).fetchone():
            return err("Ya existe un cliente con ese teléfono.")
        fields["phone"] = phone
    if "birthday" in d:
        birthday = clean_birthday(d["birthday"])
        if birthday is None:
            return err("La fecha de cumpleaños no es válida.")
        fields["birthday"] = birthday or None
    if fields:  # las claves salen de un conjunto fijo, no de la petición
        db.execute("UPDATE users SET " + ", ".join(f"{k}=?" for k in fields) + " WHERE id=?",
                   (*fields.values(), u["id"]))
        db.commit()
    return jsonify(public_user(db.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone()))


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


def _app_url():
    """Base de los enlaces de los correos. En producción sale de APP_URL: nunca del Host de la petición,
    porque un Host manipulado envenenaría el enlace de recuperación."""
    url = os.environ.get("APP_URL", "").strip().rstrip("/")
    if url or os.environ.get("EMAIL_BACKEND", "console") != "console":
        return url or None
    return request.host_url.rstrip("/")  # desarrollo: el correo solo queda en el log


def _reset_email(name, link):
    business = setting("business_name")
    first = (name.split() or [""])[0]
    subject = f"Restablece tu clave de {business}"
    text = (f"Hola {first},\n\nRecibimos un pedido para restablecer tu clave de {business}. Abre este enlace para elegir "
            f"una nueva (vale {RESET_TTL_MINUTES} minutos y se puede usar una sola vez):\n\n{link}\n\n"
            "Si no fuiste tú, ignora este correo: tu clave actual sigue igual.\n")
    html = (f'<p>Hola {html_escape(first)},</p><p>Recibimos un pedido para restablecer tu clave de <strong>{html_escape(business)}</strong>. '
            f'Toca el botón para elegir una nueva; vale {RESET_TTL_MINUTES} minutos y se puede usar una sola vez.</p>'
            f'<p><a href="{html_escape(link)}" style="display:inline-block;background:#E5A93B;color:#0F172A;font-weight:600;'
            f'text-decoration:none;padding:12px 24px;border-radius:8px">Elegir una nueva clave</a></p>'
            f'<p style="color:#64748B;font-size:13px">Si el botón no funciona, copia este enlace en tu navegador:<br>{html_escape(link)}</p>'
            '<p style="color:#64748B;font-size:13px">Si no fuiste tú, ignora este correo: tu clave actual sigue igual.</p>')
    return subject, text, html


@app.post("/api/password/forgot")
def password_forgot():
    """Pide el enlace para restablecer la clave. Responde siempre lo mismo, exista o no el correo, para no
    revelar quién tiene cuenta. Solo clientes con correo real: el admin y los correos @sin-correo.local quedan fuera."""
    email = (body().get("email") or "").strip().lower()
    if "@" not in email:
        return err("Ingresa un correo válido.")
    db = get_db()
    u = db.execute("SELECT id, name FROM users WHERE email=? AND role='client'", (email,)).fetchone()
    base = _app_url()
    if u and base and not email.endswith("@sin-correo.local"):
        hour_ago = (datetime.now() - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")
        recent = db.execute("SELECT COUNT(*) FROM password_resets WHERE user_id=? AND created_at >= ?",
                            (u["id"], hour_ago)).fetchone()[0]
        if recent < RESET_MAX_PER_HOUR:
            token = secrets.token_urlsafe(32)
            expires = (datetime.now() + timedelta(minutes=RESET_TTL_MINUTES)).strftime("%Y-%m-%d %H:%M")
            week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d %H:%M")
            db.execute("DELETE FROM password_resets WHERE created_at < ?", (week_ago,))
            db.execute("UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL", (now(), u["id"]))
            # Solo se guarda el hash: con la base en la mano no se puede armar un enlace válido.
            db.execute("INSERT INTO password_resets (user_id, token_hash, created_at, expires_at) VALUES (?,?,?,?)",
                       (u["id"], hashlib.sha256(token.encode()).hexdigest(), now(), expires))
            db.commit()
            # El token va en el fragmento (#): no llega a los logs del servidor ni a otros sitios por el Referer.
            subject, text, html = _reset_email(u["name"], f"{base}/restablecer#token={token}")
            # En un hilo aparte, para que responder no tarde distinto si el correo existe (no filtrar por tiempo).
            threading.Thread(target=mailer.send_email, args=(email, subject, text, html, setting("business_name")),
                             daemon=True).start()
    return jsonify({"ok": True})


@app.post("/api/password/reset")
def password_reset():
    """Elige una clave nueva con el enlace del correo: un solo uso y vence en RESET_TTL_MINUTES."""
    d = body()
    token, new = (d.get("token") or "").strip(), d.get("password") or ""
    if len(new) < 6:
        return err("La clave debe tener al menos 6 caracteres.")
    invalid = "El enlace no es válido o ya venció. Pide uno nuevo."
    db = get_db()
    r = db.execute(
        "SELECT r.id, r.user_id FROM password_resets r JOIN users u ON u.id=r.user_id"
        " WHERE r.token_hash=? AND r.used_at IS NULL AND r.expires_at >= ? AND u.role='client'",
        (hashlib.sha256(token.encode()).hexdigest(), now())).fetchone() if token else None
    if not r:
        return err(invalid)
    # La marca va primero y con condición: dos usos a la vez no pueden cambiar la clave dos veces.
    if db.execute("UPDATE password_resets SET used_at=? WHERE id=? AND used_at IS NULL", (now(), r["id"])).rowcount != 1:
        return err(invalid)
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new), r["user_id"]))
    db.execute("UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL", (now(), r["user_id"]))
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
    # Los bonos de referido se entregan en la primera visita pagada del invitado (ver reward_referral).
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
    expire_points(db, uid)
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
        "expiring": expiring_soon(db, uid),
        "next_appointment": row(db.execute(
            "SELECT a.id, a.start_at, a.end_at, s.name AS service_name FROM appointments a"
            " JOIN services s ON s.id=a.service_id WHERE a.user_id=? AND a.status='reservado'"
            " AND a.start_at >= ? ORDER BY a.start_at LIMIT 1", (uid, now()))),
        "user": public_user(u),
        "rewards": rows(db.execute("SELECT * FROM rewards WHERE active=1 ORDER BY points_cost")),
        "history": rows(db.execute(
            "SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 30", (uid,))),
        "redemptions": rows(db.execute(
            "SELECT r.*, w.name AS reward_name FROM redemptions r JOIN rewards w ON w.id=r.reward_id"
            " WHERE r.user_id=? ORDER BY r.id DESC LIMIT 20", (uid,))),
        "referrals": rows(db.execute(
            "SELECT name, created_at, referral_rewarded AS rewarded FROM users WHERE referred_by=? ORDER BY id DESC",
            (uid,))),
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
    expire_points(db, uid)  # lo vencido no se puede canjear
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
    expire_points(get_db(), uid)  # el saldo que ve el admin ya descuenta lo vencido
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
            "SELECT id, name, created_at, referral_rewarded AS rewarded FROM users WHERE referred_by=?", (uid,))),
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
    concept = (d.get("concept") or "").strip() or "Visita"
    db = get_db()
    pts = add_visit(db, uid, amount, concept, current_user()["id"])
    if pts <= 0:
        return err("Ingresa un monto mayor a 0.")
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
        if key in ("open_time", "close_time") and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", val):
            return err("El horario debe tener formato HH:MM.")
        if key == "open_days" and not re.fullmatch(r"[1-7](,[1-7])*", val):
            return err("Elige al menos un día de atención.")
        if key in MIN_ONE_SETTINGS and int(val) < 1:
            return err("Los turnos, los días de anticipación y el máximo de turnos deben ser al menos 1.")
        db.execute("INSERT INTO settings (key, value) VALUES (?,?)"
                   " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, val))
    if _minutes(setting("open_time")) >= _minutes(setting("close_time")):
        db.rollback()
        return err("La hora de cierre debe ser posterior a la de apertura.")
    db.commit()
    return jsonify(all_settings())


# ---------------------------------------------------------------- reportes
@app.get("/api/admin/reports")
@admin_required
def admin_reports():
    """Ingresos, servicios más vendidos y retención de clientes. `days` es el período de los ingresos."""
    days = request.args.get("days", 30, type=int)
    if days not in (7, 30, 90, 365):
        return err("Elige un período de 7, 30, 90 o 365 días.")
    db = get_db()
    today = date.today()
    start = today - timedelta(days=days - 1)

    def paid(since, until):  # visitas con monto entre dos fechas (incluidas)
        return db.execute(
            "SELECT user_id, substr(created_at,1,10) AS d, amount, concept FROM transactions"
            " WHERE type='visita' AND amount IS NOT NULL AND substr(created_at,1,10) BETWEEN ? AND ?",
            (since.isoformat(), until.isoformat())).fetchall()

    def summary(rows):
        income = sum(r["amount"] for r in rows)
        return {"income": round(income, 2), "visits": len(rows), "clients": len({r["user_id"] for r in rows}),
                "ticket": round(income / len(rows), 2) if rows else 0}

    now_rows = paid(start, today)
    daily = {(start + timedelta(days=i)).isoformat(): {"income": 0.0, "visits": 0} for i in range(days)}
    services = {}
    for r in now_rows:
        daily[r["d"]]["income"] += r["amount"]
        daily[r["d"]]["visits"] += 1
        s = services.setdefault((r["concept"] or "Visita").strip().lower(), {"concept": (r["concept"] or "Visita").strip(), "visits": 0, "income": 0.0})
        s["visits"] += 1
        s["income"] += r["amount"]
    total = sum(r["amount"] for r in now_rows)
    top = sorted(services.values(), key=lambda s: s["income"], reverse=True)[:8]

    # Retención: usa todas las visitas (con o sin monto) de cada cliente, de la primera a la última.
    by_client = {}
    for r in db.execute("SELECT user_id, substr(created_at,1,10) AS d FROM transactions WHERE type='visita'"
                        " ORDER BY user_id, created_at"):
        by_client.setdefault(r["user_id"], []).append(date.fromisoformat(r["d"]))
    n_clients = db.execute("SELECT COUNT(*) FROM users WHERE role='client'").fetchone()[0]

    def retention(window):  # de los que llegaron hace al menos `window` días, cuántos volvieron dentro de esos días
        eligible = [v for v in by_client.values() if (today - v[0]).days >= window]
        back = [v for v in eligible if len(v) > 1 and (v[1] - v[0]).days <= window]
        return {"eligible": len(eligible), "rate": round(100 * len(back) / len(eligible), 1) if eligible else None}

    gaps = [(b - a).days for v in by_client.values() for a, b in zip(v, v[1:])]
    since_last = [(today - v[-1]).days for v in by_client.values()]
    return jsonify({
        "days": days, "from": start.isoformat(), "to": today.isoformat(),
        "summary": {**summary(now_rows), "new_clients": sum(1 for v in by_client.values() if v[0] >= start),
                    "previous": summary(paid(start - timedelta(days=days), start - timedelta(days=1)))},
        "daily": [{"date": d, "income": round(v["income"], 2), "visits": v["visits"]} for d, v in daily.items()],
        "services": [{**s, "income": round(s["income"], 2), "share": round(100 * s["income"] / total, 1)} for s in top],
        "retention": {
            "clients": n_clients, "with_visits": len(by_client), "never": n_clients - len(by_client),
            "returning": sum(1 for v in by_client.values() if len(v) > 1),
            "r30": retention(30), "r60": retention(60),
            "avg_gap_days": round(sum(gaps) / len(gaps), 1) if gaps else None,
            "last_visit": {"d30": sum(1 for x in since_last if x <= 30), "d60": sum(1 for x in since_last if 30 < x <= 60),
                           "d90": sum(1 for x in since_last if 60 < x <= 90), "older": sum(1 for x in since_last if x > 90)},
        },
    })


# ---------------------------------------------------------------- exportar a Excel
def _sheet(wb, title, headers, data, widths, money_cols=()):
    """Hoja con encabezado en negrita. Los textos se guardan siempre como texto: un nombre que empiece por
    '=', '+', '-' o '@' no se evalúa como fórmula al abrir el archivo."""
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True)
    for row in data:
        ws.append(row)
        for c in ws[ws.max_row]:
            if isinstance(c.value, str):
                c.data_type = "s"
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[chr(64 + i)].width = w
    for col in money_cols:
        for c in ws[chr(64 + col)][1:]:
            c.number_format = "$#,##0.00"
    ws.freeze_panes = "A2"
    return ws


@app.get("/api/admin/export.xlsx")
@admin_required
def admin_export():
    """Excel con todos los clientes y las visitas de un período (`days`: 7, 30, 90, 365 o 0 = todas)."""
    days = request.args.get("days", 0, type=int)
    if days not in (0, 7, 30, 90, 365):
        return err("Elige un período de 7, 30, 90 o 365 días, o 0 para todas las visitas.")
    db = get_db()
    since = (date.today() - timedelta(days=days - 1)).isoformat() if days else "0000-01-01"

    clients = db.execute(
        "SELECT u.name, u.email, u.phone, u.birthday, u.points, u.created_at, r.name AS referrer,"
        " (SELECT COUNT(*) FROM transactions t WHERE t.user_id=u.id AND t.type='visita') AS visits,"
        " (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.user_id=u.id AND t.type='visita') AS spent,"
        " (SELECT MAX(t.created_at) FROM transactions t WHERE t.user_id=u.id AND t.type='visita') AS last_visit"
        " FROM users u LEFT JOIN users r ON r.id=u.referred_by WHERE u.role='client' ORDER BY u.name COLLATE NOCASE").fetchall()
    visits = db.execute(
        "SELECT t.created_at, u.name, u.email, COALESCE(t.concept, t.description) AS concept, t.amount, t.points"
        " FROM transactions t JOIN users u ON u.id=t.user_id"
        " WHERE t.type='visita' AND substr(t.created_at,1,10) >= ? ORDER BY t.created_at DESC, t.id DESC", (since,)).fetchall()

    real = lambda e: "" if (e or "").endswith("@sin-correo.local") else e
    wb = Workbook()
    wb.remove(wb.active)
    _sheet(wb, "Clientes", ["Nombre", "Correo", "Teléfono", "Cumpleaños", "Puntos", "Visitas", "Total gastado", "Última visita", "Se registró", "Lo invitó"],
           [[c["name"], real(c["email"]), c["phone"] or "", c["birthday"] or "", c["points"], c["visits"], round(c["spent"], 2),
             c["last_visit"] or "", c["created_at"], c["referrer"] or ""] for c in clients],
           [26, 30, 16, 13, 9, 9, 15, 18, 18, 22], money_cols=(7,))
    _sheet(wb, "Visitas", ["Fecha", "Cliente", "Correo", "Servicio", "Monto", "Puntos"],
           [[v["created_at"], v["name"], real(v["email"]), v["concept"] or "", v["amount"], v["points"]] for v in visits],
           [18, 26, 30, 28, 12, 9], money_cols=(5,))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    name = f"clientify-{date.today().isoformat()}.xlsx"
    return send_file(buf, as_attachment=True, download_name=name,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


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
    """Cumpleaños del mes en curso (incluso los que ya pasaron) y de los próximos 30 días.

    El mes completo coincide con la regla del regalo automático, que se entrega en todo el mes de cumpleaños.
    `days` es negativo para los cumpleaños de este mes que ya pasaron.
    """
    db = get_db()
    today = date.today()
    template = setting("birthday_message")
    out = []
    for c in rows(db.execute(
            "SELECT id, name, phone, points, birthday FROM users WHERE role='client' AND birthday IS NOT NULL")):
        this_year = _birthday_in_year(int(c["birthday"][5:7]), int(c["birthday"][8:10]), today.year)
        if this_year.month == today.month:
            days = (this_year - today).days
        else:
            nxt = this_year if this_year >= today else _birthday_in_year(this_year.month, this_year.day, today.year + 1)
            days = (nxt - today).days
            if days > 30:
                continue
        granted = bool(db.execute(
            "SELECT 1 FROM transactions WHERE user_id=? AND type='cumpleanos' AND created_at LIKE ?",
            (c["id"], str(today.year) + "%")).fetchone())
        out.append({**c, "days": days, "granted": granted,
                    "whatsapp_url": whatsapp_url(c["phone"], render_message(template, c))})
    # Primero los de hoy y los próximos; después los de este mes que ya pasaron, del más reciente al más lejano.
    out.sort(key=lambda c: (0, c["days"]) if c["days"] >= 0 else (1, -c["days"]))
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


# ---------------------------------------------------------------- turnos
def _minutes(hhmm):
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def _open_days():
    return {int(x) for x in setting("open_days").split(",") if x.strip().isdigit()}


def booking_dates():
    """Fechas con atención desde hoy hasta el límite de anticipación."""
    today = date.today()
    days = _open_days()
    dates = [today + timedelta(days=i) for i in range(setting_int("booking_days_ahead") + 1)]
    return [d.isoformat() for d in dates if d.isoweekday() in days]


def free_slots(db, service, day, horizon=True):
    """Horas de inicio (HH:MM) libres para un servicio en una fecha YYYY-MM-DD. Hay una sola agenda."""
    try:
        d = datetime.strptime(day, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return []
    today = date.today()
    if d < today or d.isoweekday() not in _open_days():
        return []
    if horizon and d > today + timedelta(days=setting_int("booking_days_ahead")):
        return []
    busy = [(_minutes(r["start_at"][11:]), _minutes(r["end_at"][11:])) for r in db.execute(
        "SELECT start_at, end_at FROM appointments WHERE substr(start_at,1,10)=? AND status!='cancelado'",
        (day,))]
    duration, step = service["duration_min"], max(setting_int("slot_minutes"), 5)
    close = _minutes(setting("close_time"))
    clock = datetime.now()
    now_min = clock.hour * 60 + clock.minute if d == today else -1
    out, t = [], _minutes(setting("open_time"))
    while t + duration <= close:
        if t > now_min and not any(b0 < t + duration and b1 > t for b0, b1 in busy):
            out.append(f"{t // 60:02d}:{t % 60:02d}")
        t += step
    return out


def book(db, user_id, service, day, time, created_by, horizon=True):
    """Crea el turno si la hora sigue libre. Devuelve (id, None) o (None, mensaje de error)."""
    taken = "Esa hora ya no está disponible. Elige otra."
    if time not in free_slots(db, service, day, horizon):
        return None, taken
    db.execute("BEGIN IMMEDIATE")  # bloquea escrituras para que dos reservas no tomen la misma hora
    try:
        if time not in free_slots(db, service, day, horizon):
            db.rollback()
            return None, taken
        start = datetime.strptime(f"{day} {time}", "%Y-%m-%d %H:%M")
        end = start + timedelta(minutes=service["duration_min"])
        cur = db.execute(
            "INSERT INTO appointments (user_id, service_id, start_at, end_at, created_by, created_at)"
            " VALUES (?,?,?,?,?,?)",
            (user_id, service["id"], start.strftime("%Y-%m-%d %H:%M"), end.strftime("%Y-%m-%d %H:%M"),
             created_by, now()))
        db.commit()
        return cur.lastrowid, None
    except Exception:
        db.rollback()
        raise


def _active_service(db, service_id):
    return db.execute("SELECT * FROM services WHERE id=? AND active=1", (service_id,)).fetchone()


_APPOINTMENT_SELECT = (
    "SELECT a.id, a.user_id, a.start_at, a.end_at, a.status, a.reminded_at, s.name AS service_name,"
    " s.price, u.name AS client_name, u.phone, u.points FROM appointments a"
    " JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.user_id")


@app.get("/api/booking")
@login_required
def booking_info():
    """Servicios y fechas disponibles para reservar."""
    services = rows(get_db().execute(
        "SELECT id, name, duration_min, price FROM services WHERE active=1 ORDER BY price"))
    return jsonify({"services": services, "dates": booking_dates(),
                    "max_active": setting_int("max_active_appointments")})


@app.get("/api/slots")
@login_required
def slots():
    db = get_db()
    service = _active_service(db, request.args.get("service_id", type=int))
    if not service:
        return err("Servicio no encontrado.", 404)
    horizon = current_user()["role"] != "admin"  # el admin puede agendar más allá del límite público
    return jsonify(free_slots(db, service, request.args.get("date"), horizon))


@app.get("/api/appointments")
@client_required
def my_appointments():
    db = get_db()
    mine = rows(db.execute(_APPOINTMENT_SELECT + " WHERE a.user_id=? ORDER BY a.start_at DESC",
                           (current_user()["id"],)))
    today = now()
    upcoming = [a for a in mine if a["status"] == "reservado" and a["start_at"] >= today]
    past = [a for a in mine if a not in upcoming][:10]
    return jsonify({"upcoming": sorted(upcoming, key=lambda a: a["start_at"]), "past": past})


@app.post("/api/appointments")
@client_required
def appointment_create():
    db = get_db()
    d = body()
    uid = current_user()["id"]
    service = _active_service(db, d.get("service_id"))
    if not service:
        return err("Elige un servicio.")
    active = db.execute("SELECT COUNT(*) FROM appointments WHERE user_id=? AND status='reservado'"
                        " AND start_at >= ?", (uid, now())).fetchone()[0]
    if active >= setting_int("max_active_appointments"):
        return err(f"Ya tienes {active} turnos reservados. Cancela uno o espera a que pase para reservar otro.")
    appointment_id, e = book(db, uid, service, d.get("date"), d.get("time"), uid)
    if e:
        return err(e, 409)
    return jsonify({"id": appointment_id}), 201


@app.post("/api/appointments/<int:aid>/cancel")
@client_required
def appointment_cancel(aid):
    db = get_db()
    a = db.execute("SELECT * FROM appointments WHERE id=? AND user_id=?",
                   (aid, current_user()["id"])).fetchone()
    if not a:
        return err("Turno no encontrado.", 404)
    if a["status"] != "reservado" or a["start_at"] < now():
        return err("Este turno ya no se puede cancelar.")
    db.execute("UPDATE appointments SET status='cancelado', resolved_at=? WHERE id=?", (now(), aid))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/admin/appointments")
@admin_required
def admin_appointments():
    day = request.args.get("date") or date.today().isoformat()
    try:
        d = datetime.strptime(day, "%Y-%m-%d").date()
    except ValueError:
        return err("Fecha no válida.")
    template = setting("appointment_message")
    out = []
    for a in rows(get_db().execute(_APPOINTMENT_SELECT + " WHERE substr(a.start_at,1,10)=? ORDER BY a.start_at", (day,))):
        message = render_message(template, {"name": a["client_name"], "points": a["points"]},
                                 servicio=a["service_name"], hora=a["start_at"][11:],
                                 fecha=f"{DAYS_ES[d.weekday()]} {d.day}/{d.month}")
        out.append({**a, "whatsapp_url": whatsapp_url(a["phone"], message)})
    return jsonify({"date": day, "appointments": out})


@app.post("/api/admin/appointments")
@admin_required
def admin_appointment_create():
    """El admin agenda a un cliente (llamada, mostrador). No aplica el límite de anticipación ni el de turnos."""
    db = get_db()
    d = body()
    if not db.execute("SELECT 1 FROM users WHERE id=? AND role='client'", (d.get("user_id"),)).fetchone():
        return err("Elige un cliente.")
    service = _active_service(db, d.get("service_id"))
    if not service:
        return err("Elige un servicio.")
    appointment_id, e = book(db, d["user_id"], service, d.get("date"), d.get("time"),
                             current_user()["id"], horizon=False)
    if e:
        return err(e, 409)
    return jsonify({"id": appointment_id}), 201


@app.post("/api/admin/appointments/<int:aid>/<action>")
@admin_required
def admin_appointment_action(aid, action):
    """atender: carga la visita y suma puntos; ausente / cancelar: libera el turno sin puntos."""
    states = {"atender": "atendido", "ausente": "ausente", "cancelar": "cancelado"}
    if action not in states:
        return err("Acción no válida.", 404)
    db = get_db()
    a = row(db.execute(_APPOINTMENT_SELECT + " WHERE a.id=?", (aid,)))
    if not a:
        return err("Turno no encontrado.", 404)
    if a["status"] != "reservado":
        return err("Este turno ya fue resuelto.")
    pts = 0
    if action == "atender":
        try:
            amount = float(str(body().get("amount", a["price"])).replace(",", "."))
        except ValueError:
            amount = 0
        if amount <= 0:
            return err("Ingresa un monto mayor a 0.")
        pts = add_visit(db, a["user_id"], amount, a["service_name"], current_user()["id"])
    db.execute("UPDATE appointments SET status=?, resolved_at=? WHERE id=?", (states[action], now(), aid))
    db.commit()
    return jsonify({"points": pts})


@app.post("/api/admin/appointments/<int:aid>/reminded")
@admin_required
def admin_appointment_reminded(aid):
    """Marca que ya se le mandó el recordatorio por WhatsApp."""
    db = get_db()
    db.execute("UPDATE appointments SET reminded_at=? WHERE id=?", (now(), aid))
    db.commit()
    return jsonify({"ok": True})


def _service_payload(d):
    name = (d.get("name") or "").strip()
    try:
        duration = int(d.get("duration_min") or 0)
        price = float(str(d.get("price") or 0).replace(",", "."))
    except (TypeError, ValueError):
        return None, "La duración y el precio deben ser números."
    if not name:
        return None, "El servicio necesita un nombre."
    if not 5 <= duration <= 480:
        return None, "La duración debe estar entre 5 y 480 minutos."
    if price <= 0:
        return None, "El precio debe ser mayor a 0."
    return (name, duration, round(price, 2)), None


@app.get("/api/admin/services")
@admin_required
def admin_services():
    return jsonify(rows(get_db().execute("SELECT * FROM services ORDER BY active DESC, price")))


@app.post("/api/admin/services")
@admin_required
def admin_service_create():
    vals, e = _service_payload(body())
    if e:
        return err(e)
    db = get_db()
    db.execute("INSERT INTO services (name, duration_min, price, created_at) VALUES (?,?,?,?)", (*vals, now()))
    db.commit()
    return jsonify({"ok": True}), 201


@app.put("/api/admin/services/<int:sid>")
@admin_required
def admin_service_update(sid):
    vals, e = _service_payload(body())
    if e:
        return err(e)
    db = get_db()
    db.execute("UPDATE services SET name=?, duration_min=?, price=? WHERE id=?", (*vals, sid))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/admin/services/<int:sid>/toggle")
@admin_required
def admin_service_toggle(sid):
    db = get_db()
    db.execute("UPDATE services SET active = 1 - active WHERE id=?", (sid,))
    db.commit()
    return jsonify({"ok": True})


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
