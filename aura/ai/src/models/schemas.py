from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ClassifyReasonCode = Literal["PAIN_GE_THRESHOLD", "CRISIS_LANGUAGE"]
MemoryType = Literal["goal", "preference", "barrier", "recent_pattern", "support_need"]
MemorySourceKind = Literal[
    "low_risk_chat",
    "checkin_trend",
    "clinician_seed",
    "system_derived",
]


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


class RagPatientMemoryContextItem(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    memoryType: MemoryType
    summary: str = Field(min_length=1, max_length=240)
    sourceKind: MemorySourceKind
    score: float | None = Field(default=None, ge=0)

    @field_validator("summary")
    @classmethod
    def validate_summary_not_blank(cls, value: str) -> str:
        normalized = " ".join(value.split()).strip()
        if not normalized:
            raise ValueError("summary must not be blank")
        return normalized


class RagReplyContext(BaseModel):
    patientMemory: list[RagPatientMemoryContextItem] = Field(
        default_factory=list,
        max_length=3,
    )


class RagReplyRequest(BaseModel):
    patientId: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=1, max_length=2000)
    context: RagReplyContext | None = None


class StaticRagGroundingSource(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    category: str = Field(min_length=1)
    sourceVersion: str = Field(min_length=1)
    score: float = Field(ge=0)
    type: Literal["static_rehab_knowledge"]


class PatientMemoryGroundingSource(BaseModel):
    id: str = Field(min_length=1)
    memoryType: MemoryType
    sourceKind: MemorySourceKind
    score: float = Field(ge=0)
    type: Literal["patient_memory"]


RagGroundingSource = StaticRagGroundingSource | PatientMemoryGroundingSource


class RagGroundingMetadata(BaseModel):
    fallbackUsed: bool
    sources: list[RagGroundingSource] = Field(default_factory=list)


class RagReplyResponse(BaseModel):
    reply: str = Field(min_length=1, max_length=500)
    citations: list[str] = Field(default_factory=list)
    grounding: RagGroundingMetadata | None = None

    @field_validator("reply")
    @classmethod
    def validate_reply_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("reply must not be blank")
        return value
