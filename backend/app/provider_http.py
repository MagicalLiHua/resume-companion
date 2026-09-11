"""Connect only to validated public IPs while retaining the original TLS identity."""

import asyncio
import ipaddress
import re
import socket
from urllib.parse import urlsplit

import httpx

from .errors import APIError


def public_ip(address):
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def normalize_endpoint(value):
    parsed = urlsplit(value)
    try:
        port = parsed.port
    except ValueError:
        raise ValueError("Invalid HTTPS endpoint") from None
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or not value.isascii()
        or any(c.isspace() for c in value)
        or not re.fullmatch(r"(?:/[A-Za-z0-9_-]+)*/?", parsed.path)
        or port == 0
    ):
        raise ValueError("Use a public HTTPS base URL")
    host = parsed.hostname.lower()
    try:
        if not public_ip(host):
            raise ValueError("Private endpoints are unavailable")
    except ValueError as error:
        if ":" in host or re.fullmatch(r"[0-9.]+", host):
            raise ValueError("Private or invalid IP") from error
        if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host) or "." not in host:
            raise ValueError("Invalid public hostname") from error
    if host.endswith((".localhost", ".local", ".internal", ".test")):
        raise ValueError("Private endpoints are unavailable")
    authority = f"[{host}]" if ":" in host else host
    if port and port != 443:
        authority += ":" + str(port)
    return "https://" + authority + parsed.path.rstrip("/")


class PublicTransport(httpx.AsyncBaseTransport):
    def __init__(self, transport=None, resolver=None):
        self.transport = transport or httpx.AsyncHTTPTransport(retries=0)
        self.resolver = resolver

    async def handle_async_request(self, request):
        host, port = request.url.host, request.url.port or 443
        if request.url.scheme != "https":
            raise APIError("MODEL_ENDPOINT_DENIED")
        try:
            resolver = self.resolver or asyncio.get_running_loop().getaddrinfo
            records = await resolver(host, port, type=socket.SOCK_STREAM)
            addresses = list(dict.fromkeys(record[4][0] for record in records))
            if not addresses or not all(public_ip(address) for address in addresses):
                raise APIError("MODEL_ENDPOINT_DENIED")
        except (OSError, ValueError):
            raise APIError("MODEL_ENDPOINT_DENIED") from None
        headers = request.headers.copy()
        headers["Host"] = request.url.netloc.decode()
        pinned = httpx.Request(
            request.method,
            request.url.copy_with(host=addresses[0]),
            headers=headers,
            stream=request.stream,
            extensions={**request.extensions, "sni_hostname": host},
        )
        return await self.transport.handle_async_request(pinned)

    async def aclose(self):
        await self.transport.aclose()
