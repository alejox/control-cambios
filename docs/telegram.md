# Bot de Telegram

Cargar comprobantes desde el chat: mandás la foto, el bot la guarda, la lee
con Gemini y crea el movimiento **pendiente de revisión** con la tasa de
referencia del momento como valor provisorio. La contraparte lo revisa desde
la web y ajusta el USDT si hace falta.

## 1. Crear el bot

En Telegram, hablale a [@BotFather](https://t.me/BotFather):

1. `/newbot`, elegí nombre y usuario.
2. Guardá el token que te devuelve (`123456789:AA...`). **Es la llave del bot:
   quien lo tenga puede leer y escribir en su nombre.**
3. Opcional, para que el chat muestre los comandos: `/setcommands` y pegá

   ```
   ayuda - Cómo se usa
   vincular - Conectar este chat con tu cuenta
   ```

## 2. Variables de entorno

En Vercel (Production y Preview) y en el `.env.local` de desarrollo:

| Variable | Qué es |
|---|---|
| `TELEGRAM_BOT_TOKEN` | El token que dio BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Un secreto que inventás vos. Telegram lo manda en cada llamada y es **la única barrera** del webhook, que es público. |

El secreto admite entre 1 y 256 caracteres de `A-Z a-z 0-9 _ -`. Generá uno
así:

```bash
openssl rand -hex 32
```

Ya tienen que estar configuradas, de antes, `GEMINI_API_KEY` (la lectura del
comprobante) y `SUPABASE_SERVICE_ROLE_KEY` (el bot entra sin sesión de
usuario).

La migración `supabase/phase18_telegram.sql` tiene que estar aplicada.

## 3. Registrar el webhook

**Esto se corre una sola vez**, desde tu máquina, reemplazando los dos
placeholders por los valores reales. No hay que volver a correrlo salvo que
cambie la URL o el secreto.

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://control-cambios-vyu4.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

- `secret_token` es lo que viaja en el header `X-Telegram-Bot-Api-Secret-Token`
  de cada llamada. Tiene que ser **idéntico** a `TELEGRAM_WEBHOOK_SECRET`; si
  no, el endpoint responde 401 y no hace nada.
- `allowed_updates: ["message"]` para que Telegram no mande nada más.
- `drop_pending_updates: true` descarta lo que se haya acumulado antes de
  existir el webhook.

Para ver cómo quedó (muestra la URL, los errores recientes y la cola
pendiente, nunca el secreto):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Y para apagarlo:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"
```

## 4. Conectar tu chat

Cada usuario conecta el suyo, y el vínculo es lo que le dice al bot a nombre
de quién cargar el movimiento:

1. En el panel, botón **Conectar Telegram** (arriba a la derecha).
2. **Generar código** → te da un `/vincular ABCD1234` listo para copiar.
3. Pegáselo al bot en el chat. El código sirve **una sola vez** y vence a los
   **15 minutos**.

Un chat que no está vinculado es un desconocido: el bot ignora en silencio
todo lo que le mande, salvo `/vincular`.

## Notas

- **Nunca** pongas el token ni el secreto en un log, un issue o un commit. El
  token va dentro de la URL de cada llamada a Telegram, así que el código
  nunca reenvía la URL en un mensaje de error.
- El bot respeta los mismos permisos que la web: una cuenta con rol
  `colaborador` solo puede registrar movimientos COP → USDT, y el bot la
  rechaza igual que el formulario.
- Si el bot no puede distinguir si el comprobante está en bolívares o en
  pesos, no adivina: pide que reenvíes la foto escribiendo `Bs` o `COP` como
  texto de la foto.
- Si el token se filtró, pedile a BotFather `/revoke` y actualizá
  `TELEGRAM_BOT_TOKEN` en Vercel.
