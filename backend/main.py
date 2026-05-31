from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import create_db_and_tables, get_db
from models import AmountPreset, Participant, RedPacketRecord
from money import cents_to_amount
from schemas import (
    AmountPresetRead,
    ImportReport,
    ImportRequest,
    ParticipantCreate,
    ParticipantRead,
    RecordCreate,
    RecordDetail,
    RecordListItem,
    SummaryStats,
    TrendPoint,
    UserStatsItem,
)
from services import (
    build_summary,
    build_trends,
    build_user_stats,
    create_record,
    get_record_query,
    import_json_data,
    serialize_record_detail,
    serialize_record_list_item,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_db_and_tables()
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
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = get_record_query()
    if status:
        query = query.where(RedPacketRecord.status == status)
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


@app.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    record = db.get(RedPacketRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"deleted": True}


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
