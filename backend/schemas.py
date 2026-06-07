from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ParticipantAvatarUpdate(BaseModel):
    avatar_data_url: str | None = Field(default=None, max_length=500_000)


class ParticipantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_data_url: str | None = None
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


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=120)


class LoginResponse(BaseModel):
    user: AppUserRead
    token: str


class AppUserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=120)
    role: str = "viewer"
    is_active: bool = True


class AppUserUpdate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    role: str = "viewer"
    is_active: bool = True
    password: str = ""


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    version: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1, max_length=20_000)


class AnnouncementUpdate(AnnouncementCreate):
    pass


class AnnouncementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    version: str
    content: str
    created_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime


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
    created_by_user_id: int | None = None
    deleted_at: datetime | None = None
    deleted_by_user_id: int | None = None


class RecordDetail(RecordListItem):
    claims: list[ClaimRead]


class RecordListResponse(BaseModel):
    items: list[RecordListItem]
    total: int


class BackupInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


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


class StatsParticipant(BaseModel):
    id: int
    name: str
    avatar_data_url: str | None = None


class ClaimRecordStat(BaseModel):
    participant: StatsParticipant
    sender: StatsParticipant
    amount: str
    record_id: int
    time: datetime


class StreakRecordStat(BaseModel):
    participant: StatsParticipant
    count: int


class CounterpartyRecordStat(BaseModel):
    participant: StatsParticipant
    amount: str


class PersonalRecordStats(BaseModel):
    participant: StatsParticipant
    max_claim: ClaimRecordStat | None
    min_claim: ClaimRecordStat | None
    max_win_streak: int
    max_loss_streak: int
    top_received_from: CounterpartyRecordStat | None
    top_sent_to: CounterpartyRecordStat | None
    top_net_received_from: CounterpartyRecordStat | None
    top_net_sent_to: CounterpartyRecordStat | None


class RecordStatsResponse(BaseModel):
    max_claims: list[ClaimRecordStat]
    min_claims: list[ClaimRecordStat]
    max_win_streaks: list[StreakRecordStat]
    max_loss_streaks: list[StreakRecordStat]
    personal: list[PersonalRecordStats]


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
