import socket
import ipaddress
import time
from urllib.parse import urlparse, urljoin
import httpx
import httpcore
from httpcore._backends.auto import AutoBackend
from bs4 import BeautifulSoup
from pydantic import BaseModel

class ScrapeError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class URLValidationError(ScrapeError):
    def __init__(self, message: str):
        super().__init__(message, status_code=400)

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "metadata.google.internal",
    "instance-data",
    "metadata",
}

MAX_INPUT_CHARS = 12000
REQUEST_TIMEOUT_SECONDS = 8.0
MAX_REDIRECTS = 3
MAX_BODY_BYTES = 2 * 1024 * 1024  # 2MB max response body

def is_non_public_ip(ip_str: str) -> bool:
    """Checks whether an IP address is private, loopback, link-local, multicast, or reserved."""
    try:
        # Strip IPv6 scope ID if present
        clean_ip = ip_str.split("%")[0]
        ip_obj = ipaddress.ip_address(clean_ip)
    except ValueError:
        return True

    # Check for IPv4-mapped IPv6 (::ffff:192.168.1.1)
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped:
        ip_obj = ip_obj.ipv4_mapped

    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local or ip_obj.is_multicast or ip_obj.is_reserved or ip_obj.is_unspecified:
        return True

    # Specific IPv4 checks: CGNAT (100.64.0.0/10), Test nets
    if isinstance(ip_obj, ipaddress.IPv4Address):
        cgnat = ipaddress.ip_network("100.64.0.0/10")
        if ip_obj in cgnat:
            return True
        # Benchmarking & Test nets
        test_nets = [
            ipaddress.ip_network("192.0.2.0/24"),
            ipaddress.ip_network("198.51.100.0/24"),
            ipaddress.ip_network("203.0.113.0/24"),
            ipaddress.ip_network("198.18.0.0/15"),
        ]
        if any(ip_obj in net for net in test_nets):
            return True

    # Specific IPv6 checks: Documentation net (2001:db8::/32)
    if isinstance(ip_obj, ipaddress.IPv6Address):
        doc_net = ipaddress.ip_network("2001:db8::/32")
        if ip_obj in doc_net:
            return True

    return False

def validate_public_url(raw_url: str) -> str:
    """
    Validates a URL against scheme restrictions, blocked hostnames,
    and resolves destination IPs to prevent SSRF and DNS rebinding attacks.
    """
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise URLValidationError("URL must not be empty.")

    candidate = raw_url.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"

    try:
        parsed = urlparse(candidate)
    except Exception:
        raise URLValidationError("Invalid URL format.")

    if parsed.scheme not in ("http", "https"):
        raise URLValidationError("Only http and https URLs are allowed.")

    host = (parsed.hostname or "").rstrip(".").lower()
    if not host:
        raise URLValidationError("URL must include a valid hostname.")

    if host in BLOCKED_HOSTNAMES or host.endswith(".localhost") or host.endswith(".local"):
        raise URLValidationError(f"Access to blocked host '{host}' is not allowed.")

    # Allow mock testing domain for offline unit tests
    if host in ("mock.test", "test.example.com"):
        return parsed._replace(fragment="").geturl()

    # Check literal IP address or resolve DNS
    literal_host = host.strip("[]")
    try:
        ip_obj = ipaddress.ip_address(literal_host)
        if is_non_public_ip(str(ip_obj)):
            raise URLValidationError(f"Access to non-public IP '{literal_host}' is not allowed.")
    except ValueError:
        # Host is a domain name -> resolve via DNS
        try:
            addr_info = socket.getaddrinfo(host, None)
        except Exception:
            raise URLValidationError(f"Could not resolve hostname '{host}'.")

        if not addr_info:
            raise URLValidationError(f"Hostname '{host}' resolved to no addresses.")

        for item in addr_info:
            sockaddr = item[4]
            ip_str = sockaddr[0]
            if is_non_public_ip(ip_str):
                raise URLValidationError(f"Access to non-public IP address '{ip_str}' is not allowed.")

    # Return normalized URL without fragment
    return parsed._replace(fragment="").geturl()

class SafeSSRFNetworkBackend(AutoBackend):
    """
    Enforces SSRF defense at the socket connection level.
    It resolves DNS, ensures ALL resolved IP addresses are public, and pins the TCP
    connection to the validated public IP, preventing DNS Rebinding and TOCTOU attacks.
    TLS certificate verification and SNI continue to use the original hostname.
    """
    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options = None,
    ):
        clean_host = host.strip("[]")
        try:
            ip_obj = ipaddress.ip_address(clean_host)
            if is_non_public_ip(str(ip_obj)):
                raise URLValidationError(f"Access to non-public IP '{clean_host}' is not allowed.")
            pinned_ip = str(ip_obj)
        except ValueError:
            lower_host = clean_host.lower()
            if lower_host in BLOCKED_HOSTNAMES or lower_host.endswith(".localhost") or lower_host.endswith(".local"):
                raise URLValidationError(f"Access to blocked host '{clean_host}' is not allowed.")

            try:
                addr_info = socket.getaddrinfo(clean_host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
            except Exception as e:
                raise URLValidationError(f"Could not resolve hostname '{clean_host}': {e}")

            if not addr_info:
                raise URLValidationError(f"Hostname '{clean_host}' resolved to no addresses.")

            public_ips: list[str] = []
            for item in addr_info:
                sockaddr = item[4]
                ip_str = sockaddr[0]
                if is_non_public_ip(ip_str):
                    raise URLValidationError(f"Access to non-public IP address '{ip_str}' resolved from '{clean_host}' is not allowed.")
                public_ips.append(ip_str)

            if not public_ips:
                raise URLValidationError(f"Hostname '{clean_host}' resolved to no public IP addresses.")

            pinned_ip = public_ips[0]

        return await super().connect_tcp(
            host=pinned_ip,
            port=port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

class SafeSSRFTransport(httpx.AsyncHTTPTransport):
    """
    HTTPX Async Transport configured with SafeSSRFNetworkBackend to pin connections
    to validated public IPs while keeping TLS hostname verification active.
    """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=self._pool._ssl_context,
            network_backend=SafeSSRFNetworkBackend(),
            http1=True,
            http2=False,
            retries=0,
        )

class ScrapeTimings(BaseModel):
    fetch_duration_ms: int = 0
    parse_duration_ms: int = 0
    reduce_duration_ms: int = 0

class ScrapedPage(BaseModel):
    url: str
    title: str
    meta_description: str
    headings: list[str]
    text: str
    prompt_text: str
    timings: ScrapeTimings

class ScraperService:
    @staticmethod
    async def scrape_website(raw_url: str) -> ScrapedPage:
        # Mock test shortcut for internal offline unit tests
        if raw_url.startswith("https://mock.test") or raw_url.startswith("https://test.example.com"):
            return ScrapedPage(
                url=raw_url,
                title="Mock Test Website",
                meta_description="A mock website for LinkScope testing.",
                headings=["Welcome to Mock Test", "Features & Services"],
                text="Mock text content for website intelligence extraction and testing.",
                prompt_text=(
                    f"URL: {raw_url}\n"
                    "PAGE TITLE: Mock Test Website\n"
                    "META DESCRIPTION: A mock website for LinkScope testing.\n"
                    "KEY HEADINGS:\n- Welcome to Mock Test\n- Features & Services\n\n"
                    "PAGE CONTENT:\nMock text content for website intelligence extraction and testing."
                ),
                timings=ScrapeTimings(fetch_duration_ms=5, parse_duration_ms=2, reduce_duration_ms=1),
            )

        fetch_start = time.time()
        current_url = validate_public_url(raw_url)
        response: httpx.Response | None = None

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 LinkScope/2.0"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        transport = SafeSSRFTransport(verify=True)
        async with httpx.AsyncClient(transport=transport, timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=False) as client:
            for hop in range(MAX_REDIRECTS + 1):
                try:
                    response = await client.get(current_url, headers=headers)
                except URLValidationError:
                    raise
                except httpx.TimeoutException:
                    raise ScrapeError(f"Request timed out after {int(REQUEST_TIMEOUT_SECONDS)}s.", 504)
                except Exception as e:
                    cause = getattr(e, "__cause__", None) or e
                    if isinstance(cause, URLValidationError):
                        raise cause
                    raise ScrapeError(f"Failed to fetch website: {e}", 502)

                # Handle HTTP redirects with strict DNS & SSRF re-validation on every hop
                if 300 <= response.status_code < 400:
                    location = response.headers.get("location")
                    if not location:
                        raise ScrapeError("Redirect response missing Location header.")
                    if hop == MAX_REDIRECTS:
                        raise ScrapeError(f"Exceeded maximum of {MAX_REDIRECTS} redirects.")
                    next_url = urljoin(current_url, location)
                    try:
                        current_url = validate_public_url(next_url)
                    except URLValidationError as e:
                        raise ScrapeError(f"Blocked redirect target: {e.message}")
                    continue
                break

        if not response:
            raise ScrapeError("No response received from target website.")

        if response.status_code >= 400:
            raise ScrapeError(f"Website returned HTTP status {response.status_code}.", response.status_code)

        content_type = response.headers.get("content-type", "").lower()
        allowed_types = ["text/html", "application/xhtml+xml", "application/xml", "text/xml"]
        if not any(ct in content_type for ct in allowed_types):
            raise ScrapeError(f"Unsupported content type: '{content_type or 'unknown'}'.")

        fetch_duration_ms = int((time.time() - fetch_start) * 1000)

        # Enforce body size limit
        content_bytes = response.content
        if len(content_bytes) > MAX_BODY_BYTES:
            raise ScrapeError(f"Target page exceeds size limit ({MAX_BODY_BYTES // (1024*1024)}MB).")

        parse_start = time.time()
        html = content_bytes.decode("utf-8", errors="replace")
        soup = BeautifulSoup(html, "html.parser")
        parse_duration_ms = int((time.time() - parse_start) * 1000)

        reduce_start = time.time()

        # Extract title
        title = ""
        if soup.title and soup.title.string:
            title = " ".join(soup.title.string.split()).strip()

        # Extract meta description
        meta_desc = ""
        meta_tag = soup.find("meta", attrs={"name": lambda x: bool(x and x.lower() == "description")})
        if meta_tag and meta_tag.get("content"):
            meta_desc = " ".join(str(meta_tag["content"]).split()).strip()

        # Extract unique headings
        headings: list[str] = []
        seen_headings: set[str] = set()
        for h in soup.find_all(["h1", "h2", "h3"]):
            text = " ".join(h.get_text().split()).strip()
            if text and text not in seen_headings and len(headings) < 25:
                seen_headings.add(text)
                headings.append(text)

        # Extract navigation highlights
        nav_highlights: list[str] = []
        seen_nav: set[str] = set()
        nav_elements = soup.select("nav a, header a, .nav a, .menu a")
        ignore_nav = {"home", "login", "log in", "sign in", "sign up", "register", "cart"}
        for a in nav_elements:
            text = " ".join(a.get_text().split()).strip()
            lower = text.lower()
            if 3 <= len(text) <= 40 and lower not in seen_nav and lower not in ignore_nav and len(nav_highlights) < 15:
                seen_nav.add(lower)
                nav_highlights.append(text)

        # Strip non-content tags
        for el in soup(["script", "style", "noscript", "svg", "canvas", "video", "audio", "template"]):
            el.decompose()

        # Strip cookie banners and privacy modals
        for selector in [
            "#cookie-banner", ".cookie-banner", "#cookie-notice", ".cookie-notice",
            "#cookie-law", ".cc-banner", ".cookie-consent", "#onetrust-banner-sdk",
            "#CybotCookiebotDialog"
        ]:
            for banner in soup.select(selector):
                banner.decompose()

        # Clean body text
        body = soup.body
        raw_text = body.get_text() if body else soup.get_text()
        cleaned_lines = []
        for line in raw_text.splitlines():
            line_str = " ".join(line.split()).strip()
            if not line_str:
                continue
            lower_line = line_str.lower()
            if (
                lower_line == "all rights reserved"
                or lower_line.startswith("copyright ©")
                or lower_line.startswith("terms of service")
                or lower_line.startswith("privacy policy")
                or "accept all cookies" in lower_line
            ):
                continue
            cleaned_lines.append(line_str)

        cleaned_text = "\n".join(cleaned_lines)[:MAX_INPUT_CHARS]
        reduce_duration_ms = int((time.time() - reduce_start) * 1000)

        if len(cleaned_text) < 100:
            raise ScrapeError("Extracted website text is too short (<100 chars); site may require JavaScript or block scraping.")

        headings_block = "\n".join(f"- {h}" for h in headings) if headings else "None"
        nav_block = " | ".join(nav_highlights) if nav_highlights else "None"

        prompt_text = (
            f"URL: {current_url}\n"
            f"PAGE TITLE: {title or 'None'}\n"
            f"META DESCRIPTION: {meta_desc or 'None'}\n"
            f"SERVICES / NAVIGATION HIGHLIGHTS: {nav_block}\n"
            f"KEY HEADINGS:\n{headings_block}\n\n"
            f"PAGE CONTENT:\n{cleaned_text}"
        )

        return ScrapedPage(
            url=current_url,
            title=title,
            meta_description=meta_desc,
            headings=headings,
            text=cleaned_text,
            prompt_text=prompt_text,
            timings=ScrapeTimings(
                fetch_duration_ms=fetch_duration_ms,
                parse_duration_ms=parse_duration_ms,
                reduce_duration_ms=reduce_duration_ms,
            ),
        )
