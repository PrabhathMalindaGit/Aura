from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ClassifyReasonCode = Literal["PAIN_GE_THRESHOLD", "CRISIS_LANGUAGE"]


class ClassifyRequest(BaseModel):
    type: Literal["checkin", "chat"]
    pain: int | None = Field(default=None, ge=0, le=10)
    text: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_required_fields(self) -> "ClassifyRequest":
        if self.type == "checkin" and self.pain is None:
            raise ValueError("pain is required when type is 'checkin'")
        if self.type == "chat" and not (self.text and self.text.strip()):
            raise ValueError("text is required when type is 'chat'")
        return self


class ClassifyResponse(BaseModel):
    risk: Literal["low", "high"]
    reasons: list[ClassifyReasonCode] = Field(default_factory=list)
    ruleVersion: Literal["v1"]


class RagReplyRequest(BaseModel):
    patientId: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=2000)
    context: dict | list | None = None


class RagReplyResponse(BaseModel):
    reply: str = Field(min_length=1, max_length=500)
    citations: list[str] = Field(default_factory=list)

    @field_validator("reply")
    @classmethod
    def validate_reply_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("reply must not be blank")
        return value
