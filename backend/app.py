"""
Clientify — API de fidelización por puntos para barberías.
Flask + SQLite. Ejecutar:  python app.py   ->  API en http://localhost:5000/api
Si existe ../frontend/dist (npm run build), también sirve la webapp React.
"""
import os
import secrets
import sqlite3
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, g, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("CLIENTIFY_DB", os.path.join(BASE_DIR, "clientify.db"))
DIST_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist"))

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "cambia-esta-clave-en-produccion")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")

DEFAULT_SETTINGS = {
    "business_name": "Barbería El Filo",
    "welcome_bonus": "5",
    "referral_bonus_referrer": "10",
    "referral_bonus_referred": "5",
    "points_per_dollar": "1",
}
INT_SETTINGS = [k for k in DEFAULT_SETTINGS if k != "business_name"]

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
                              "referral_code", "created_at")}


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    for k, v in DEFAULT_SETTINGS.items():
        db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)", (k, v))
    if not db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        db.execute(
            "INSERT INTO users (name, email, phone, password_hash, role, referral_code, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            ("Administrador", "admin@barberia.com", "", generate_password_hash("admin123"),
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


@app.post("/api/register")
def register():
    db = get_db()
    d = body()
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    phone = (d.get("phone") or "").strip()
    password = d.get("password") or ""
    ref_code = (d.get("ref") or "").strip().upper()

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

    cur = db.execute(
        "INSERT INTO users (name, email, phone, password_hash, role, referral_code, referred_by,"
        " created_at) VALUES (?,?,?,?, 'client', ?,?,?)",
        (name, email, phone, generate_password_hash(password),
         unique_code(db, "users", "referral_code"), referrer["id"] if referrer else None, now()))
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
    return jsonify({
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
            return err("Los valores de puntos deben ser enteros ≥ 0.")
        if key == "business_name" and not val:
            return err("El nombre del negocio no puede quedar vacío.")
        db.execute("INSERT INTO settings (key, value) VALUES (?,?)"
                   " ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, val))
    db.commit()
    return jsonify(all_settings())


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
    app.run(debug=True, host="0.0.0.0", port=5000)
