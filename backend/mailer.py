"""Envío de correo.

EMAIL_BACKEND:
  console (por defecto)  no envía nada: deja el correo en el log y en `outbox`. Sirve para desarrollar y probar.
  smtp                   Cualquier proveedor por SMTP (Resend, Brevo, Mailgun, Gmail...). Solo usa la biblioteca estándar.
  ses                    Amazon SES. Usa las credenciales de la instancia (rol de IAM), sin claves en el .env.

Comunes: EMAIL_FROM (dirección del dominio verificado en el proveedor) y EMAIL_REPLY_TO (opcional).
SMTP: SMTP_HOST, SMTP_PORT (587 por defecto), SMTP_USER, SMTP_PASSWORD (la clave del proveedor: va en backend/.env, que no
se versiona) y SMTP_SECURITY = starttls | ssl | none (por defecto ssl con el puerto 465 y starttls con cualquier otro).
SES: AWS_REGION (us-east-2 por defecto).
"""
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

log = logging.getLogger("clientify.mailer")
outbox = []  # últimos correos del modo console, para las pruebas


def _ses_client():
    import boto3  # solo hace falta con EMAIL_BACKEND=ses
    return boto3.client("sesv2", region_name=os.environ.get("AWS_REGION") or "us-east-2")


def _from(sender, sender_name):
    return formataddr((sender_name, sender)) if sender_name else sender


def _send_ses(to, subject, text, html, sender, sender_name):
    body = {"Text": {"Data": text, "Charset": "UTF-8"}}
    if html:
        body["Html"] = {"Data": html, "Charset": "UTF-8"}
    params = {
        "FromEmailAddress": _from(sender, sender_name),
        "Destination": {"ToAddresses": [to]},
        "Content": {"Simple": {"Subject": {"Data": subject, "Charset": "UTF-8"}, "Body": body}},
    }
    if os.environ.get("EMAIL_REPLY_TO", "").strip():
        params["ReplyToAddresses"] = [os.environ["EMAIL_REPLY_TO"].strip()]
    _ses_client().send_email(**params)


def _send_smtp(to, subject, text, html, sender, sender_name):
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        raise RuntimeError("falta SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT") or 587)
    security = (os.environ.get("SMTP_SECURITY") or ("ssl" if port == 465 else "starttls")).strip().lower()
    if security not in ("ssl", "starttls", "none"):
        raise RuntimeError(f"SMTP_SECURITY inválido: {security}")

    msg = EmailMessage()  # codifica solo los acentos del asunto, del nombre y del cuerpo (UTF-8)
    msg["From"] = _from(sender, sender_name)
    msg["To"] = to
    msg["Subject"] = subject
    if os.environ.get("EMAIL_REPLY_TO", "").strip():
        msg["Reply-To"] = os.environ["EMAIL_REPLY_TO"].strip()
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    context = ssl.create_default_context()
    server = smtplib.SMTP_SSL(host, port, timeout=20, context=context) if security == "ssl" else smtplib.SMTP(host, port, timeout=20)
    with server:
        if security == "starttls":
            server.starttls(context=context)
        if os.environ.get("SMTP_USER", "").strip():
            server.login(os.environ["SMTP_USER"].strip(), os.environ.get("SMTP_PASSWORD", ""))
        server.send_message(msg)


def send_email(to, subject, text, html=None, sender_name=""):
    """Envía un correo. Devuelve True si el proveedor lo aceptó (o se registró en modo console); nunca lanza errores."""
    backend = os.environ.get("EMAIL_BACKEND", "console")
    if backend not in ("ses", "smtp"):
        outbox.append({"to": to, "subject": subject, "text": text, "html": html})
        del outbox[:-20]
        log.warning("[correo simulado] para=%s asunto=%s\n%s", to, subject, text)
        return True

    sender = os.environ.get("EMAIL_FROM", "").strip()
    if not sender:
        log.error("EMAIL_BACKEND=%s pero falta EMAIL_FROM: no se envió el correo a %s", backend, to)
        return False
    try:
        (_send_ses if backend == "ses" else _send_smtp)(to, subject, text, html, sender, sender_name)
        return True
    except Exception:  # noqa: BLE001 - el proveedor rechaza, clave mala, sin red...: se registra y la app sigue
        log.exception("No se pudo enviar el correo a %s", to)
        return False
