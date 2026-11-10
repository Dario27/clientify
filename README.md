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

### HTTPS con dominio propio (producción)

Caddy se pone delante, saca y renueva solo el certificado de Let's Encrypt y redirige HTTP a HTTPS. Pasos:

1. Un registro DNS `A` del dominio (por ejemplo `clientify.midominio.com`) apuntando a la IP del servidor, y los puertos 80 y 443 abiertos.
2. En el `.env` de la raíz (junto a `docker-compose.yml`):
   ```
   APP_DOMAIN=clientify.midominio.com
   APP_PORT=127.0.0.1:8085   # el frontend deja libre el 80 para Caddy
   COOKIE_SECURE=1           # la cookie de sesión solo viaja por HTTPS
   ```
3. `docker compose --profile https up -d --build`

Sin el perfil `https` todo funciona como antes (`http://localhost:8085`). No borres el volumen `caddy_data`: guarda los certificados.

### Recuperar la clave por correo

En el login, «¿Olvidaste tu clave?» envía un enlace de un solo uso (vale 60 minutos, máximo 3 pedidos por hora y cuenta) que abre `/restablecer`. Solo para clientes con correo real: el admin queda fuera y su clave se cambia desde el botón de la llave. Un administrador también puede restablecer la de un cliente desde su ficha.

- **Desarrollo:** no se envía nada. El correo (con el enlace) queda en el log del backend (`EMAIL_BACKEND=console`, por defecto). Como el backend corre en el puerto 5000 y la app en el 5173, para que el enlace del log abra el frontend pon `APP_URL=http://localhost:5173` en `backend/.env`.
- **Producción:** hay dos modos de envío, `EMAIL_BACKEND=smtp` (cualquier proveedor por SMTP) y `EMAIL_BACKEND=ses` (Amazon SES). Con cualquiera, en el `.env` de la raíz van `EMAIL_FROM=no-responder@tu-dominio` (del dominio verificado en el proveedor), `APP_URL=https://tu-dominio` (el enlace se arma con esto, nunca con el Host de la petición) y, opcional, `EMAIL_REPLY_TO`.
  - **SMTP:** en `backend/.env` (que no se versiona) van `SMTP_HOST`, `SMTP_PORT` (587 por defecto), `SMTP_USER` y `SMTP_PASSWORD` (la clave o API key del proveedor, que nunca debe ir al `.env` de la raíz ni al repositorio). `SMTP_SECURITY` es `starttls`, `ssl` o `none`; por defecto `ssl` con el puerto 465 y `starttls` con cualquier otro. Ejemplos: Resend (`smtp.resend.com`, puerto 465, usuario `resend`, la API key como clave) y Brevo (`smtp-relay.brevo.com`, puerto 587, tu correo de acceso como usuario y la clave SMTP; revisa la documentación del proveedor por si cambió). Hay que verificar el dominio en el proveedor con los registros DNS que indique (DKIM y SPF).
  - **SES:** usa las credenciales de la instancia, sin claves en el `.env`: la instancia necesita un rol de IAM que permita `ses:SendEmail` y el remitente verificado en SES (DKIM). Mientras la cuenta de SES esté en modo prueba solo envía a direcciones verificadas, así que para clientes reales hay que pedir el paso a producción o usar SMTP.

### App instalable (PWA)

La webapp se puede instalar en el celular o el computador (manifiesto, íconos y service worker en `frontend/public/`). Requiere HTTPS, o `localhost` para probarla. En Android y Chrome aparece el botón **Instalar** (en el perfil del cliente y en el menú del admin); en iPhone, desde Safari: Compartir → «Agregar a pantalla de inicio».

- Sin conexión se muestra una página que avisa que no hay internet. Las llamadas a `/api` nunca se guardan en caché, así que no se ven datos viejos.
- El service worker solo se registra en el build de producción (`npm run build`), no en `npm run dev`. Para probarlo en local: `npm run build && npm run preview` y abrir `http://localhost:4173`.
- Si cambias los archivos de caché de `public/sw.js`, sube `VERSION` para que los navegadores descarten la caché anterior.

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
- Migrar a PostgreSQL cuando crezca.

Developer: Steven Chilan
Otros Authors: Jeff Pino
Since: 2026
