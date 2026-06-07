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
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, require_admin
from database import SessionLocal, create_db_and_tables, database_path, get_db
from models import AmountPreset, Announcement, AppRole, AppUser, Participant, RecordStatus, RedPacketClaim, RedPacketRecord
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
    ParticipantAvatarUpdate,
    ParticipantCreate,
    ParticipantRead,
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
    ensure_record_soft_delete_columns,
    get_record_query,
    import_json_data,
    serialize_record_detail,
    serialize_record_list_item,
    update_record,
)


VALID_APP_ROLES = {"admin", "viewer", "contributor"}
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
    return {"user": user, "token": create_access_token(user)}


@app.get("/participants", response_model=list[ParticipantRead])
def list_participants(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Participant).order_by(Participant.name)).all()


@app.post("/participants", response_model=ParticipantRead)
def create_participant(payload: ParticipantCreate, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    participant = Participant(name=payload.name.strip())
    db.add(participant)
    try:
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
    return db.scalars(select(AppUser).order_by(AppUser.role, AppUser.username)).all()


@app.post("/admin/app-users", response_model=AppUserRead)
def create_app_user(payload: AppUserCreate, _: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = AppUser(
        username=payload.username.strip(),
        display_name=payload.display_name.strip(),
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
    return user


@app.put("/admin/app-users/{user_id}", response_model=AppUserRead)
def update_app_user(user_id: int, payload: AppUserUpdate, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id and (payload.role != AppRole.admin.value or not payload.is_active):
        raise HTTPException(status_code=400, detail="Cannot remove your own admin access")

    if user.role == AppRole.admin.value and (payload.role != AppRole.admin.value or not payload.is_active):
        active_admin_count = db.scalar(
            select(func.count()).select_from(AppUser).where(AppUser.role == AppRole.admin.value, AppUser.is_active.is_(True))
        )
        if active_admin_count is not None and active_admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    user.display_name = payload.display_name.strip()
    user.role = payload.role
    user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    logger.info("app user updated id=%s username=%s role=%s active=%s", user.id, user.username, user.role, user.is_active)
    return user


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
def stats_summary(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_summary(db)


@app.get("/stats/users", response_model=list[UserStatsItem])
def stats_users(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_user_stats(db)


@app.get("/stats/trends", response_model=list[TrendPoint])
def stats_trends(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_trends(db)


@app.get("/stats/records", response_model=RecordStatsResponse)
def stats_records(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_record_stats(db)


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
