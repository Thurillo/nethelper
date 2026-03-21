"""Cambia la password di un utente NetHelper esistente.

Uso (interattivo):
    cd backend
    python -m app.scripts.change_password

Uso (da setup.sh):
    python -m app.scripts.change_password --username admin --password nuovapass
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import sys


async def main() -> None:
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--username", default=None)
    p.add_argument("--password", default=None)
    args = p.parse_known_args()[0]

    # ── Username ──────────────────────────────────────────────────────────────
    if args.username:
        username = args.username.strip()
    else:
        username = input("Username: ").strip()
    if not username:
        print("Errore: username obbligatorio.")
        sys.exit(1)

    # ── Nuova password ────────────────────────────────────────────────────────
    if args.password:
        new_password = args.password
    else:
        new_password = getpass.getpass("Nuova password: ")
        if not new_password:
            print("Errore: la password non può essere vuota.")
            sys.exit(1)
        confirm = getpass.getpass("Conferma nuova password: ")
        if new_password != confirm:
            print("Errore: le password non corrispondono.")
            sys.exit(1)

    # ── Aggiornamento DB ──────────────────────────────────────────────────────
    from passlib.context import CryptContext
    from app.database import get_async_session
    from app.crud.user import crud_user

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    async with get_async_session() as db:
        user = await crud_user.get_by_username(db, username)
        if not user:
            print(f"Errore: utente '{username}' non trovato.")
            sys.exit(1)

        user.hashed_password = pwd_context.hash(new_password)
        await db.commit()

    print(f"\nPassword aggiornata con successo per '{username}'.")


if __name__ == "__main__":
    asyncio.run(main())
