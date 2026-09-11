"""The persisted profile mirrors the extension's confirmed-facts schema."""

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from .schemas import ID, StrictModel

Text = Annotated[str, Field(max_length=6000)]
OptionalText = Text | None
Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] | None
SmallText = Annotated[str, Field(max_length=120)]


class Fact(StrictModel):
    id: ID
    text: Text


class Basic(StrictModel):
    full_name: OptionalText
    email: Annotated[str, Field(max_length=254)] | None
    phone: Annotated[str, Field(max_length=80)] | None
    city: OptionalText
    job_intention: OptionalText

    @field_validator("email")
    @classmethod
    def email_shape(cls, value):
        import re

        if value and not re.fullmatch(
            r"(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}",
            value,
        ):
            raise ValueError("Invalid email")
        return value


class Dated(StrictModel):
    id: ID
    start_month: Month
    end_month: Month
    is_current: bool

    @model_validator(mode="after")
    def dates_ordered(self):
        if self.start_month and self.end_month and self.start_month > self.end_month:
            raise ValueError("End precedes start")
        return self


class Education(Dated):
    school: OptionalText
    major: OptionalText
    education_level: Literal["associate", "bachelor", "master", "doctor", "other"] | None
    degree: OptionalText
    expected_degree: OptionalText
    completed: bool
    study_mode: Literal["full_time", "part_time", "other"] | None
    is_expected_end: bool

    @model_validator(mode="after")
    def completed_dates(self):
        if self.completed and (self.is_current or self.is_expected_end):
            raise ValueError("Completed education cannot be current or expected")
        return self


class Experience(Dated):
    kind: Literal["internship", "work"]
    organization: OptionalText
    role: OptionalText
    facts: list[Fact] = Field(max_length=50)


class Project(Dated):
    name: OptionalText
    role: OptionalText
    technologies: list[SmallText] = Field(max_length=100)
    facts: list[Fact] = Field(max_length=50)


class Certificate(StrictModel):
    id: ID
    name: OptionalText
    issuer: OptionalText
    obtained_month: Month


class CustomAnswer(StrictModel):
    id: ID
    title: SmallText
    text: Text


class Profile(StrictModel):
    schema_version: Literal["1.0"]
    profile_id: ID
    revision: int = Field(ge=0, le=2147483647)
    basic: Basic
    education: list[Education] = Field(max_length=30)
    experience: list[Experience] = Field(max_length=50)
    projects: list[Project] = Field(max_length=50)
    skills: list[SmallText] = Field(max_length=100)
    certificates: list[Certificate] = Field(max_length=50)
    custom_answers: list[CustomAnswer] = Field(max_length=50)

    @model_validator(mode="after")
    def ids_unique(self):
        ids = [self.profile_id]
        for section in [
            self.education,
            self.experience,
            self.projects,
            self.certificates,
            self.custom_answers,
        ]:
            for record in section:
                ids.append(record.id)
                ids.extend(fact.id for fact in getattr(record, "facts", []))
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate entry identifiers")
        if len(self.model_dump_json().encode()) > 1048576:
            raise ValueError("Profile exceeds size limit")
        return self


def empty_profile(profile_id):
    return Profile(
        schema_version="1.0",
        profile_id=profile_id,
        revision=0,
        basic=Basic(full_name=None, email=None, phone=None, city=None, job_intention=None),
        education=[],
        experience=[],
        projects=[],
        skills=[],
        certificates=[],
        custom_answers=[],
    )
