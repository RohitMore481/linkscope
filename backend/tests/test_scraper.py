import pytest
from backend.services.scraper import (
    is_non_public_ip,
    validate_public_url,
    URLValidationError,
    ScraperService,
    SafeSSRFNetworkBackend,
    SafeSSRFTransport,
)

def test_private_ipv4_detection():
    # RFC 1918
    assert is_non_public_ip("10.0.0.1") is True
    assert is_non_public_ip("172.16.5.1") is True
    assert is_non_public_ip("172.31.255.255") is True
    assert is_non_public_ip("192.168.1.1") is True

    # Loopback
    assert is_non_public_ip("127.0.0.1") is True
    assert is_non_public_ip("127.1.2.3") is True

    # Link-local & Cloud metadata
    assert is_non_public_ip("169.254.169.254") is True

    # Carrier-grade NAT (RFC 6598)
    assert is_non_public_ip("100.64.0.1") is True
    assert is_non_public_ip("100.127.255.255") is True

    # Multicast & Broadcast
    assert is_non_public_ip("224.0.0.1") is True
    assert is_non_public_ip("255.255.255.255") is True

    # Public IPs
    assert is_non_public_ip("8.8.8.8") is False
    assert is_non_public_ip("1.1.1.1") is False
    assert is_non_public_ip("93.184.216.34") is False

def test_private_ipv6_detection():
    # Loopback
    assert is_non_public_ip("::1") is True
    # Link-local
    assert is_non_public_ip("fe80::1") is True
    # Unique local
    assert is_non_public_ip("fc00::1") is True
    assert is_non_public_ip("fd00::1") is True
    # IPv4-mapped private
    assert is_non_public_ip("::ffff:192.168.1.1") is True
    # IPv4-mapped public
    assert is_non_public_ip("::ffff:8.8.8.8") is False

def test_blocked_hostnames_rejection():
    with pytest.raises(URLValidationError, match="blocked host"):
        validate_public_url("http://localhost/admin")
    with pytest.raises(URLValidationError, match="blocked host"):
        validate_public_url("http://metadata.google.internal/computeMetadata/v1/")
    with pytest.raises(URLValidationError, match="blocked host"):
        validate_public_url("http://instance-data/latest/meta-data/")
    with pytest.raises(URLValidationError, match="blocked host"):
        validate_public_url("http://test.local/")

def test_invalid_scheme_rejection():
    with pytest.raises(URLValidationError, match="Only http and https"):
        validate_public_url("file:///etc/passwd")
    with pytest.raises(URLValidationError, match="Only http and https"):
        validate_public_url("gopher://example.com")
    with pytest.raises(URLValidationError, match="Only http and https"):
        validate_public_url("ftp://example.com/test")

@pytest.mark.asyncio
async def test_mock_scrape_execution():
    scraped = await ScraperService.scrape_website("https://mock.test")
    assert scraped.url == "https://mock.test"
    assert "Mock Test Website" in scraped.title
    assert len(scraped.headings) > 0
    assert len(scraped.text) > 10
    assert "PAGE CONTENT:" in scraped.prompt_text

@pytest.mark.asyncio
async def test_ssrf_backend_blocks_private_ip():
    backend = SafeSSRFNetworkBackend()
    # Connecting directly to a loopback or private IP must fail with URLValidationError
    with pytest.raises(URLValidationError, match="non-public IP"):
        await backend.connect_tcp("127.0.0.1", 80)

    with pytest.raises(URLValidationError, match="non-public IP"):
        await backend.connect_tcp("10.0.0.1", 80)

    with pytest.raises(URLValidationError, match="non-public IP"):
        await backend.connect_tcp("169.254.169.254", 80)

@pytest.mark.asyncio
async def test_ssrf_backend_blocks_blocked_hosts():
    backend = SafeSSRFNetworkBackend()
    with pytest.raises(URLValidationError, match="blocked host"):
        await backend.connect_tcp("localhost", 80)

    with pytest.raises(URLValidationError, match="blocked host"):
        await backend.connect_tcp("metadata.google.internal", 80)
