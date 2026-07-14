import re
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class UserSignup(BaseModel):
    email: EmailStr = Field(..., max_length=150)
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    password_confirm: str = Field(...)

    @model_validator(mode="after")
    def passwords_match(self) -> "UserSignup":
        if self.password != self.password_confirm:
            raise ValueError("passwords do not match")
        return self

    @field_validator("full_name")
    @classmethod
    def validate_name_format(cls, v: str) -> str:
        if v != v.strip():
            raise ValueError("Full name cannot have leading or trailing spaces.")
        # Only allow letters, spaces, hyphens, and apostrophes.
        if not re.match(r"^[A-Za-z]+([ '-][A-Za-z]+)*$", v):
            raise ValueError("Full name contains invalid characters. Only letters, spaces, hyphens, and apostrophes are allowed.")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        return v


class UserLogin(BaseModel):
    email: EmailStr = Field(..., max_length=150)
    password: str = Field(..., min_length=8, max_length=128)
    remember_me: bool = False


class UserResponse(BaseModel):
    id: UUID
    full_name: str
    email: str
    profile_image: Optional[str] = None
    is_verified: bool
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    email: Optional[EmailStr] = Field(None, max_length=150)
    profile_image: Optional[str] = Field(None, max_length=2048)

    @field_validator("full_name")
    @classmethod
    def validate_name_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v != v.strip():
            raise ValueError("Full name cannot have leading or trailing spaces.")
        if not re.match(r"^[A-Za-z]+([ '-][A-Za-z]+)*$", v):
            raise ValueError("Full name contains invalid characters. Only letters, spaces, hyphens, and apostrophes are allowed.")
        return v

    @field_validator("profile_image")
    @classmethod
    def validate_profile_image_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not (v.startswith("http://") or v.startswith("https://") or v.startswith("/uploads/")):
            raise ValueError("Profile image must be a valid URL starting with http/https or a path starting with /uploads/.")
        return v


class ChangePassword(BaseModel):
    old_password: str = Field(..., min_length=8, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    new_password_confirm: str = Field(...)

    @model_validator(mode="after")
    def passwords_match(self) -> "ChangePassword":
        if self.new_password != self.new_password_confirm:
            raise ValueError("new passwords do not match")
        return self

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        return v


class ForgotPassword(BaseModel):
    email: EmailStr = Field(..., max_length=150)


class ResetPassword(BaseModel):
    token: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    new_password_confirm: str = Field(...)

    @model_validator(mode="after")
    def passwords_match(self) -> "ResetPassword":
        if self.new_password != self.new_password_confirm:
            raise ValueError("new passwords do not match")
        return self

    @field_validator("token")
    @classmethod
    def validate_token_format(cls, v: str) -> str:
        if not re.match(r"^[a-zA-Z0-9_-]+$", v):
            raise ValueError("Token must be a valid alphanumeric string.")
        return v

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit.")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

