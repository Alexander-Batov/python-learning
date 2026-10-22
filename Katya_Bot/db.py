import os
import sqlite3

DB_PATH = os.getenv("DB_PATH", "clients.db")


def init():
    with sqlite3.connect(DB_PATH) as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tg_id INTEGER,
                username TEXT,
                name TEXT,
                phone TEXT,
                order_info TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)


def add_client(tg_id, username, name, phone, order_info):
    with sqlite3.connect(DB_PATH) as c:
        c.execute(
            "INSERT INTO clients (tg_id, username, name, phone, order_info) VALUES (?, ?, ?, ?, ?)",
            (tg_id, username, name, phone, order_info),
        )


def all_clients():
    with sqlite3.connect(DB_PATH) as c:
        return c.execute(
            "SELECT id, name, phone, order_info, username, created_at FROM clients ORDER BY id"
        ).fetchall()