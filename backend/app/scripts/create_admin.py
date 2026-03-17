"""Script to create an admin user.

Usage:
    cd backend
    python -m app.scripts.create_admin
"""
from __future__ import annotations

import asyncio
import sys


async def main() -> None:
    print("=== NetHelper - Create Admin User ===")

    username = input("Username: ").strip()
    if not username:
        print("Error: username cannot be empty.")
        sys.exit(1)

    email = input("Email (optional, press Enter to skip): ").strip() or None

    import getpass
    password = getpass.getpass("Password: ")
    if not password:
        print("Error: password cannot be empty.")
        sys.exit(1)

    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("Error: passwords do not match.")
        sys.exit(1)

    from app.database import get_async_session
    from app.crud.user import crud_user
    from app.schemas.user import UserCreate
    from app.models.user import UserRole

    async with get_async_session() as db:
        existing = await crud_user.get_by_username(db, username)
        if existing:
            print(f"Error: user '{username}' already exists.")
            sys.exit(1)

        if email:
            existing_email = await crud_user.get_by_email(db, email)
            if existing_email:
                print(f"Error: email '{email}' is already in use.")
                sys.exit(1)

        user_in = UserCreate(
            username=username,
            email=email,
            password=password,
            role=UserRole.admin,
        )
        user = await crud_user.create(db, user_in)
        print(f"\nAdmin user created successfully!")
        print(f"  ID:       {user.id}")
        print(f"  Username: {user.username}")
        print(f"  Email:    {user.email or '(none)'}")
        print(f"  Role:     {user.role.value}")


if __name__ == "__main__":
    asyncio.run(main())
