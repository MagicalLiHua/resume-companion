"""One route policy used before reading bodies or accepting credentials."""

import re
from dataclasses import dataclass

ID_SEGMENT = r"[A-Za-z0-9_-]{1,100}"


@dataclass(frozen=True)
class RoutePolicy:
    methods: tuple[str, ...]
    auth: str = "session"
    body_limit: int = 131072
    media: str = "application/json"


ACCOUNT_ROUTES = [
    (r"/v1/applications", RoutePolicy(("GET", "POST"))),
    (rf"/v1/applications/{ID_SEGMENT}", RoutePolicy(("PATCH", "DELETE"))),
    (r"/v1/imports", RoutePolicy(("GET", "POST"), "session", 10 * 1024**2, "application/pdf")),
    (rf"/v1/imports/{ID_SEGMENT}", RoutePolicy(("GET", "DELETE"))),
    (rf"/v1/imports/{ID_SEGMENT}/file", RoutePolicy(("GET",))),
    (rf"/v1/imports/{ID_SEGMENT}/confirm", RoutePolicy(("POST",), "session", 1100000)),
    (r"/v1/auth/(register|login|recover)", RoutePolicy(("POST",), "public")),
    (r"/v1/auth/(logout|password)", RoutePolicy(("POST",))),
    (r"/v1/me", RoutePolicy(("GET",), "member")),
    (r"/v1/keys", RoutePolicy(("GET", "POST"))),
    (r"/v1/model-settings", RoutePolicy(("GET", "PUT", "DELETE"), "session", 8192)),
    (r"/v1/model-settings/test", RoutePolicy(("POST",), "session", 8192)),
    (rf"/v1/keys/{ID_SEGMENT}", RoutePolicy(("DELETE",))),
    (r"/v1/resumes", RoutePolicy(("GET", "POST"), "resume", 1100000)),
    (rf"/v1/resumes/{ID_SEGMENT}", RoutePolicy(("GET", "PATCH", "DELETE"), "resume", 1100000)),
    (rf"/v1/resumes/{ID_SEGMENT}/(default|copy|restore|restore-version)", RoutePolicy(("POST",))),
    (rf"/v1/resumes/{ID_SEGMENT}/history", RoutePolicy(("GET",))),
    (r"/v1/(trash|usage)", RoutePolicy(("GET",))),
    (r"/v1/admin/users", RoutePolicy(("GET",), "admin")),
    (rf"/v1/admin/users/{ID_SEGMENT}", RoutePolicy(("PATCH",), "admin")),
    (rf"/v1/admin/users/{ID_SEGMENT}/recovery", RoutePolicy(("POST",), "admin")),
]


def account_policy(path):
    for pattern, policy in ACCOUNT_ROUTES:
        if re.fullmatch(pattern, path):
            return policy
    return None
