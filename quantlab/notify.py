"""Telegram notifications (a separate bot from the live bot; see .env.example)."""
import os

import requests


def telegram(text: str, session=None) -> bool:
    token, chat = os.environ.get("QUANTLAB_TELEGRAM_TOKEN"), os.environ.get("QUANTLAB_TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("[notify] " + text)
        return False
    try:
        (session or requests).post(f"https://api.telegram.org/bot{token}/sendMessage",
                                   json={"chat_id": chat, "text": text}, timeout=15)
        return True
    except requests.RequestException as e:
        print(f"[notify] Telegram failed ({e}); message was: {text}")
        return False
