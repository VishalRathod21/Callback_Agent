"""Rate limiting service with support for IP and Account-based limits, exponential backoff, and sliding window checks."""

import time
import math
import logging
import json
import asyncio
from typing import Dict, List, Optional, Tuple
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import jwt

from core.config import settings

logger = logging.getLogger(__name__)

# Excluded paths
EXCLUDED_PATHS = {"/health", "/favicon.ico"}
EXCLUDED_PREFIXES = {"/ws"}

# Auth paths that get strict limits & exponential backoff
AUTH_PATHS = {
    "/api/auth/signup",
    "/api/auth/login",
    "/api/auth/verify-email",
}

class InMemoryRateLimiter:
    def __init__(self):
        # Maps key to dictionary containing:
        # {
        #   "history": [float],       # list of timestamps of attempts
        #   "violations": int,       # consecutive violations counter (for backoff)
        #   "last_attempt": float    # timestamp of the last request attempt
        # }
        self.records: Dict[str, dict] = {}
        self._lock = asyncio.Lock()

    def _prune(self, key: str, window: float, cooldown: float, current_time: float):
        """Prunes old timestamps from history and resets violations if cooldown has passed."""
        if key not in self.records:
            return
        
        record = self.records[key]
        
        # Keep only timestamps within the sliding window
        record["history"] = [t for t in record["history"] if current_time - t <= window]
        
        # Reset consecutive violations if cooldown has passed since the last attempt
        if current_time - record["last_attempt"] > cooldown:
            record["violations"] = 0
            
        # Clean up memory if history is empty and violations are reset
        if not record["history"] and record["violations"] == 0:
            self.records.pop(key, None)

    async def reset_limits(self, ip: str, email: Optional[str] = None):
        """Resets the attempt and violation counters for an IP and/or an account email."""
        async with self._lock:
            ip_key = f"auth_ip:{ip}"
            if ip_key in self.records:
                self.records.pop(ip_key, None)
                logger.info("Reset rate limit records for IP: %s", ip)
            
            if email:
                email_key = f"auth_account:{email}"
                if email_key in self.records:
                    self.records.pop(email_key, None)
                    logger.info("Reset rate limit records for account: [REDACTED]")

    async def check_auth_limit(
        self,
        key: str,
        limit: int,
        window: float,
        base_backoff: float,
        backoff_factor: float,
        max_backoff: float,
        cooldown: float,
        current_time: float
    ) -> Optional[float]:
        """
        Performs rate limiting check on authentication routes with exponential backoff.
        
        Returns the number of seconds the client must wait (retry_after) if blocked,
        or None if the request is allowed.
        """
        async with self._lock:
            if key not in self.records:
                self.records[key] = {
                    "history": [current_time],
                    "violations": 0,
                    "last_attempt": current_time
                }
                return None
                
            record = self.records[key]
            
            # Prune old logs for this key
            self._prune(key, window, cooldown, current_time)
            
            # If the record was deleted during prune, re-initialize it
            if key not in self.records:
                self.records[key] = {
                    "history": [current_time],
                    "violations": 0,
                    "last_attempt": current_time
                }
                return None
                
            record = self.records[key]
            
            violations = record["violations"]
            last_attempt = record["last_attempt"]
            
            # 1. Check if client is currently in backoff period
            backoff_delay = 0.0
            if violations > 0:
                backoff_delay = min(max_backoff, base_backoff * (backoff_factor ** (violations - 1)))
                
            elapsed = current_time - last_attempt
            if violations > 0 and elapsed < backoff_delay:
                # Active backoff violation: penalize by incrementing violations and updating last attempt time
                record["violations"] += 1
                record["last_attempt"] = current_time
                # Return remaining duration from the newly updated backoff delay
                new_backoff_delay = min(max_backoff, base_backoff * (backoff_factor ** (record["violations"] - 1)))
                return new_backoff_delay
                
            # 2. Check if sliding window limit is exceeded
            recent_attempts = len(record["history"])
            if recent_attempts >= limit:
                # New violation: increment violation count, record last attempt, block request
                record["violations"] += 1
                record["last_attempt"] = current_time
                new_backoff_delay = min(max_backoff, base_backoff * (backoff_factor ** (record["violations"] - 1)))
                return new_backoff_delay
                
            # 3. Request allowed
            record["history"].append(current_time)
            record["last_attempt"] = current_time
            return None

    async def check_standard_limit(
        self,
        key: str,
        limit: int,
        window: float,
        current_time: float
    ) -> Optional[float]:
        """
        Performs standard sliding window rate limiting without exponential backoff.
        
        Returns the number of seconds the client must wait (retry_after) if blocked,
        or None if the request is allowed.
        """
        async with self._lock:
            if key not in self.records:
                self.records[key] = {
                    "history": [current_time],
                    "violations": 0,
                    "last_attempt": current_time
                }
                return None
                
            record = self.records[key]
            
            # Prune old logs (cooldown is set to same as window for standard limits)
            self._prune(key, window, window, current_time)
            
            if key not in self.records:
                self.records[key] = {
                    "history": [current_time],
                    "violations": 0,
                    "last_attempt": current_time
                }
                return None
                
            record = self.records[key]
            
            if len(record["history"]) >= limit:
                # Rate limit exceeded. Find time when the oldest request exits the window
                oldest_t = record["history"][0]
                retry_after = max(0.1, window - (current_time - oldest_t))
                return retry_after
                
            record["history"].append(current_time)
            record["last_attempt"] = current_time
            return None


# Global instance of the rate limiter
rate_limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP, trusting X-Forwarded-For only when TRUSTED_PROXY=true is set.
    
    WARNING: X-Forwarded-For is trivially attacker-controlled without a trusted
    reverse proxy. When TRUSTED_PROXY is not set, we fall back to the direct
    connection IP to prevent rate limit bypass via header spoofing.
    """
    trust_proxy = settings.TRUSTED_PROXY if hasattr(settings, "TRUSTED_PROXY") else False
    if trust_proxy:
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            # The leftmost IP is the original client when set by a trusted proxy
            return x_forwarded_for.split(",")[0].strip()
        x_real_ip = request.headers.get("x-real-ip")
        if x_real_ip:
            return x_real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


async def get_request_email(request: Request) -> Optional[str]:
    """Safely extracts email from the request JSON body without consuming the read stream."""
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        return None
    try:
        body = await request.body()
        if not body:
            return None
            
        # Re-set the receive channel so subsequent request parsers (FastAPI router) can read it
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        request._receive = receive
        
        data = json.loads(body)
        if isinstance(data, dict):
            return data.get("email") or data.get("username")
    except Exception as exc:
        logger.debug("Failed to extract email from body: %s", exc)
    return None


def get_user_id_from_token(token: str) -> Optional[str]:
    """Decodes access token to retrieve user ID without database lookups (fast path)."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") == "access":
            return payload.get("sub")
    except Exception:
        pass
    return None


class RateLimitingMiddleware(BaseHTTPMiddleware):
    """FastAPI/Starlette middleware to automatically apply configured rate limits on all endpoints."""
    
    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)
            
        path = request.url.path
        
        # 1. Skip excluded paths
        if path in EXCLUDED_PATHS or any(path.startswith(prefix) for prefix in EXCLUDED_PREFIXES):
            return await call_next(request)
            
        current_time = time.time()
        ip = get_client_ip(request)
        
        # 1.5 Check if it's a password reset route (stricter: 3 per hour)
        is_pwd_reset_route = path in {"/api/auth/forgot-password", "/api/auth/reset-password"}
        if is_pwd_reset_route:
            email = await get_request_email(request)
            
            # A. Check IP-based limit (3 per hour)
            ip_key = f"pwd_reset_ip:{ip}"
            ip_retry = await rate_limiter.check_standard_limit(
                key=ip_key,
                limit=3,
                window=3600,
                current_time=current_time
            )
            if ip_retry is not None:
                logger.warning("Password reset rate limit breached on IP %s. Retry after %ds", ip, int(ip_retry))
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "detail": f"Too many password reset attempts from this IP. Please wait {int(math.ceil(ip_retry))} seconds."
                    },
                    headers={"Retry-After": str(int(math.ceil(ip_retry)))}
                )
                
            # B. Check Account-based limit (3 per hour)
            if email:
                account_key = f"pwd_reset_account:{email}"
                acc_retry = await rate_limiter.check_standard_limit(
                    key=account_key,
                    limit=3,
                    window=3600,
                    current_time=current_time
                )
                if acc_retry is not None:
                    logger.warning("Password reset rate limit breached on account [REDACTED]. Retry after %ds", int(acc_retry))
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "detail": f"Too many password reset attempts for this account. Please wait {int(math.ceil(acc_retry))} seconds."
                        },
                        headers={"Retry-After": str(int(math.ceil(acc_retry)))}
                    )
            
            return await call_next(request)

        # 2. Check if it's an authentication route
        is_auth_route = path in AUTH_PATHS
        
        if is_auth_route:
            # combination of IP and account-based limit with exponential backoff
            email = await get_request_email(request)
            
            # A. Check IP-based auth limit
            ip_key = f"auth_ip:{ip}"
            ip_retry = await rate_limiter.check_auth_limit(
                key=ip_key,
                limit=settings.RATE_LIMIT_AUTH_IP_LIMIT,
                window=settings.RATE_LIMIT_AUTH_IP_WINDOW,
                base_backoff=settings.RATE_LIMIT_AUTH_BACKOFF_BASE,
                backoff_factor=settings.RATE_LIMIT_AUTH_BACKOFF_FACTOR,
                max_backoff=settings.RATE_LIMIT_AUTH_BACKOFF_MAX,
                cooldown=settings.RATE_LIMIT_AUTH_COOLDOWN,
                current_time=current_time
            )
            if ip_retry is not None:
                logger.warning("Auth rate limit breached on IP %s. Retry after %ds", ip, int(ip_retry))
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "detail": f"Too many authentication attempts from this IP. Please wait {int(math.ceil(ip_retry))} seconds."
                    },
                    headers={"Retry-After": str(int(math.ceil(ip_retry)))}
                )
                
            # B. Check Account-based auth limit (if email is provided)
            if email:
                account_key = f"auth_account:{email}"
                acc_retry = await rate_limiter.check_auth_limit(
                    key=account_key,
                    limit=settings.RATE_LIMIT_AUTH_ACCOUNT_LIMIT,
                    window=settings.RATE_LIMIT_AUTH_ACCOUNT_WINDOW,
                    base_backoff=settings.RATE_LIMIT_AUTH_BACKOFF_BASE,
                    backoff_factor=settings.RATE_LIMIT_AUTH_BACKOFF_FACTOR,
                    max_backoff=settings.RATE_LIMIT_AUTH_BACKOFF_MAX,
                    cooldown=settings.RATE_LIMIT_AUTH_COOLDOWN,
                    current_time=current_time
                )
                if acc_retry is not None:
                    logger.warning("Auth rate limit breached on account [REDACTED]. Retry after %ds", int(acc_retry))
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "detail": f"Too many authentication attempts for this account. Please wait {int(math.ceil(acc_retry))} seconds."
                        },
                        headers={"Retry-After": str(int(math.ceil(acc_retry)))}
                    )
                    
            # Request allowed. Proceed and inspect result status to reset if successful
            response = await call_next(request)
            
            # Reset on successful login/signup (2xx status codes)
            if response.status_code < 400 and path in {"/api/auth/login", "/api/auth/signup"}:
                await rate_limiter.reset_limits(ip, email)
                
            return response
            
        else:
            # 3. Moderate limits on public endpoints or looser limits on authenticated user actions
            auth_header = request.headers.get("Authorization")
            user_id = None
            
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                user_id = get_user_id_from_token(token)
                
            if user_id:
                # Looser authenticated user rate limit
                user_key = f"user_action:{user_id}"
                retry_after = await rate_limiter.check_standard_limit(
                    key=user_key,
                    limit=settings.RATE_LIMIT_USER_LIMIT,
                    window=settings.RATE_LIMIT_USER_WINDOW,
                    current_time=current_time
                )
                if retry_after is not None:
                    logger.warning("User action rate limit breached on user_id %s. Retry after %ds", user_id, int(retry_after))
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "detail": f"Rate limit exceeded. Please wait {int(math.ceil(retry_after))} seconds."
                        },
                        headers={"Retry-After": str(int(math.ceil(retry_after)))}
                    )
            else:
                # Moderate public rate limit (IP-based)
                public_key = f"public_action:{ip}"
                retry_after = await rate_limiter.check_standard_limit(
                    key=public_key,
                    limit=settings.RATE_LIMIT_PUBLIC_LIMIT,
                    window=settings.RATE_LIMIT_PUBLIC_WINDOW,
                    current_time=current_time
                )
                if retry_after is not None:
                    logger.warning("Public rate limit breached on IP %s. Retry after %ds", ip, int(retry_after))
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "detail": f"Rate limit exceeded. Please wait {int(math.ceil(retry_after))} seconds."
                        },
                        headers={"Retry-After": str(int(math.ceil(retry_after)))}
                    )
                    
            return await call_next(request)
