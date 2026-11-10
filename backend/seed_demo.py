"""Carga datos de demostración (clientes, visitas, referidos y canjes). Uso: python seed_demo.py"""
import os
import random
from datetime import datetime, timedelta

import app as A

random.seed(7)
NAMES = ["Carlos Mendoza", "Andrés Vera", "Kevin Zambrano", "José Macías", "Luis Andrade",
         "Mateo Rivera", "Diego Cedeño", "Bryan Torres", "Jorge Alvarado", "Daniel Ponce"]
CONCEPTS = [("Corte clásico", 8), ("Corte + barba", 14), ("Fade con diseño", 12), ("Barba", 6)]

with A.app.app_context():
    db = A.get_db()
    if db.execute("SELECT COUNT(*) FROM users WHERE role='client'").fetchone()[0]:
        print("La base ya tiene clientes; no se cargó nada.")
        raise SystemExit
    admin = db.execute("SELECT id FROM users WHERE role='admin'").fetchone()["id"]
    ids = []
    for i, name in enumerate(NAMES):
        day = datetime.now() - timedelta(days=20 - i * 2)
        ref = ids[random.randrange(len(ids))] if ids and i % 3 == 0 else None
        email = name.lower().split()[0] + str(i) + "@demo.com"
        cur = db.execute(
            "INSERT INTO users (name, email, phone, password_hash, role, referral_code, referred_by,"
            " created_at) VALUES (?,?,?,?, 'client', ?,?,?)",
            (name, email, f"09{random.randint(10000000, 99999999)}", A.generate_password_hash(os.environ.get("DEMO_PASSWORD", "123456")),
             A.unique_code(db, "users", "referral_code"), ref, day.strftime("%Y-%m-%d %H:%M")))
        uid = cur.lastrowid
        ids.append(uid)
        A.add_points(db, uid, A.setting_int("welcome_bonus"), "bienvenida", "Bono de bienvenida")
        if ref:
            A.add_points(db, uid, A.setting_int("referral_bonus_referred"), "referido", "Bono por código de referido")
            A.add_points(db, ref, A.setting_int("referral_bonus_referrer"), "referido", f"Bono por referir a {name}")
            db.execute("UPDATE users SET referral_rewarded=1 WHERE id=?", (uid,))  # estos bonos ya se entregaron
        for _ in range(random.randint(2, 7)):
            concept, price = random.choice(CONCEPTS)
            A.add_points(db, uid, price * A.setting_int("points_per_dollar"), "visita",
                         f"{concept} (${price:.2f})", admin, amount=price, concept=concept)
    # Fechas repartidas en los últimos 14 días para que el gráfico tenga forma
    for t in db.execute("SELECT id FROM transactions").fetchall():
        d = datetime.now() - timedelta(days=random.randint(0, 13), hours=random.randint(0, 8))
        db.execute("UPDATE transactions SET created_at=? WHERE id=?", (d.strftime("%Y-%m-%d %H:%M"), t["id"]))
    # Un par de canjes
    rewards = db.execute("SELECT * FROM rewards ORDER BY points_cost").fetchall()
    for uid in ids:
        pts = db.execute("SELECT points FROM users WHERE id=?", (uid,)).fetchone()["points"]
        r = next((r for r in reversed(rewards) if r["points_cost"] <= pts), None)
        if r and random.random() < 0.6:
            code = A.unique_code(db, "redemptions", "code", "C-")
            status = random.choice(["pendiente", "entregado", "entregado"])
            d = (datetime.now() - timedelta(days=random.randint(0, 10))).strftime("%Y-%m-%d %H:%M")
            db.execute("INSERT INTO redemptions (user_id, reward_id, points, code, status, created_at,"
                       " resolved_at) VALUES (?,?,?,?,?,?,?)",
                       (uid, r["id"], r["points_cost"], code, status, d, d if status != "pendiente" else None))
            A.add_points(db, uid, -r["points_cost"], "canje", f"Canje: {r['name']} ({code})")
    db.commit()
    print(f"Listo: {len(ids)} clientes de demo (contraseña 123456).")
