import hashlib
import logging
import re
import secrets
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
    """Dependency to retrieve the currently authenticated user from access token or query param."""
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        # Fallback to query parameter token (used by file downloads / window.open)
        token = request.query_params.get("token")
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
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
        secure=not ("sqlite" in settings.DATABASE_URL or "localhost" in settings.DATABASE_URL or "127.0.0.1" in settings.DATABASE_URL),
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
    verification_token = secrets.token_urlsafe(32)
    verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    user = User(
        full_name=signup_data.full_name,
        email=signup_data.email,
        password_hash=hashed,
        is_verified=False, # Verify email flow can toggle this
        is_active=True,
        verification_token=verification_token,
        verification_token_expires_at=verification_token_expires_at,
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


@router.delete("/me")
async def delete_account(
    response: Response,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete the user's account, personal data, resume files, and vector embeddings."""
    import shutil
    from pathlib import Path
    from core.models import Candidate

    # 1. Fetch all candidate records for this user (to clean up filesystem and FAISS)
    result = await db.execute(select(Candidate).where(Candidate.user_id == current_user.id))
    candidates = result.scalars().all()

    # 2. Cleanup associated filesystem uploads and FAISS embeddings
    faiss_service = request.app.state.faiss
    for candidate in candidates:
        candidate_id_str = str(candidate.id)
        # Delete from FAISS
        await faiss_service.delete(collection="resumes", doc_id=candidate_id_str)
        # Delete from filesystem
        upload_dir = Path(settings.UPLOAD_DIR) / candidate_id_str
        if upload_dir.exists() and upload_dir.is_dir():
            try:
                shutil.rmtree(upload_dir)
                logger.info("Deleted candidate uploads directory for candidate_id: %s", candidate_id_str)
            except Exception as exc:
                logger.error("Failed to delete candidate uploads directory %s: %s", upload_dir, exc)

    # 3. Delete the user (cascades to Candidate, Session, RoundTranscript, RefreshToken)
    await db.delete(current_user)
    await db.commit()

    # 4. Clear the cookies
    _clear_refresh_cookie(response)

    return {"status": "success", "message": "Your account and all associated personal data have been permanently deleted."}


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
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.commit()
        logger.info("PASSWORD RESET REQUEST initiated for user_id: %s", user.id)
        
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
    if not data.token or len(data.token) > 128 or not re.match(r"^[a-zA-Z0-9_-]+$", data.token):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    result = await db.execute(select(User).where(User.reset_token == data.token))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    if user.reset_token_expires_at is None or user.reset_token_expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        user.reset_token = None
        user.reset_token_expires_at = None
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    await db.commit()
    return {"status": "success", "message": "Password reset successfully."}


@router.post("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    """Verify user's email using verification token."""
    if not token or len(token) > 128 or not re.match(r"^[a-zA-Z0-9_-]+$", token):
        raise HTTPException(status_code=400, detail="Invalid verification token format.")
        
    result = await db.execute(select(User).where(User.verification_token == token))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token.")
        
    if user.verification_token_expires_at is None or user.verification_token_expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired verification token.")
        
    user.is_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    await db.commit()
    return {"status": "success", "message": "Email verified successfully."}
