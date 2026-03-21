"""Script to create an admin user.

Usage (interactive):
    cd backend
    python -m app.scripts.create_admin

Usage (non-interactive, e.g. from setup.sh):
    python -m app.scripts.create_admin --username admin --password secret
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import sys


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--username", default=None)
    p.add_argument("--email",    default=None)
    p.add_argument("--password", default=None)
    return p.parse_known_args()[0]


async def main() -> None:
    args = _parse_args()

    print("=== NetHelper - Creazione utente admin ===")

    # ── Username ──────────────────────────────────────────────────────────────
    if args.username:
        username = args.username.strip()
    else:
        username = input("Username: ").strip()
    if not username:
        print("Errore: username obbligatorio.")
        sys.exit(1)

    # ── Email (opzionale) ─────────────────────────────────────────────────────
    if args.email is not None:
        email = args.email.strip() or None
    else:
        email = input("Email (opzionale, invio per saltare): ").strip() or None

    # ── Password ──────────────────────────────────────────────────────────────
    if args.password:
        password = args.password
    else:
        password = getpass.getpass("Password: ")
        if not password:
            print("Errore: password obbligatoria.")
            sys.exit(1)
        confirm = getpass.getpass("Conferma password: ")
        if password != confirm:
            print("Errore: le password non corrispondono.")
            sys.exit(1)

    # ── DB ────────────────────────────────────────────────────────────────────
    from app.database import get_async_session
    from app.crud.user import crud_user
    from app.schemas.user import UserCreate
    from app.models.user import UserRole

    async with get_async_session() as db:
        existing = await crud_user.get_by_username(db, username)
        if existing:
            print(f"Errore: l'utente '{username}' esiste già.")
            sys.exit(1)

        if email:
            existing_email = await crud_user.get_by_email(db, email)
            if existing_email:
                print(f"Errore: l'email '{email}' è già in uso.")
                sys.exit(1)

        user_in = UserCreate(
            username=username,
            email=email,
            password=password,
            role=UserRole.admin,
        )
        user = await crud_user.create(db, user_in)
        print(f"\nUtente admin creato con successo!")
        print(f"  ID:       {user.id}")
        print(f"  Username: {user.username}")
        print(f"  Email:    {user.email or '(nessuna)'}")
        print(f"  Ruolo:    {user.role.value}")


if __name__ == "__main__":
    asyncio.run(main())
