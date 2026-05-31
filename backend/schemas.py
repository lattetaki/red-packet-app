from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool


class AmountPresetRead(BaseModel):
    id: int
    amount: str
    is_active: bool


class AppUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    role: str
    is_active: bool


class ClaimCreate(BaseModel):
    participant_id: int
    amount: str


class ClaimRead(BaseModel):
    id: int
    participant_id: int
    participant_name: str
    amount: str


class RecordCreate(BaseModel):
    time: datetime | None = None
    sender_id: int
    total_amount: str = "10"
    note: str = ""
    status: str = "approved"
    claims: list[ClaimCreate] = Field(min_length=1)


class RecordUpdate(RecordCreate):
    pass


class RecordListItem(BaseModel):
    id: int
    legacy_id: str | None
    time: datetime
    sender_id: int
    sender_name: str
    total_amount: str
    claimed_amount: str
    claim_count: int
    note: str
    status: str


class RecordDetail(RecordListItem):
    claims: list[ClaimRead]


class SummaryStats(BaseModel):
    record_count: int
    participant_count: int
    total_sent_amount: str
    total_claimed_amount: str
    pending_count: int


class UserStatsItem(BaseModel):
    participant_id: int
    name: str
    send_count: int
    send_amount: str
    receive_count: int
    receive_amount: str
    average_receive_amount: str
    pnl_amount: str
    send_ratio: str


class TrendPoint(BaseModel):
    record_id: int
    time: datetime
    participant_id: int
    participant_name: str
    pnl_amount: str


class ImportRequest(BaseModel):
    path: str = "../hongbao_data.json"
    reset: bool = False


class ImportReport(BaseModel):
    participants_created: int
    presets_created: int
    records_imported: int
    records_skipped: int
    claims_imported: int
    amount_mismatches: int
    errors: list[str]
