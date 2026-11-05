"""Envío de correo.

EMAIL_BACKEND:
  console (por defecto)  no envía nada: deja el correo en el log y en `outbox`. Sirve para desarrollar y probar.
  ses                    Amazon SES. Usa las credenciales de la instancia (rol de IAM), sin claves en el .env.

Variables: EMAIL_FROM (dirección verificada en SES), EMAIL_REPLY_TO (opcional) y AWS_REGION (us-east-2 por defecto).
"""
import logging
import os
from email.utils import formataddr

log = logging.getLogger("clientify.mailer")
outbox = []  # últimos correos del modo console, para las pruebas


def _ses_client():
    import boto3  # solo hace falta en producción
    return boto3.client("sesv2", region_name=os.environ.get("AWS_REGION") or "us-east-2")


def send_email(to, subject, text, html=None, sender_name=""):
    """Envía un correo. Devuelve True si SES lo aceptó (o se registró en modo console); nunca lanza errores."""
    backend = os.environ.get("EMAIL_BACKEND", "console")
    if backend != "ses":
        outbox.append({"to": to, "subject": subject, "text": text, "html": html})
        del outbox[:-20]
        log.warning("[correo simulado] para=%s asunto=%s\n%s", to, subject, text)
        return True

    sender = os.environ.get("EMAIL_FROM", "").strip()
    if not sender:
        log.error("EMAIL_BACKEND=ses pero falta EMAIL_FROM: no se envió el correo a %s", to)
        return False
    body = {"Text": {"Data": text, "Charset": "UTF-8"}}
    if html:
        body["Html"] = {"Data": html, "Charset": "UTF-8"}
    params = {
        "FromEmailAddress": formataddr((sender_name, sender)) if sender_name else sender,
        "Destination": {"ToAddresses": [to]},
        "Content": {"Simple": {"Subject": {"Data": subject, "Charset": "UTF-8"}, "Body": body}},
    }
    if os.environ.get("EMAIL_REPLY_TO", "").strip():
        params["ReplyToAddresses"] = [os.environ["EMAIL_REPLY_TO"].strip()]
    try:
        _ses_client().send_email(**params)
        return True
    except Exception:  # noqa: BLE001 - SES rechaza, sin permisos, sin red...: se registra y la app sigue
        log.exception("No se pudo enviar el correo a %s", to)
        return False
