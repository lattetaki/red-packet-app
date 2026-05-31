from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import hash_password
from database import SessionLocal, create_db_and_tables, get_db
from models import AmountPreset, AppUser, Participant, RecordStatus, RedPacketRecord
from money import cents_to_amount
from schemas import (
    AmountPresetRead,
    AppUserCreate,
    AppUserRead,
    AppUserUpdate,
    ImportReport,
    ImportRequest,
    LoginRequest,
    ParticipantCreate,
    ParticipantRead,
    RecordCreate,
    RecordDetail,
    RecordUpdate,
    RecordListItem,
    SummaryStats,
    TrendPoint,
    UserStatsItem,
)
from services import (
    authenticate_app_user,
    build_summary,
    build_trends,
    build_user_stats,
    create_record,
    ensure_app_user_setup,
    ensure_participant_setup,
    get_record_query,
    import_json_data,
    serialize_record_detail,
    serialize_record_list_item,
    update_record,
)


VALID_APP_ROLES = {"admin", "viewer", "contributor"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
    with SessionLocal() as db:
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


@app.post("/auth/login", response_model=AppUserRead)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_app_user(db, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return user


@app.get("/participants", response_model=list[ParticipantRead])
def list_participants(db: Session = Depends(get_db)):
    return db.scalars(select(Participant).order_by(Participant.name)).all()


@app.post("/participants", response_model=ParticipantRead)
def create_participant(payload: ParticipantCreate, db: Session = Depends(get_db)):
    participant = Participant(name=payload.name.strip())
    db.add(participant)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Participant already exists") from exc
    db.refresh(participant)
    return participant


@app.get("/admin/app-users", response_model=list[AppUserRead])
def list_app_users(db: Session = Depends(get_db)):
    return db.scalars(select(AppUser).order_by(AppUser.role, AppUser.username)).all()


@app.post("/admin/app-users", response_model=AppUserRead)
def create_app_user(payload: AppUserCreate, db: Session = Depends(get_db)):
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
    return user


@app.put("/admin/app-users/{user_id}", response_model=AppUserRead)
def update_app_user(user_id: int, payload: AppUserUpdate, db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    user.display_name = payload.display_name.strip()
    user.role = payload.role
    user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user


@app.get("/amount-presets", response_model=list[AmountPresetRead])
def list_amount_presets(db: Session = Depends(get_db)):
    presets = db.scalars(select(AmountPreset).where(AmountPreset.is_active.is_(True)).order_by(AmountPreset.amount_cents)).all()
    return [
        {"id": preset.id, "amount": cents_to_amount(preset.amount_cents), "is_active": preset.is_active}
        for preset in presets
    ]


@app.get("/records", response_model=list[RecordListItem])
def list_records(
    status: str | None = Query(default=None),
    sender_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = get_record_query()
    if status:
        query = query.where(RedPacketRecord.status == status)
    if sender_id:
        query = query.where(RedPacketRecord.sender_id == sender_id)
    if date_from:
        query = query.where(RedPacketRecord.time >= date_from)
    if date_to:
        query = query.where(RedPacketRecord.time <= date_to)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.join(RedPacketRecord.sender).where(
            or_(RedPacketRecord.note.ilike(pattern), Participant.name.ilike(pattern), RedPacketRecord.legacy_id.ilike(pattern))
        )
    records = db.scalars(query.limit(limit)).all()
    return [serialize_record_list_item(record) for record in records]


@app.post("/records", response_model=RecordDetail)
def add_record(payload: RecordCreate, db: Session = Depends(get_db)):
    try:
        record = create_record(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    record = db.scalars(get_record_query().where(RedPacketRecord.id == record.id)).one()
    return serialize_record_detail(record)


@app.get("/records/{record_id}", response_model=RecordDetail)
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    return serialize_record_detail(record)


@app.put("/records/{record_id}", response_model=RecordDetail)
def put_record(record_id: int, payload: RecordUpdate, db: Session = Depends(get_db)):
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        updated = update_record(db, record, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated = db.scalars(get_record_query().where(RedPacketRecord.id == updated.id)).one()
    return serialize_record_detail(updated)


@app.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.get(RedPacketRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}


@app.post("/admin/review-records/{record_id}/approve", response_model=RecordDetail)
def approve_record(record_id: int, db: Session = Depends(get_db)):
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.status = RecordStatus.approved.value
    record.approved_at = datetime.utcnow()
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    return serialize_record_detail(record)


@app.post("/admin/review-records/{record_id}/reject", response_model=RecordDetail)
def reject_record(record_id: int, db: Session = Depends(get_db)):
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.status = RecordStatus.rejected.value
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    return serialize_record_detail(record)


@app.get("/stats/summary", response_model=SummaryStats)
def stats_summary(db: Session = Depends(get_db)):
    return build_summary(db)


@app.get("/stats/users", response_model=list[UserStatsItem])
def stats_users(db: Session = Depends(get_db)):
    return build_user_stats(db)


@app.get("/stats/trends", response_model=list[TrendPoint])
def stats_trends(db: Session = Depends(get_db)):
    return build_trends(db)


@app.post("/admin/import-json", response_model=ImportReport)
def import_json(payload: ImportRequest, db: Session = Depends(get_db)):
    source_path = Path(payload.path)
    if not source_path.is_absolute():
        source_path = (Path(__file__).parent / source_path).resolve()
    try:
        return import_json_data(db, str(source_path), reset=payload.reset)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"JSON file not found: {source_path}") from exc
