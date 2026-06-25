from contextlib import asynccontextmanager
from datetime import datetime
import gzip
import logging
import os
from pathlib import Path
import shutil
import sqlite3

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from auth import create_access_token, get_current_user, hash_password, require_admin, verify_password
from database import SessionLocal, create_db_and_tables, database_path, get_db
from models import (
    AmountPreset,
    Announcement,
    AppRole,
    AppSetting,
    AppUser,
    Participant,
    PopupNotice,
    PopupNoticeRecipient,
    RecordStatus,
    RedPacketClaim,
    RedPacketRecord,
)
from money import cents_to_amount
from schemas import (
    AmountPresetRead,
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementUpdate,
    AppUserCreate,
    AppUserRead,
    AppUserUpdate,
    BackupInfo,
    ImportReport,
    ImportRequest,
    LoginRequest,
    LoginResponse,
    PasswordChange,
    ParticipantAvatarUpdate,
    ParticipantCreate,
    ParticipantRead,
    PinnedNoticeRead,
    PinnedNoticeUpdate,
    PopupNoticeAck,
    PopupNoticeCreate,
    PopupNoticeCurrent,
    PopupNoticeRead,
    PopupNoticeUpdate,
    RecordCreate,
    RecordDetail,
    RecordListResponse,
    RecordUpdate,
    RecordListItem,
    RecordStatsResponse,
    SummaryStats,
    TrendPoint,
    UserStatsItem,
)
from services import (
    authenticate_app_user,
    build_summary,
    build_trends,
    build_user_stats,
    build_record_stats,
    create_record,
    active_records_query,
    deleted_records_query,
    ensure_app_user_setup,
    ensure_participant_setup,
    ensure_popup_notice_columns,
    ensure_record_soft_delete_columns,
    get_record_query,
    import_json_data,
    serialize_app_user,
    serialize_record_detail,
    serialize_record_list_item,
    update_record,
)


VALID_APP_ROLES = {"admin", "viewer", "contributor"}
PINNED_NOTICE_KEY = "pinned_notice"
PASSWORD_PATTERN = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~")
logger = logging.getLogger("red_packet")
logging.basicConfig(level=logging.INFO)
default_backup_dir = database_path.parent / "backups" if os.name == "nt" else Path("/home/ubuntu/red-packet-backups")
backup_dir = Path(os.getenv("RED_PACKET_BACKUP_DIR", default_backup_dir)).expanduser()


def get_backup_file(filename: str) -> Path:
    if "/" in filename or "\\" in filename or not filename.endswith(".db.gz"):
        raise HTTPException(status_code=404, detail="Backup not found")
    path = backup_dir / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Backup not found")
    return path


def serialize_backup(path: Path) -> dict:
    stat = path.stat()
    return {
        "filename": path.name,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime),
    }


def validate_password_value(password: str) -> None:
    if not 6 <= len(password) <= 20:
        raise HTTPException(status_code=400, detail="Password must be 6 to 20 characters")
    if any(char not in PASSWORD_PATTERN for char in password):
        raise HTTPException(status_code=400, detail="Password only supports ASCII letters, numbers and common symbols")


def assert_participant_available(db: Session, participant_id: int | None, user_id: int | None = None) -> None:
    if participant_id is None:
        return
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    linked_user = db.scalar(select(AppUser).where(AppUser.participant_id == participant_id, AppUser.id != user_id))
    if linked_user is not None:
        raise HTTPException(status_code=409, detail="Participant is already linked to another user")


def serialize_popup_notice(notice: PopupNotice) -> dict:
    return {
        "id": notice.id,
        "title": notice.title,
        "content": notice.content,
        "is_active": notice.is_active,
        "created_by_user_id": notice.created_by_user_id,
        "created_at": notice.created_at,
        "updated_at": notice.updated_at,
        "recipients": [
            {
                "user_id": recipient.user_id,
                "username": recipient.user.username,
                "display_name": recipient.user.display_name,
                "seen_at": recipient.seen_at,
                "dismissed_at": recipient.dismissed_at,
            }
            for recipient in notice.recipients
        ],
    }


def validate_popup_recipients(db: Session, recipient_user_ids: list[int]) -> list[AppUser]:
    unique_ids = list(dict.fromkeys(recipient_user_ids))
    users = db.scalars(select(AppUser).where(AppUser.id.in_(unique_ids), AppUser.is_active.is_(True))).all()
    if len(users) != len(unique_ids):
        raise HTTPException(status_code=400, detail="Recipient user does not exist or is inactive")
    return users


def create_database_backup() -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    temp_path = backup_dir / f"hongbao-{timestamp}.db"
    backup_path = backup_dir / f"hongbao-{timestamp}.db.gz"

    source = sqlite3.connect(str(database_path))
    try:
        target = sqlite3.connect(str(temp_path))
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()

    with temp_path.open("rb") as raw, gzip.open(backup_path, "wb") as compressed:
        shutil.copyfileobj(raw, compressed)
    temp_path.unlink(missing_ok=True)
    return backup_path


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
    with SessionLocal() as db:
        ensure_record_soft_delete_columns(db)
        ensure_popup_notice_columns(db)
        ensure_participant_setup(db)
        ensure_app_user_setup(db)
    yield


app = FastAPI(title="Red Packet API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "backend running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_app_user(db, payload.username, payload.password)
    if user is None:
        logger.warning("login failed username=%s", payload.username)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    logger.info("login success user_id=%s username=%s role=%s", user.id, user.username, user.role)
    return {"user": serialize_app_user(user), "token": create_access_token(user)}


@app.get("/me", response_model=AppUserRead)
def get_me(current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.scalars(select(AppUser).where(AppUser.id == current_user.id).options(selectinload(AppUser.participant))).one()
    return serialize_app_user(user)


@app.put("/me/password", response_model=AppUserRead)
def change_my_password(payload: PasswordChange, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    validate_password_value(payload.new_password)
    user = db.scalars(select(AppUser).where(AppUser.id == current_user.id).options(selectinload(AppUser.participant))).one()
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    logger.info("password changed user_id=%s", user.id)
    return serialize_app_user(user)


@app.put("/me/avatar", response_model=AppUserRead)
def update_my_avatar(payload: ParticipantAvatarUpdate, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.scalars(select(AppUser).where(AppUser.id == current_user.id).options(selectinload(AppUser.participant))).one()
    if user.participant is None:
        raise HTTPException(status_code=400, detail="Current user is not linked to a participant")

    avatar = payload.avatar_data_url
    if avatar and not avatar.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Avatar must be an image data URL")

    user.participant.avatar_data_url = avatar
    db.commit()
    db.refresh(user)
    logger.info("self avatar updated user_id=%s participant_id=%s has_avatar=%s", user.id, user.participant_id, bool(avatar))
    return serialize_app_user(user)


@app.get("/participants", response_model=list[ParticipantRead])
def list_participants(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Participant).order_by(Participant.name)).all()


@app.post("/participants", response_model=ParticipantRead)
def create_participant(payload: ParticipantCreate, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    name = payload.name.strip()
    participant = Participant(name=name)
    db.add(participant)
    try:
        db.flush()
        existing_user = db.scalar(select(AppUser).where(AppUser.username == name))
        if existing_user is None:
            db.add(
                AppUser(
                    username=name,
                    display_name=name,
                    participant_id=participant.id,
                    password_hash=hash_password("123456"),
                    role=AppRole.viewer.value,
                    is_active=True,
                )
            )
        elif existing_user.participant_id is None:
            existing_user.participant_id = participant.id
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Participant already exists") from exc
    db.refresh(participant)
    logger.info("participant created id=%s name=%s", participant.id, participant.name)
    return participant


@app.put("/participants/{participant_id}/avatar", response_model=ParticipantRead)
def update_participant_avatar(
    participant_id: int,
    payload: ParticipantAvatarUpdate,
    current_user: AppUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")

    avatar = payload.avatar_data_url
    if avatar and not avatar.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Avatar must be an image data URL")

    participant.avatar_data_url = avatar
    db.commit()
    db.refresh(participant)
    logger.info("participant avatar updated id=%s user_id=%s has_avatar=%s", participant_id, current_user.id, bool(avatar))
    return participant


@app.get("/admin/app-users", response_model=list[AppUserRead])
def list_app_users(_: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(select(AppUser).options(selectinload(AppUser.participant)).order_by(AppUser.role, AppUser.username)).all()
    return [serialize_app_user(user) for user in users]


@app.post("/admin/app-users", response_model=AppUserRead)
def create_app_user(payload: AppUserCreate, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    validate_password_value(payload.password)
    assert_participant_available(db, payload.participant_id)

    user = AppUser(
        username=payload.username.strip(),
        display_name=payload.display_name.strip(),
        participant_id=payload.participant_id,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from exc
    db.refresh(user)
    logger.info("app user created id=%s username=%s role=%s", user.id, user.username, user.role)
    user = db.scalars(select(AppUser).where(AppUser.id == user.id).options(selectinload(AppUser.participant))).one()
    return serialize_app_user(user)


@app.put("/admin/app-users/{user_id}", response_model=AppUserRead)
def update_app_user(user_id: int, payload: AppUserUpdate, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    assert_participant_available(db, payload.participant_id, user_id=user.id)
    if user.id == current_user.id and (payload.role != AppRole.admin.value or not payload.is_active):
        raise HTTPException(status_code=400, detail="Cannot remove your own admin access")

    if user.role == AppRole.admin.value and (payload.role != AppRole.admin.value or not payload.is_active):
        active_admin_count = db.scalar(
            select(func.count()).select_from(AppUser).where(AppUser.role == AppRole.admin.value, AppUser.is_active.is_(True))
        )
        if active_admin_count is not None and active_admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    user.display_name = payload.display_name.strip()
    user.participant_id = payload.participant_id
    user.role = payload.role
    user.is_active = payload.is_active
    if payload.password:
        validate_password_value(payload.password)
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    logger.info("app user updated id=%s username=%s role=%s active=%s", user.id, user.username, user.role, user.is_active)
    user = db.scalars(select(AppUser).where(AppUser.id == user.id).options(selectinload(AppUser.participant))).one()
    return serialize_app_user(user)


@app.get("/amount-presets", response_model=list[AmountPresetRead])
def list_amount_presets(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    presets = db.scalars(select(AmountPreset).where(AmountPreset.is_active.is_(True)).order_by(AmountPreset.amount_cents)).all()
    return [
        {"id": preset.id, "amount": cents_to_amount(preset.amount_cents), "is_active": preset.is_active}
        for preset in presets
    ]


@app.get("/announcements", response_model=list[AnnouncementRead])
def list_announcements(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Announcement).order_by(Announcement.created_at.desc(), Announcement.id.desc())).all()


@app.get("/pinned-notice", response_model=PinnedNoticeRead)
def get_pinned_notice(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    setting = db.get(AppSetting, PINNED_NOTICE_KEY)
    return {
        "content": setting.value if setting else "",
        "updated_at": setting.updated_at if setting else None,
    }


@app.put("/admin/pinned-notice", response_model=PinnedNoticeRead)
def update_pinned_notice(payload: PinnedNoticeUpdate, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    setting = db.get(AppSetting, PINNED_NOTICE_KEY)
    if setting is None:
        setting = AppSetting(key=PINNED_NOTICE_KEY, value="")
        db.add(setting)

    setting.value = payload.content.strip()
    setting.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(setting)
    logger.info("pinned notice updated user_id=%s has_content=%s", current_user.id, bool(setting.value))
    return {"content": setting.value, "updated_at": setting.updated_at}


@app.get("/popup-notices/current", response_model=PopupNoticeCurrent | None)
def get_current_popup_notice(current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    recipient = db.scalars(
        select(PopupNoticeRecipient)
        .join(PopupNotice)
        .where(
            PopupNoticeRecipient.user_id == current_user.id,
            PopupNoticeRecipient.dismissed_at.is_(None),
            PopupNotice.is_active.is_(True),
        )
        .options(selectinload(PopupNoticeRecipient.notice))
        .order_by(PopupNotice.created_at.desc(), PopupNotice.id.desc())
    ).first()
    if recipient is None:
        return None

    notice = recipient.notice
    return {
        "id": notice.id,
        "title": notice.title,
        "content": notice.content,
        "created_at": notice.created_at,
    }


@app.post("/popup-notices/{notice_id}/ack")
def ack_popup_notice(
    notice_id: int,
    payload: PopupNoticeAck,
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipient = db.scalar(
        select(PopupNoticeRecipient).where(PopupNoticeRecipient.notice_id == notice_id, PopupNoticeRecipient.user_id == current_user.id)
    )
    if recipient is None:
        raise HTTPException(status_code=404, detail="Popup notice not found")

    now = datetime.utcnow()
    recipient.seen_at = recipient.seen_at or now
    if payload.dismiss:
        recipient.dismissed_at = now
    db.commit()
    logger.info("popup notice ack notice_id=%s user_id=%s dismiss=%s", notice_id, current_user.id, payload.dismiss)
    return {"ok": True}


@app.get("/admin/popup-notices", response_model=list[PopupNoticeRead])
def list_popup_notices(_: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    notices = db.scalars(
        select(PopupNotice)
        .options(selectinload(PopupNotice.recipients).selectinload(PopupNoticeRecipient.user))
        .order_by(PopupNotice.created_at.desc(), PopupNotice.id.desc())
    ).all()
    return [serialize_popup_notice(notice) for notice in notices]


@app.post("/admin/popup-notices", response_model=PopupNoticeRead)
def create_popup_notice(payload: PopupNoticeCreate, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    users = validate_popup_recipients(db, payload.recipient_user_ids)
    notice = PopupNotice(
        title=payload.title.strip(),
        content=payload.content.strip(),
        is_active=payload.is_active,
        created_by_user_id=current_user.id,
    )
    db.add(notice)
    db.flush()
    for user in users:
        db.add(PopupNoticeRecipient(notice_id=notice.id, user_id=user.id))
    db.commit()
    notice = db.scalars(
        select(PopupNotice)
        .where(PopupNotice.id == notice.id)
        .options(selectinload(PopupNotice.recipients).selectinload(PopupNoticeRecipient.user))
    ).one()
    logger.info("popup notice created id=%s user_id=%s recipients=%s", notice.id, current_user.id, len(users))
    return serialize_popup_notice(notice)


@app.put("/admin/popup-notices/{notice_id}", response_model=PopupNoticeRead)
def update_popup_notice(
    notice_id: int,
    payload: PopupNoticeUpdate,
    current_user: AppUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = validate_popup_recipients(db, payload.recipient_user_ids)
    notice = db.scalars(
        select(PopupNotice)
        .where(PopupNotice.id == notice_id)
        .options(selectinload(PopupNotice.recipients).selectinload(PopupNoticeRecipient.user))
    ).first()
    if notice is None:
        raise HTTPException(status_code=404, detail="Popup notice not found")

    notice.title = payload.title.strip()
    notice.content = payload.content.strip()
    notice.is_active = payload.is_active
    notice.updated_at = datetime.utcnow()
    notice.recipients.clear()
    db.flush()
    for user in users:
        notice.recipients.append(PopupNoticeRecipient(user_id=user.id))
    db.commit()
    notice = db.scalars(
        select(PopupNotice)
        .where(PopupNotice.id == notice_id)
        .options(selectinload(PopupNotice.recipients).selectinload(PopupNoticeRecipient.user))
    ).one()
    logger.info("popup notice updated id=%s user_id=%s recipients=%s", notice.id, current_user.id, len(users))
    return serialize_popup_notice(notice)


@app.post("/admin/announcements", response_model=AnnouncementRead)
def create_announcement(payload: AnnouncementCreate, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    announcement = Announcement(
        title=payload.title.strip(),
        version=payload.version.strip(),
        content=payload.content.strip(),
        created_by_user_id=current_user.id,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    logger.info("announcement created id=%s user_id=%s version=%s", announcement.id, current_user.id, announcement.version)
    return announcement


@app.put("/admin/announcements/{announcement_id}", response_model=AnnouncementRead)
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    current_user: AppUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    announcement = db.get(Announcement, announcement_id)
    if announcement is None:
        raise HTTPException(status_code=404, detail="Announcement not found")

    announcement.title = payload.title.strip()
    announcement.version = payload.version.strip()
    announcement.content = payload.content.strip()
    announcement.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(announcement)
    logger.info("announcement updated id=%s user_id=%s version=%s", announcement.id, current_user.id, announcement.version)
    return announcement


@app.get("/records", response_model=RecordListResponse)
def list_records(
    status: str | None = Query(default=None),
    sender_id: int | None = Query(default=None),
    receiver_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = active_records_query()
    if current_user.role != "admin":
        query = query.where(RedPacketRecord.status == RecordStatus.approved.value)
    elif status:
        query = query.where(RedPacketRecord.status == status)
    if sender_id:
        query = query.where(RedPacketRecord.sender_id == sender_id)
    if receiver_id:
        query = query.where(RedPacketRecord.claims.any(RedPacketClaim.participant_id == receiver_id))
    if date_from:
        query = query.where(RedPacketRecord.time >= date_from)
    if date_to:
        query = query.where(RedPacketRecord.time <= date_to)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.join(RedPacketRecord.sender).where(
            or_(RedPacketRecord.note.ilike(pattern), Participant.name.ilike(pattern), RedPacketRecord.legacy_id.ilike(pattern))
        )
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    records = db.scalars(query.offset(offset).limit(limit)).all()
    return {"items": [serialize_record_list_item(record) for record in records], "total": total}


@app.get("/records/my", response_model=RecordListResponse)
def list_my_records(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=30, ge=1, le=100),
    current_user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = active_records_query().where(RedPacketRecord.created_by_user_id == current_user.id)
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    records = db.scalars(query.offset(offset).limit(limit)).all()
    return {"items": [serialize_record_list_item(record) for record in records], "total": total}


@app.post("/records", response_model=RecordDetail)
def add_record(payload: RecordCreate, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role != "admin":
        payload.status = RecordStatus.pending.value
    try:
        record = create_record(db, payload, created_by_user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    record = db.scalars(get_record_query().where(RedPacketRecord.id == record.id)).one()
    logger.info("record created id=%s user_id=%s status=%s", record.id, current_user.id, record.status)
    return serialize_record_detail(record)


@app.get("/records/{record_id}", response_model=RecordDetail)
def get_record(record_id: int, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if current_user.role != "admin" and record.status != RecordStatus.approved.value and record.created_by_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Record not found")
    return serialize_record_detail(record)


@app.put("/records/{record_id}", response_model=RecordDetail)
def put_record(record_id: int, payload: RecordUpdate, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        updated = update_record(db, record, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated = db.scalars(get_record_query().where(RedPacketRecord.id == updated.id)).one()
    logger.info("record updated id=%s", updated.id)
    return serialize_record_detail(updated)


@app.delete("/records/{record_id}")
def delete_record(record_id: int, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.get(RedPacketRecord, record_id)
    if record is None or record.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = datetime.utcnow()
    record.deleted_by_user_id = current_user.id
    db.commit()
    logger.info("record soft deleted id=%s user_id=%s", record_id, current_user.id)
    return {"deleted": True}


@app.get("/admin/deleted-records", response_model=RecordListResponse)
def list_deleted_records(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    _: AppUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = deleted_records_query()
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    records = db.scalars(query.offset(offset).limit(limit)).all()
    return {"items": [serialize_record_list_item(record) for record in records], "total": total}


@app.post("/admin/deleted-records/{record_id}/restore", response_model=RecordDetail)
def restore_deleted_record(record_id: int, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(deleted_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = None
    record.deleted_by_user_id = None
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    logger.info("record restored id=%s user_id=%s", record_id, current_user.id)
    return serialize_record_detail(record)


@app.get("/admin/backups", response_model=list[BackupInfo])
def list_backups(_: AppUser = Depends(require_admin)):
    backup_dir.mkdir(parents=True, exist_ok=True)
    backups = sorted(backup_dir.glob("hongbao-*.db.gz"), key=lambda path: path.stat().st_mtime, reverse=True)
    return [serialize_backup(path) for path in backups]


@app.post("/admin/backups", response_model=BackupInfo)
def create_backup(current_user: AppUser = Depends(require_admin)):
    path = create_database_backup()
    logger.info("backup created filename=%s user_id=%s", path.name, current_user.id)
    return serialize_backup(path)


@app.get("/admin/backups/{filename}")
def download_backup(filename: str, _: AppUser = Depends(require_admin)):
    path = get_backup_file(filename)
    return FileResponse(path, media_type="application/gzip", filename=path.name)


@app.post("/admin/review-records/{record_id}/approve", response_model=RecordDetail)
def approve_record(record_id: int, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.status = RecordStatus.approved.value
    record.approved_by_user_id = current_user.id
    record.approved_at = datetime.utcnow()
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    logger.info("record approved id=%s user_id=%s", record_id, current_user.id)
    return serialize_record_detail(record)


@app.post("/admin/review-records/{record_id}/reject", response_model=RecordDetail)
def reject_record(record_id: int, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.status = RecordStatus.rejected.value
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    logger.info("record rejected id=%s", record_id)
    return serialize_record_detail(record)


@app.get("/stats/summary", response_model=SummaryStats)
def stats_summary(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_summary(db, date_from=date_from, date_to=date_to)


@app.get("/stats/users", response_model=list[UserStatsItem])
def stats_users(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_user_stats(db, date_from=date_from, date_to=date_to)


@app.get("/stats/trends", response_model=list[TrendPoint])
def stats_trends(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_trends(db, date_from=date_from, date_to=date_to)


@app.get("/stats/records", response_model=RecordStatsResponse)
def stats_records(
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_record_stats(db, date_from=date_from, date_to=date_to)


@app.post("/admin/import-json", response_model=ImportReport)
def import_json(payload: ImportRequest, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    source_path = Path(payload.path)
    if not source_path.is_absolute():
        source_path = (Path(__file__).parent / source_path).resolve()
    try:
        report = import_json_data(db, str(source_path), reset=payload.reset)
        logger.info("json imported path=%s reset=%s records=%s skipped=%s", source_path, payload.reset, report.records_imported, report.records_skipped)
        return report
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"JSON file not found: {source_path}") from exc
