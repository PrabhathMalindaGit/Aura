from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ClassifyRequest(BaseModel):
    type: Literal["checkin", "chat"]
    pain: int | None = Field(default=None, ge=0, le=10)
    text: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_checkin_pain(self) -> "ClassifyRequest":
        if self.type == "checkin" and self.pain is None:
            raise ValueError("pain is required when type is 'checkin'")
        return self


class ClassifyResponse(BaseModel):
    risk: Literal["low", "high"]
    reasons: list[str] = Field(default_factory=list)
    ruleVersion: str


class RagReplyRequest(BaseModel):
    patientId: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=2000)
    context: dict | list | None = None


class RagReplyResponse(BaseModel):
    reply: str
    citations: list[str] = Field(default_factory=list)
