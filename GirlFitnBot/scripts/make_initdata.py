"""Генератор валидного initData для локальных тестов API без Telegram.

Подписывает тестовые данные тем же токеном бота, что и в .env, поэтому
сервер принимает их как настоящие. Только для локальной разработки!

Использование:
    python scripts/make_initdata.py [telegram_id]   # по умолчанию 123456789
"""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import config  # noqa: E402


def make_init_data(user_id: int) -> str:
    data = {
        "query_id": "AAtestquery",
        "user": json.dumps({
            "id": user_id,
            "first_name": "Тест",
            "last_name": "",
            "username": "testuser",
            "language_code": "ru",
        }, separators=(",", ":")),
        "auth_date": str(int(time.time())),
    }
    data_check_string = "\n".join(
        f"{key}={value}" for key, value in sorted(data.items())
    )
    secret = hmac.new(
        b"WebAppData", config.bot_token.encode(), hashlib.sha256
    ).digest()
    data["hash"] = hmac.new(
        secret, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    return urllib.parse.urlencode(data)


if __name__ == "__main__":
    uid = int(sys.argv[1]) if len(sys.argv) > 1 else 123456789
    print(make_init_data(uid))
