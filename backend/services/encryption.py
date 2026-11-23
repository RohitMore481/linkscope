import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from backend.config import settings, validate_encryption_key

class ApiKeyEncryptionService:
    CURRENT_VERSION = "v1"
    IV_LENGTH_BYTES = 12  # 96-bit IV
    AUTH_TAG_LENGTH_BYTES = 16  # 128-bit tag

    def __init__(self, master_key: bytes | str | None = None):
        if master_key is None:
            self.master_key = settings.get_encryption_key_bytes()
        elif isinstance(master_key, str):
            self.master_key = validate_encryption_key(master_key)
        elif isinstance(master_key, bytes):
            if len(master_key) != 32:
                raise ValueError(f"Master encryption key must be 32 bytes, got {len(master_key)}")
            self.master_key = master_key
        else:
            raise TypeError("Invalid master key format")

        self._aesgcm = AESGCM(self.master_key)

    def encrypt(self, plaintext: str) -> str:
        """
        Encrypts a plaintext string using AES-256-GCM with a random 96-bit IV.
        Returns serialized format: 'v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>'
        """
        if not plaintext or not isinstance(plaintext, str) or not plaintext.strip():
            raise ValueError("Cannot encrypt empty or invalid API key")

        trimmed = plaintext.strip().encode("utf-8")
        iv = os.urandom(self.IV_LENGTH_BYTES)

        # cryptography appends the 16-byte tag to the ciphertext
        encrypted = self._aesgcm.encrypt(iv, trimmed, None)
        ciphertext = encrypted[:-self.AUTH_TAG_LENGTH_BYTES]
        auth_tag = encrypted[-self.AUTH_TAG_LENGTH_BYTES:]

        return f"{self.CURRENT_VERSION}:{iv.hex()}:{auth_tag.hex()}:{ciphertext.hex()}"

    def decrypt(self, serialized: str) -> str:
        """
        Decrypts a serialized string ('v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>')
        Verifies the 128-bit authentication tag and returns the plaintext.
        """
        if not serialized or not isinstance(serialized, str):
            raise ValueError("Invalid encrypted payload string")

        parts = serialized.split(":")
        if len(parts) != 4:
            raise ValueError(f"Malformed encrypted payload format. Expected 4 segments, got {len(parts)}")

        version, iv_hex, auth_tag_hex, ciphertext_hex = parts

        if version != self.CURRENT_VERSION:
            raise ValueError(f"Unsupported encryption version: '{version}'")

        try:
            iv = bytes.fromhex(iv_hex)
            auth_tag = bytes.fromhex(auth_tag_hex)
            ciphertext = bytes.fromhex(ciphertext_hex)
        except ValueError as e:
            raise ValueError(f"Hex decoding error in encrypted payload: {e}")

        if len(iv) != self.IV_LENGTH_BYTES:
            raise ValueError(f"Invalid IV length: expected {self.IV_LENGTH_BYTES} bytes, got {len(iv)}")
        if len(auth_tag) != self.AUTH_TAG_LENGTH_BYTES:
            raise ValueError(f"Invalid auth tag length: expected {self.AUTH_TAG_LENGTH_BYTES} bytes, got {len(auth_tag)}")

        # Combine ciphertext and auth tag for AESGCM.decrypt
        encrypted_data = ciphertext + auth_tag
        try:
            decrypted_bytes = self._aesgcm.decrypt(iv, encrypted_data, None)
            return decrypted_bytes.decode("utf-8")
        except Exception as e:
            raise ValueError(f"Decryption failed: authentication tag verification error or corrupt payload: {e}")
