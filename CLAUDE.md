# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Clientify: MVP de fidelización por puntos para barberías. Backend Flask + SQLite (`backend/`), frontend React 19 + Vite + MUI 7 (`frontend/`), base de datos en `data/clientify.db`. Todo el producto (UI, mensajes de error de la API, rutas del front, comentarios) está en español; mantenerlo así.

## Comandos

```bash
# Backend (http://localhost:5000/api) — requiere backend/.env (copiar de .env.example)
cd backend && pip install -r requirements.txt
python app.py
python seed_demo.py          # 10 clientes de demo; no hace nada si ya hay clientes

# Frontend (http://localhost:5173) — Vite hace proxy de /api al backend
cd frontend && npm install
npm run dev
npm run build                # genera frontend/dist

# Todo en Docker (http://localhost:8085)
docker compose up --build -d
docker compose exec backend python seed_demo.py
```

No hay tests, linter ni migraciones configurados.

## Arquitectura

### Backend: un solo archivo, `backend/app.py`
- SQLite con `sqlite3` crudo (sin ORM). El esquema está en la constante `SCHEMA` y `init_db()` corre **al importar el módulo**: crea las tablas, carga `DEFAULT_SETTINGS`, el admin inicial y los beneficios de ejemplo. No hay migraciones: un cambio de esquema en una base existente hay que hacerlo a mano (`CREATE TABLE IF NOT EXISTS` no altera tablas que ya existen). Única excepción: `init_db()` agrega la columna `users.birthday` con `ALTER TABLE` si falta; seguir ese patrón para columnas nuevas.
- **`add_points()` es la única vía para mover puntos**: actualiza `users.points` y escribe en `transactions` (historial). Nunca modificar el saldo directamente.
- Las reglas del programa (bono de bienvenida, bonos de referido, puntos por dólar, nombre del negocio) viven en la tabla `settings` y se leen con `setting()` / `setting_int()`; no hardcodearlas.
- Auth por cookie de sesión de Flask (`session["user_id"]`), firmada con `SECRET_KEY`. Los endpoints se protegen con los decoradores `admin_required` / `client_required`. Dos roles: `admin` y `client`.
- Canjes: `redeem` genera un código `C-XXXXXX` y descuenta puntos y stock; el admin luego lo marca `entregar` o `cancelar` (cancelar devuelve puntos y stock).
- Errores: `err(msg, status)` responde `{"error": msg}`; el frontend muestra ese texto al usuario.
- Si existe `frontend/dist`, la ruta catch-all `spa()` sirve la webapp (modo "un solo servidor").

### Configuración
- `backend/.env` se carga con `python-dotenv`: `SECRET_KEY`, `FLASK_DEBUG`, `PORT`, `CLIENTIFY_DB`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (solo se usan al crear la base por primera vez), `DEMO_PASSWORD`.
- `CLIENTIFY_DB` por defecto es `../data/clientify.db` relativo a `backend/`.
- `frontend/.env`: `VITE_API_URL` (base de la API en el navegador, por defecto `/api`) y `API_PROXY_TARGET` (destino del proxy de `npm run dev`).
- Los `.env` no se versionan; las plantillas son los `.env.example`.

### Frontend
- `src/api.js` es el único cliente HTTP (`fetch` con `credentials: 'include'`); lanza `Error` con el mensaje de la API y `e.status`.
- `hooks/useApi.js` para cargas GET (`{ data, loading, error, reload }`); `context/AuthContext` mantiene la sesión vía `/api/me`; `context/ToastContext` expone `notify(msg, severity)`.
- Rutas en `App.jsx`: `/login`, `/registro?ref=CODIGO`, `/mi-cuenta` (cliente) y `/admin/*` (admin), protegidas por `RequireRole`.
- QR y registro rápido: el QR de cada cliente codifica su `referral_code`; `/admin/escanear` lo lee (cámara con `jsqr`, solo en HTTPS/localhost) o acepta el código escrito/lector USB y resuelve la ficha con `GET /api/admin/clients/by-code/<code>`. `POST /api/admin/clients` da de alta a un cliente (correo y clave inicial obligatorios, la define el admin; los clientes antiguos con correo `@sin-correo.local` se muestran como "Sin correo" con `realEmail()` de `utils.js`).
- Cambio de clave: `POST /api/password` (propio, pide la clave actual; lo usan cliente y admin desde el botón de llave del layout) y `POST /api/admin/clients/<id>/password` (el admin restablece la de un cliente desde su ficha). No hay recuperación por correo.
- Cumpleaños y reactivación: `users.birthday` (`YYYY-MM-DD`, opcional; se pide al registrarse, en el registro rápido y en un aviso de "Mi cuenta" vía `PUT /api/profile`, que también edita nombre y teléfono desde `/perfil`; solo cambia los campos que reciba). `GET /api/account` regala `birthday_bonus` puntos (tipo `cumpleanos`) una vez al año la primera vez que el cliente entra en su mes; el admin también puede regalarlos con `POST /api/admin/clients/<id>/birthday-gift`. `/admin/reactivar` lista los inactivos (`GET /api/admin/inactive`, más de `inactive_days` sin visita) y los cumpleaños del mes en curso (también los que ya pasaron, con `days` negativo) y de los próximos 30 días (`GET /api/admin/birthdays`) con un enlace `wa.me` ya armado (`whatsapp_url()`, usa `whatsapp_country_code`). Los textos de los mensajes son ajustes (`reactivation_message`, `birthday_message`) con `{nombre}`, `{negocio}`, `{puntos}`, `{bono}`. Los ajustes de texto van en `TEXT_SETTINGS`; el resto son enteros.
- Turnos: una sola agenda (sin barberos). Tablas `services` (nombre, duración, precio; el admin las crea, no hay datos por defecto) y `appointments` (estados `reservado`/`atendido`/`ausente`/`cancelado`). Los horarios libres salen de `free_slots()` según los ajustes `open_time`, `close_time`, `open_days` (1=lunes…7=domingo) y `slot_minutes`; `book()` reserva dentro de `BEGIN IMMEDIATE` para que dos clientes no tomen la misma hora. Cliente: `/turnos` (`GET /api/booking`, `/api/slots`, `/api/appointments`, `POST /api/appointments`, `.../cancel`) y `next_appointment` en `/api/account`. Admin: `/admin/agenda` (recordatorio por WhatsApp con `appointment_message`, y `atender` que suma puntos con `add_visit()` al precio del servicio) y `/admin/servicios`.
- Vencimiento de puntos: ajuste `points_expiry_months` (0 = apagado, por defecto). Cada lote de puntos ganados vence a los N meses y lo que se gasta sale primero de lo más antiguo; `open_lots()` recalcula los lotes desde `transactions` (no hay tabla de lotes) y `expire_points()` registra lo vencido como un movimiento negativo `vencimiento` (sigue pasando por `add_points()`). Se aplica al abrir la cuenta, al canjear, en `_client_or_404()` (ficha del admin) y, una vez al día, con `sweep_expirations()` desde un `before_request` de `/api/admin/*`; no hay tarea programada. `GET /api/account` devuelve `expiring` (puntos que vencen dentro de `expiry_warning_days`). Un `reembolso` cuenta como lote nuevo.
- Tema y paleta "Trust & Reward" en `src/theme.js`; usar sus colores en vez de valores sueltos.

### Mismo origen (importante)
La cookie de sesión es `SameSite=Lax` y el backend **no tiene CORS**. Todo funciona porque el front y la API comparten origen: en desarrollo vía el proxy de Vite, en Docker vía Nginx (`frontend/nginx.conf` redirige `/api/` a `backend:8000`). Servir la API en otro dominio requiere agregar CORS con credenciales.

### Docker
`docker-compose.yml` levanta `backend` (Gunicorn con `--preload` para que `init_db()` corra una sola vez, no expuesto afuera) y `frontend` (build de Vite servido por Nginx en `${APP_PORT:-8085}`). `./data` se monta en `/data` del backend.
