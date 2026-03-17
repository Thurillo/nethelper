from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import get_settings

settings = get_settings()


def _get_key() -> bytes:
    """Derive 32-byte key from the hex ENCRYPTION_KEY setting."""
    key_hex = settings.ENCRYPTION_KEY
    if len(key_hex) != 64:
        raise ValueError(
            "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)."
        )
    return bytes.fromhex(key_hex)


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string value using AES-256-GCM.

    Returns a base64-encoded string: nonce(12 bytes) + ciphertext.
    """
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    raw = nonce + ciphertext
    return base64.b64encode(raw).decode("utf-8")


def decrypt_value(encrypted: str) -> str:
    """Decrypt a value previously encrypted with encrypt_value."""
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted.encode("utf-8"))
    nonce = raw[:12]
    ciphertext = raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")
