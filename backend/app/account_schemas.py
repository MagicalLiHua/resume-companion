from typing import Annotated, Literal

from pydantic import Field, field_validator

from .profile_schema import Profile
from .schemas import StrictModel

Username = Annotated[str, Field(pattern=r"^[a-z][a-z0-9_.-]{2,31}$")]
Password = Annotated[str, Field(min_length=12, max_length=128)]
Name = Annotated[str, Field(min_length=1, max_length=80)]
Secret = Annotated[str, Field(min_length=32, max_length=100)]


class Login(StrictModel):
    username: Username
    password: Password


class Register(Login):
    pass


class ChangePassword(StrictModel):
    current_password: Password
    new_password: Password


class Recover(StrictModel):
    username: Username
    recovery_code: Secret
    new_password: Password


class InvitationCreate(StrictModel):
    label: Name
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_in_days: int = Field(default=7, ge=1, le=90)


class Enabled(StrictModel):
    enabled: bool


class UserUpdate(StrictModel):
    enabled: bool
    requests_per_minute: int = Field(ge=1, le=600)
    daily_requests: int = Field(ge=1, le=100000)


class KeyCreate(StrictModel):
    name: Name
    scopes: list[Literal["resumes:read", "model:use"]] = Field(
        default=["resumes:read", "model:use"], min_length=1, max_length=2
    )
    expires_in_days: int = Field(default=90, ge=1, le=365)

    @field_validator("scopes")
    @classmethod
    def scopes_unique(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Repeated scope")
        return value


class ResumeCreate(StrictModel):
    name: Name
    profile: Profile | None = None


class Revision(StrictModel):
    expected_revision: int = Field(ge=1, le=2147483647)


class ResumeUpdate(Revision):
    name: Name
    profile: Profile


class VersionRestore(Revision):
    revision: int = Field(ge=1, le=2147483647)
