import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip()}
MATERIALS_PATH = "materials/price.pdf"
_ch = os.getenv("CHANNEL_ID", "").strip()
CHANNEL_ID = int(_ch) if _ch.lstrip("-").isdigit() else (_ch or None)  # @имя_канала или -100...
CHANNEL_URL = os.getenv("CHANNEL_URL")  # https://t.me/имя_канала