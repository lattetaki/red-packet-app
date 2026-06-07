from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class AppRole(StrEnum):
    admin = "admin"
    viewer = "viewer"
    contributor = "contributor"


class RecordStatus(StrEnum):
    approved = "approved"
    pending = "pending"
    rejected = "rejected"


class AppUser(Base):
    __tablename__ = "app_users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255), default="")
    role: Mapped[str] = mapped_column(String(24), default=AppRole.viewer.value, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    avatar_data_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sent_records: Mapped[list["RedPacketRecord"]] = relationship(back_populates="sender")
    claims: Mapped[list["RedPacketClaim"]] = relationship(back_populates="participant")


class AmountPreset(Base):
    __tablename__ = "amount_presets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    version: Mapped[str] = mapped_column(String(40), index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RedPacketRecord(Base):
    __tablename__ = "red_packet_records"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    legacy_id: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True, index=True)
    time: Mapped[datetime] = mapped_column(DateTime, index=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("participants.id"), index=True)
    total_amount_cents: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default=RecordStatus.approved.value, index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_users.id"), nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deleted_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("app_users.id"), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sender: Mapped[Participant] = relationship(back_populates="sent_records")
    claims: Mapped[list["RedPacketClaim"]] = relationship(
        back_populates="record",
        cascade="all, delete-orphan",
        order_by="RedPacketClaim.sort_order",
    )


class RedPacketClaim(Base):
    __tablename__ = "red_packet_claims"
    __table_args__ = (UniqueConstraint("record_id", "participant_id", name="uq_claim_record_participant"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    record_id: Mapped[int] = mapped_column(ForeignKey("red_packet_records.id", ondelete="CASCADE"), index=True)
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    record: Mapped[RedPacketRecord] = relationship(back_populates="claims")
    participant: Mapped[Participant] = relationship(back_populates="claims")
