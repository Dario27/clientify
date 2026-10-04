# Clientify — Fidelización por puntos para barberías (MVP)

- **Frontend:** React 19 + Vite + MUI 7 (paleta *Trust & Reward*)
- **Backend:** API REST en Flask + SQLite

```
clientify/
├── backend/            API Flask (app.py), seed_demo.py, clientify.db (se crea solo)
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
python app.py
python seed_demo.py        # opcional: carga 10 clientes de demo (contraseña 123456)

# 2) Frontend →  http://localhost:5173
cd frontend
npm install
npm run dev
```

En desarrollo, Vite redirige `/api` al backend, así que la cookie de sesión funciona sin configurar CORS.

**Admin por defecto:** `admin@barberia.com` / `admin123`

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
- **Referidos:** cada cliente tiene su enlace `/registro?ref=CODIGO`. Quien refiere gana +10 y el nuevo cliente +5 extra.
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

- Cambiar `SECRET_KEY` (variable de entorno) y la contraseña del admin.
- Agregar CSRF, límite de intentos de login y recuperación de contraseña.
- Anti-fraude de referidos, por ejemplo entregar el bono tras la primera visita pagada.
- Usar gunicorn/waitress con HTTPS y migrar a PostgreSQL cuando crezca.
