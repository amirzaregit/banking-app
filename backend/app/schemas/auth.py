import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=5, max_length=32)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    device_name: str | None = Field(default=None, max_length=100)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str
    phone: str | None
    has_pin: bool  # whether a payment PIN is set (the hash itself never leaves the server)
    created_at: datetime


class SessionResponse(BaseModel):
    id: uuid.UUID
    device_name: str | None
    ip_address: str | None
    created_at: datetime
    last_used_at: datetime
    is_current: bool


class SetPinRequest(BaseModel):
    pin: str = Field(min_length=1, max_length=12)  # format is checked in the service, with friendly messages
    password: str = Field(max_length=128)  # the account password, so a stolen session can't set a PIN


class VerifyPinRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{6}$")
