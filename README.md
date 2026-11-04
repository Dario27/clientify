# Clientify — Fidelización por puntos para barberías (MVP)

- **Frontend:** React 19 + Vite + MUI 7 (paleta *Trust & Reward*)
- **Backend:** API REST en Flask + SQLite

```
clientify/
├── docker-compose.yml  Levanta frontend (Nginx) + backend (Gunicorn)
├── data/               clientify.db (se crea solo; no se versiona)
├── backend/            API Flask (app.py), seed_demo.py
└── frontend/           React + MUI
    └── src/
        ├── theme.js    Paleta y tema MUI
        ├── api.js      Cliente fetch → /api
        ├── context/    Sesión (AuthContext) y notificaciones (ToastContext)
        ├── components/ Layouts (admin con sidebar, cliente con topbar) y piezas comunes
        └── pages/      Login, Registro, client/Account, admin/*
```

## Puesta en marcha (desarrollo)

Necesitas dos terminales.

```bash
# 1) Backend  →  http://localhost:5000/api
cd backend
pip install -r requirements.txt
cp .env.example .env       # y completa SECRET_KEY (ver comentario dentro)
python app.py
python seed_demo.py        # opcional: carga 10 clientes de demo (contraseña 123456)

# 2) Frontend →  http://localhost:5173
cd frontend
cp .env.example .env       # opcional: VITE_API_URL y API_PROXY_TARGET
npm install
npm run dev
```

En desarrollo, Vite redirige `/api` al backend, así que la cookie de sesión funciona sin configurar CORS.

**Configuración:** el backend lee `backend/.env` (no se versiona; la plantilla es `backend/.env.example`).
Ahí van `SECRET_KEY`, el puerto y las credenciales de prueba (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEMO_PASSWORD`).
El admin se crea con esos valores solo la primera vez que se inicializa la base.

**Admin por defecto:** `admin@barberia.com` / `admin123` (configurable en `.env`)

## Docker (todo con un solo compose)

```bash
cp backend/.env.example backend/.env   # completa SECRET_KEY y ADMIN_PASSWORD
docker compose up --build -d           # webapp + API en http://localhost:8085
docker compose exec backend python seed_demo.py   # opcional: datos de demo
```

- `frontend`: Nginx sirve la webapp compilada y redirige `/api` al backend (mismo origen, sin CORS).
- `backend`: Flask con Gunicorn; no se publica afuera, solo lo ve Nginx.
- `data/`: carpeta montada en el contenedor con la base `clientify.db`; sobrevive a rebuilds.
- Para cambiar el puerto: `APP_PORT=9000 docker compose up -d`.

## Producción simple (un solo servidor)

```bash
cd frontend && npm run build    # genera frontend/dist
cd ../backend && python app.py  # Flask sirve la API y la webapp en :5000
```

## Paleta "Trust & Reward" (`src/theme.js`)

| Rol | Color |
|---|---|
| Fondo dominante (Azul Noche) | `#0A1128` |
| Marca / acento: puntos, botones clave (Oro Viejo) | `#E5A93B` |
| Tarjetas, bordes, interacción (Pizarra) | `#1E293B` |
| Texto principal / superficies profundas | `#F8FAFC` / `#0F172A` |

## Reglas del programa

- **Registro:** el bono de bienvenida es de 5 pts.
- **Referidos:** cada cliente tiene su enlace `/registro?ref=CODIGO`. Quien refiere gana +10 y el nuevo cliente +5 extra, pero solo cuando el invitado hace su primera visita pagada (opcionalmente de un monto mínimo), para que crear cuentas falsas no rinda.
- **Acumulación:** el admin registra cada visita con el monto pagado y se da 1 pt por cada $1.
- **Canje:** el cliente elige el beneficio y recibe un código `C-XXXXXX`. En la barbería, el admin busca el código en **Canjes** y lo marca como **Entregado**, o lo **Cancela** (se devuelven los puntos y el stock).
- **Configuración:** todos los valores anteriores se editan desde *Configuración*.

## Endpoints principales

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/register`, `/api/login`, `/api/logout` | Autenticación (cookie de sesión) |
| GET | `/api/me`, `/api/public?ref=` | Sesión actual / datos públicos + referidor |
| GET / POST | `/api/account`, `/api/redeem/:rewardId` | Portal del cliente |
| GET | `/api/admin/dashboard` | KPIs, gráfico de 14 días, pendientes, top |
| GET | `/api/admin/clients[?q=]`, `/api/admin/clients/:id` | Clientes |
| POST | `/api/admin/clients/:id/visit`, `/api/admin/clients/:id/adjust` | Sumar puntos o ajustar el saldo |
| GET / POST / PUT | `/api/admin/rewards[/:id]`, `/api/admin/rewards/:id/toggle` | Beneficios |
| GET / POST | `/api/admin/redemptions[?status=&q=]`, `/api/admin/redemptions/:id/(entregar\|cancelar)` | Canjes |
| GET / PUT | `/api/admin/settings` | Configuración |

## Pendiente antes de producción

- Definir `SECRET_KEY` y `ADMIN_PASSWORD` propios en el `.env` del servidor y poner `FLASK_DEBUG=0`.
- Agregar CSRF, límite de intentos de login y recuperación de contraseña.
- Usar gunicorn/waitress con HTTPS y migrar a PostgreSQL cuando crezca.

Developer: Steven Chilan
Otros Authors: Jeff Pino
Since: 2026
