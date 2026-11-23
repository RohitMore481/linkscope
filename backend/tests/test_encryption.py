import pytest
from backend.services.encryption import ApiKeyEncryptionService

def test_encryption_and_decryption_lifecycle():
    service = ApiKeyEncryptionService()
    raw_key = "AIzaSyTestApiKey1234567890abcdefghijklmnopqrst"

    encrypted = service.encrypt(raw_key)
    assert encrypted.startswith("v1:")
    parts = encrypted.split(":")
    assert len(parts) == 4
    iv_hex, auth_tag_hex, ciphertext_hex = parts[1], parts[2], parts[3]
    assert len(iv_hex) == 24  # 12 bytes = 24 hex
    assert len(auth_tag_hex) == 32  # 16 bytes = 32 hex
    assert len(ciphertext_hex) > 0

    decrypted = service.decrypt(encrypted)
    assert decrypted == raw_key

def test_unique_ivs_per_encryption():
    service = ApiKeyEncryptionService()
    raw_key = "AIzaSySameKeyRepeatedEncryption1234567890"

    enc1 = service.encrypt(raw_key)
    enc2 = service.encrypt(raw_key)

    assert enc1 != enc2
    iv1 = enc1.split(":")[1]
    iv2 = enc2.split(":")[1]
    assert iv1 != iv2
    assert service.decrypt(enc1) == raw_key
    assert service.decrypt(enc2) == raw_key

def test_tampered_ciphertext_rejection():
    service = ApiKeyEncryptionService()
    raw_key = "AIzaSyTamperTest1234567890"
    encrypted = service.encrypt(raw_key)
    parts = encrypted.split(":")

    # Corrupt last hex character of ciphertext
    tampered_cipher = parts[3][:-1] + ("0" if parts[3][-1] != "0" else "1")
    tampered_payload = f"{parts[0]}:{parts[1]}:{parts[2]}:{tampered_cipher}"

    with pytest.raises(ValueError, match="Decryption failed"):
        service.decrypt(tampered_payload)

def test_tampered_auth_tag_rejection():
    service = ApiKeyEncryptionService()
    raw_key = "AIzaSyAuthTagTamper1234567890"
    encrypted = service.encrypt(raw_key)
    parts = encrypted.split(":")

    tampered_tag = parts[2][:-1] + ("0" if parts[2][-1] != "0" else "1")
    tampered_payload = f"{parts[0]}:{parts[1]}:{tampered_tag}:{parts[3]}"

    with pytest.raises(ValueError, match="Decryption failed"):
        service.decrypt(tampered_payload)

def test_reject_empty_or_whitespace_key():
    service = ApiKeyEncryptionService()
    with pytest.raises(ValueError, match="Cannot encrypt empty"):
        service.encrypt("")
    with pytest.raises(ValueError, match="Cannot encrypt empty"):
        service.encrypt("   ")
