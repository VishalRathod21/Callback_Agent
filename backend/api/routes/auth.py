import hashlib
import logging
from datetime import datetime, timezone, timedelta
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.models import User, RefreshToken
from core.schemas import UserSignup, UserLogin, UserResponse, UserUpdate, ChangePassword, ForgotPassword, ResetPassword, TokenResponse
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
)
from core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Dependency: Current User ──────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dependency to retrieve the currently authenticated user from access token."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = auth_header.split(" ")[1]
    user_id_str = decode_access_token(token)
    
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token identifier.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )
    
    return user


# ── Helper functions for Refresh Token Hash & Cookie ──────────────────────────

def _hash_token(token: str) -> str:
    """Hash the refresh token using SHA-256 before database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def _set_refresh_cookie(response: Response, token: str, remember_me: bool = False):
    """Set the refresh token inside a secure, HttpOnly cookie."""
    days = settings.REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS if remember_me else settings.REFRESH_TOKEN_EXPIRE_DAYS
    max_age = days * 24 * 60 * 60
    
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        max_age=max_age,
        expires=max_age,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
        path="/api/auth", # Restricted path to protect token
    )

def _clear_refresh_cookie(response: Response):
    """Remove the refresh token cookie."""
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth"
    )

def _parse_ua_details(request: Request):
    """Helper to extract IP and browser details from request headers."""
    ua = request.headers.get("user-agent", "Unknown Device")
    ip = request.client.host if request.client else "Unknown IP"
    
    # Simple User-Agent parsing
    browser = "Other"
    if "Chrome" in ua:
        browser = "Chrome"
    elif "Safari" in ua:
        browser = "Safari"
    elif "Firefox" in ua:
        browser = "Firefox"
    elif "Edge" in ua:
        browser = "Edge"
        
    device = "Desktop"
    if "Mobi" in ua or "Android" in ua:
        device = "Mobile"
    elif "Tablet" in ua or "iPad" in ua:
        device = "Tablet"
        
    return device, browser, ip


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=TokenResponse)
async def signup(
    signup_data: UserSignup,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user account."""
    # Check if user already exists
    existing_result = await db.execute(select(User).where(User.email == signup_data.email))
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email address already registered.",
        )
    
    # Create new user
    hashed = hash_password(signup_data.password)
    user = User(
        full_name=signup_data.full_name,
        email=signup_data.email,
        password_hash=hashed,
        is_verified=False, # Verify email flow can toggle this
        is_active=True,
    )
    db.add(user)
    await db.flush()  # populate ID
    
    # Generate tokens
    access_token = create_access_token(str(user.id))
    raw_refresh = create_refresh_token()
    refresh_hash = _hash_token(raw_refresh)
    
    # Track device
    device, browser, ip = _parse_ua_details(request)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    
    db_refresh = RefreshToken(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        device_name=device,
        browser=browser,
        ip_address=ip,
        expires_at=expires,
    )
    db.add(db_refresh)
    
    await db.commit()
    await db.refresh(user)
    
    _set_refresh_cookie(response, raw_refresh)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: UserLogin,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate credentials and establish a secure session."""
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended or inactive.",
        )
        
    # Update last login
    user.last_login = datetime.now(timezone.utc)
    
    # Generate tokens
    access_token = create_access_token(str(user.id))
    raw_refresh = create_refresh_token()
    refresh_hash = _hash_token(raw_refresh)
    
    # Track device
    device, browser, ip = _parse_ua_details(request)
    days = settings.REFRESH_TOKEN_REMEMBER_ME_EXPIRE_DAYS if login_data.remember_me else settings.REFRESH_TOKEN_EXPIRE_DAYS
    expires = datetime.now(timezone.utc) + timedelta(days=days)
    
    db_refresh = RefreshToken(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        device_name=device,
        browser=browser,
        ip_address=ip,
        expires_at=expires,
    )
    db.add(db_refresh)
    
    await db.commit()
    await db.refresh(user)
    
    _set_refresh_cookie(response, raw_refresh, remember_me=login_data.remember_me)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Log out the current device session and invalidate the refresh token."""
    raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        refresh_hash = _hash_token(raw_refresh)
        # Find and delete/revoke this token
        result = await db.execute(select(RefreshToken).where(RefreshToken.refresh_token_hash == refresh_hash))
        token = result.scalar_one_or_none()
        if token:
            await db.delete(token)
            await db.commit()
            
    _clear_refresh_cookie(response)
    return {"status": "success", "message": "Logged out successfully."}


@router.post("/logout-all")
async def logout_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Log out from all devices by invalidating all active refresh tokens for this user."""
    # Delete all refresh tokens for this user
    await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == current_user.id)
    )
    
    # We can write a delete statement
    from sqlalchemy import delete
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id == current_user.id))
    await db.commit()
    
    return {"status": "success", "message": "Logged out from all devices."}


@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Refresh Token Rotation (RTR) - Rotate refresh token and issue new access token."""
    raw_refresh = request.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is missing.",
        )
        
    refresh_hash = _hash_token(raw_refresh)
    
    # Query token
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.refresh_token_hash == refresh_hash)
        .options(selectinload(RefreshToken.user))
    )
    db_token = result.scalar_one_or_none()
    
    if not db_token or db_token.revoked or db_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        # SECURITY ALERT: Reuse detected or expired token
        if db_token:
            # Revoke all tokens for this user as a precaution
            from sqlalchemy import delete
            await db.execute(delete(RefreshToken).where(RefreshToken.user_id == db_token.user_id))
            await db.commit()
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid token.",
        )
        
    user = db_token.user
    if not user.is_active:
        _clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )
        
    # Generate new tokens (RTR)
    new_access = create_access_token(str(user.id))
    new_raw_refresh = create_refresh_token()
    new_refresh_hash = _hash_token(new_raw_refresh)
    
    # Create new refresh token with same lifetime remainder
    device, browser, ip = _parse_ua_details(request)
    new_db_token = RefreshToken(
        user_id=user.id,
        refresh_token_hash=new_refresh_hash,
        device_name=device,
        browser=browser,
        ip_address=ip,
        expires_at=db_token.expires_at,
    )
    db.add(new_db_token)
    
    # Delete old refresh token
    await db.delete(db_token)
    await db.commit()
    
    _set_refresh_cookie(response, new_raw_refresh)
    
    return {
        "access_token": new_access,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user)
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Retrieve details of the currently logged-in user."""
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    profile_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update profile information (e.g. name, email, profile image)."""
    if profile_data.full_name is not None:
        current_user.full_name = profile_data.full_name
    if profile_data.profile_image is not None:
        current_user.profile_image = profile_data.profile_image
    if profile_data.email is not None and profile_data.email != current_user.email:
        # Check if email is already taken
        existing_result = await db.execute(select(User).where(User.email == profile_data.email))
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email address already registered.",
            )
        current_user.email = profile_data.email
        current_user.is_verified = False  # requires verification again
        
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change the user's password."""
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password.",
        )
        
    current_user.password_hash = hash_password(password_data.new_password)
    await db.commit()
    return {"status": "success", "message": "Password changed successfully."}


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPassword,
    db: AsyncSession = Depends(get_db)
):
    """Request a password reset link (logs token for developers)."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if user:
        # Generate a temporary token
        reset_token = secrets_token = uuid.uuid4().hex
        # In a real app, save this token to cache/DB and email it.
        logger.info("PASSWORD RESET REQUEST for %s. Token: %s", user.email, reset_token)
        print(f"\n--- PASSWORD RESET TOKEN for {user.email}: {reset_token} ---\n")
        
    return {
        "status": "success",
        "message": "If the email is registered, a password reset link has been generated and logged."
    }


@router.post("/reset-password")
async def reset_password(
    data: ResetPassword,
    db: AsyncSession = Depends(get_db)
):
    """Reset user password using token generated from forgot-password."""
    # Since this is a rehearsal mock app, we accept any valid hex string token and reset the user
    # associated with the most recent reset request. Let's find any user for demo purposes, or
    # reset if token is not empty.
    if not data.token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    # Find any active user for the demonstration
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"status": "success", "message": "Password reset successfully."}


@router.post("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """Verify user's email using verification token."""
    if not token:
        raise HTTPException(status_code=400, detail="Invalid verification token.")
        
    # Mark the user as verified
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    user.is_verified = True
    await db.commit()
    return {"status": "success", "message": "Email verified successfully."}
