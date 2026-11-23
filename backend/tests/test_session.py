import time
from backend.services.session_store import InMemorySessionStore

def test_session_creation_and_retrieval():
    store = InMemorySessionStore(default_ttl_seconds=3600)
    fake_enc = "v1:0123:4567:89ab"
    session_id, expires_at, ttl = store.create_session(fake_enc)

    assert len(session_id) == 64  # 32 bytes hex = 256 bits
    assert ttl == 3600
    assert store.count == 1

    session = store.get_session(session_id)
    assert session is not None
    assert session.encrypted_key == fake_enc

def test_session_ttl_expiration():
    store = InMemorySessionStore(default_ttl_seconds=1)
    fake_enc = "v1:0123:4567:89ab"
    session_id, _, _ = store.create_session(fake_enc, ttl_seconds=1)

    assert store.get_session(session_id) is not None
    time.sleep(1.1)

    # get_session automatically invalidates and removes expired session
    assert store.get_session(session_id) is None
    assert store.count == 0

def test_session_status_safe_metadata():
    store = InMemorySessionStore(default_ttl_seconds=3600)
    fake_enc = "v1:0123:4567:89ab"
    session_id, _, _ = store.create_session(fake_enc)

    stat = store.get_status(session_id)
    assert stat.active is True
    assert stat.expires_at is not None
    assert stat.ttl_remaining is not None
    assert stat.ttl_remaining > 0

    # Ensure key is not present in status
    assert not hasattr(stat, "encrypted_key")

def test_session_deletion_and_clear():
    store = InMemorySessionStore(default_ttl_seconds=3600)
    s1, _, _ = store.create_session("enc1")
    s2, _, _ = store.create_session("enc2")
    assert store.count == 2

    assert store.delete_session(s1) is True
    assert store.get_session(s1) is None
    assert store.count == 1

    store.clear()
    assert store.count == 0
