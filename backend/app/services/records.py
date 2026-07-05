import json
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.security import hash_password, verify_password
from app.models import AmountPreset, AppRole, AppUser, Participant, RecordStatus, RedPacketClaim, RedPacketRecord
from app.schemas import ImportReport, RecordCreate, RecordUpdate
from app.services.money import amount_to_cents, cents_to_amount


TIME_PATTERNS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y/%m/%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y/%m/%d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
)

INITIAL_APP_USERS = (
    {
        "username": "包局",
        "display_name": "包局",
        "password": "kskbl",
        "role": AppRole.viewer.value,
    },
    {
        "username": "white",
        "display_name": "white",
        "password": "whiteadmin",
        "role": AppRole.super_admin.value,
    },
)

INITIAL_PARTICIPANTS = ("sheep", "white", "堃堃", "小周", "小熙", "小韬", "帅少", "怠惰", "李哥", "牢保", "老功")


def serialize_app_user(user: AppUser) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "participant_id": user.participant_id,
        "participant_name": user.participant.name if user.participant else None,
        "avatar_data_url": user.participant.avatar_data_url if user.participant else None,
        "role": user.role,
        "is_active": user.is_active,
    }


def ensure_app_user_setup(db: Session) -> None:
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(app_users)"))}
    if "password_hash" not in columns:
        db.execute(text("ALTER TABLE app_users ADD COLUMN password_hash VARCHAR(255) DEFAULT ''"))
        db.commit()
    if "participant_id" not in columns:
        db.execute(text("ALTER TABLE app_users ADD COLUMN participant_id INTEGER"))
        db.commit()

    for item in INITIAL_APP_USERS:
        user = db.scalar(select(AppUser).where(AppUser.username == item["username"]))
        if user is None:
            db.add(
                AppUser(
                    username=item["username"],
                    display_name=item["display_name"],
                    password_hash=hash_password(item["password"]),
                    role=item["role"],
                    is_active=True,
                )
            )
            continue

        user.display_name = item["display_name"]
        user.role = item["role"]
        user.is_active = True
        if not user.password_hash:
            user.password_hash = hash_password(item["password"])

    for participant in db.scalars(select(Participant)).all():
        user = db.scalar(select(AppUser).where(AppUser.username == participant.name))
        linked_user = db.scalar(select(AppUser).where(AppUser.participant_id == participant.id))
        if user is None and linked_user is None:
            db.add(
                AppUser(
                    username=participant.name,
                    display_name=participant.name,
                    participant_id=participant.id,
                    password_hash=hash_password("123456"),
                    role=AppRole.viewer.value,
                    is_active=True,
                )
            )
            continue

        target = user or linked_user
        if target:
            target.participant_id = participant.id
            if not target.password_hash:
                target.password_hash = hash_password("123456")
            if target.username == participant.name and target.role not in {AppRole.admin.value, AppRole.super_admin.value}:
                target.display_name = participant.name
                target.role = AppRole.viewer.value
                target.is_active = True

    db.commit()


def ensure_participant_setup(db: Session) -> None:
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(participants)"))}
    if "avatar_data_url" not in columns:
        db.execute(text("ALTER TABLE participants ADD COLUMN avatar_data_url TEXT"))
        db.commit()

    for name in INITIAL_PARTICIPANTS:
        participant = db.scalar(select(Participant).where(Participant.name == name))
        if participant is None:
            db.add(Participant(name=name))
            continue

        participant.is_active = True

    db.commit()


def ensure_record_soft_delete_columns(db: Session) -> None:
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(red_packet_records)"))}
    changed = False
    if "deleted_by_user_id" not in columns:
        db.execute(text("ALTER TABLE red_packet_records ADD COLUMN deleted_by_user_id INTEGER"))
        changed = True
    if "deleted_at" not in columns:
        db.execute(text("ALTER TABLE red_packet_records ADD COLUMN deleted_at DATETIME"))
        changed = True
    if changed:
        db.commit()


def ensure_popup_notice_columns(db: Session) -> None:
    columns = {row[1] for row in db.execute(text("PRAGMA table_info(popup_notices)"))}
    if columns and "title" not in columns:
        db.execute(text("ALTER TABLE popup_notices ADD COLUMN title VARCHAR(120) DEFAULT '小公告'"))
        db.commit()


def authenticate_app_user(db: Session, username: str, password: str) -> AppUser | None:
    user = db.scalar(select(AppUser).where(AppUser.username == username.strip()))
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def parse_record_time(value: str | None) -> datetime:
    text = (value or "").strip()
    if not text:
        return datetime.utcnow()

    for pattern in TIME_PATTERNS:
        try:
            parsed = datetime.strptime(text, pattern)
        except ValueError:
            continue

        if pattern in ("%Y-%m-%d", "%Y/%m/%d"):
            return parsed.replace(hour=0, minute=0, second=0)
        if pattern in ("%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M"):
            return parsed.replace(second=0)
        return parsed

    raise ValueError(f"Unrecognized time: {value}")


def get_or_create_participant(db: Session, name: str, created: set[str] | None = None) -> Participant:
    clean_name = name.strip()
    participant = db.scalar(select(Participant).where(Participant.name == clean_name))
    if participant:
        return participant

    participant = Participant(name=clean_name)
    db.add(participant)
    db.flush()
    if created is not None:
        created.add(clean_name)
    return participant


def get_or_create_preset(db: Session, amount: str | int, created: set[int] | None = None) -> AmountPreset:
    cents = amount_to_cents(amount)
    preset = db.scalar(select(AmountPreset).where(AmountPreset.amount_cents == cents))
    if preset:
        return preset

    preset = AmountPreset(amount_cents=cents)
    db.add(preset)
    db.flush()
    if created is not None:
        created.add(cents)
    return preset


def claimed_total_cents(record: RedPacketRecord) -> int:
    return sum(claim.amount_cents for claim in record.claims)


def serialize_record_list_item(record: RedPacketRecord) -> dict:
    return {
        "id": record.id,
        "legacy_id": record.legacy_id,
        "time": record.time,
        "sender_id": record.sender_id,
        "sender_name": record.sender.name,
        "total_amount": cents_to_amount(record.total_amount_cents),
        "claimed_amount": cents_to_amount(claimed_total_cents(record)),
        "claim_count": len(record.claims),
        "note": record.note,
        "status": record.status,
        "created_by_user_id": record.created_by_user_id,
        "deleted_at": record.deleted_at,
        "deleted_by_user_id": record.deleted_by_user_id,
    }


def serialize_record_detail(record: RedPacketRecord) -> dict:
    data = serialize_record_list_item(record)
    data["claims"] = [
        {
            "id": claim.id,
            "participant_id": claim.participant_id,
            "participant_name": claim.participant.name,
            "amount": cents_to_amount(claim.amount_cents),
        }
        for claim in record.claims
    ]
    return data


def normalize_duplicate_time(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def find_recent_duplicate_record(db: Session, payload: RecordCreate, created_by_user_id: int | None) -> RedPacketRecord | None:
    expected_time = normalize_duplicate_time(payload.time)
    expected_note = payload.note.strip()
    expected_total_cents = amount_to_cents(payload.total_amount)
    expected_claims = tuple((claim.participant_id, amount_to_cents(claim.amount)) for claim in payload.claims)
    cutoff = datetime.utcnow() - timedelta(seconds=30)

    query = (
        select(RedPacketRecord)
        .where(
            RedPacketRecord.deleted_at.is_(None),
            RedPacketRecord.created_at >= cutoff,
            RedPacketRecord.created_by_user_id == created_by_user_id,
            RedPacketRecord.sender_id == payload.sender_id,
            RedPacketRecord.total_amount_cents == expected_total_cents,
            RedPacketRecord.status == payload.status,
        )
        .options(selectinload(RedPacketRecord.claims))
        .order_by(RedPacketRecord.created_at.desc())
    )

    for record in db.scalars(query).all():
        record_time = normalize_duplicate_time(record.time)
        if expected_time is not None and record_time is not None and abs((record_time - expected_time).total_seconds()) > 1:
            continue
        if record.note != expected_note:
            continue
        actual_claims = tuple((claim.participant_id, claim.amount_cents) for claim in record.claims)
        if actual_claims == expected_claims:
            return record

    return None


def create_record(db: Session, payload: RecordCreate, created_by_user_id: int | None = None) -> RedPacketRecord:
    sender = db.get(Participant, payload.sender_id)
    if sender is None:
        raise ValueError("Sender does not exist")

    status = payload.status
    if status not in {item.value for item in RecordStatus}:
        raise ValueError("Invalid status")

    participant_ids = [claim.participant_id for claim in payload.claims]
    participants = db.scalars(select(Participant).where(Participant.id.in_(participant_ids))).all()
    found_ids = {participant.id for participant in participants}
    missing_ids = set(participant_ids) - found_ids
    if missing_ids:
        raise ValueError(f"Claim participant does not exist: {sorted(missing_ids)}")

    duplicate = find_recent_duplicate_record(db, payload, created_by_user_id)
    if duplicate is not None:
        return duplicate

    record = RedPacketRecord(
        time=normalize_duplicate_time(payload.time) or datetime.utcnow(),
        sender_id=payload.sender_id,
        total_amount_cents=amount_to_cents(payload.total_amount),
        note=payload.note.strip(),
        status=status,
        created_by_user_id=created_by_user_id,
        approved_at=datetime.utcnow() if status == RecordStatus.approved.value else None,
    )
    db.add(record)
    db.flush()

    for index, claim in enumerate(payload.claims):
        db.add(
            RedPacketClaim(
                record_id=record.id,
                participant_id=claim.participant_id,
                amount_cents=amount_to_cents(claim.amount),
                sort_order=index,
            )
        )

    get_or_create_preset(db, payload.total_amount)
    db.commit()
    db.refresh(record)
    return record


def update_record(db: Session, record: RedPacketRecord, payload: RecordUpdate) -> RedPacketRecord:
    sender = db.get(Participant, payload.sender_id)
    if sender is None:
        raise ValueError("Sender does not exist")

    status = payload.status
    if status not in {item.value for item in RecordStatus}:
        raise ValueError("Invalid status")

    participant_ids = [claim.participant_id for claim in payload.claims]
    participants = db.scalars(select(Participant).where(Participant.id.in_(participant_ids))).all()
    found_ids = {participant.id for participant in participants}
    missing_ids = set(participant_ids) - found_ids
    if missing_ids:
        raise ValueError(f"Claim participant does not exist: {sorted(missing_ids)}")

    record.time = payload.time or record.time
    record.sender_id = payload.sender_id
    record.total_amount_cents = amount_to_cents(payload.total_amount)
    record.note = payload.note.strip()
    record.status = status
    record.approved_at = datetime.utcnow() if status == RecordStatus.approved.value and not record.approved_at else record.approved_at
    record.claims.clear()
    db.flush()

    for index, claim in enumerate(payload.claims):
        record.claims.append(
            RedPacketClaim(
                participant_id=claim.participant_id,
                amount_cents=amount_to_cents(claim.amount),
                sort_order=index,
            )
        )

    get_or_create_preset(db, payload.total_amount)
    db.commit()
    db.refresh(record)
    return record


def get_record_query():
    return (
        select(RedPacketRecord)
        .options(
            selectinload(RedPacketRecord.sender),
            selectinload(RedPacketRecord.claims).selectinload(RedPacketClaim.participant),
        )
        .order_by(RedPacketRecord.time.desc(), RedPacketRecord.id.desc())
    )


def active_records_query():
    return get_record_query().where(RedPacketRecord.deleted_at.is_(None))


def deleted_records_query():
    return get_record_query().where(RedPacketRecord.deleted_at.is_not(None))


def apply_record_date_range(query, date_from: datetime | None = None, date_to: datetime | None = None):
    if date_from:
        query = query.where(RedPacketRecord.time >= date_from)
    if date_to:
        query = query.where(RedPacketRecord.time <= date_to)
    return query


def build_summary(db: Session, date_from: datetime | None = None, date_to: datetime | None = None) -> dict:
    approved_records = db.scalars(
        apply_record_date_range(
            select(RedPacketRecord).where(RedPacketRecord.status == RecordStatus.approved.value, RedPacketRecord.deleted_at.is_(None)),
            date_from,
            date_to,
        ).options(selectinload(RedPacketRecord.claims))
    ).all()

    pending_query = select(func.count()).select_from(RedPacketRecord).where(
        RedPacketRecord.status == RecordStatus.pending.value, RedPacketRecord.deleted_at.is_(None)
    )
    pending_count = db.scalar(apply_record_date_range(pending_query, date_from, date_to))
    participant_count = db.scalar(select(func.count()).select_from(Participant).where(Participant.is_active.is_(True)))

    total_sent = sum(record.total_amount_cents for record in approved_records)
    total_claimed = sum(claimed_total_cents(record) for record in approved_records)

    return {
        "record_count": len(approved_records),
        "participant_count": participant_count or 0,
        "total_sent_amount": cents_to_amount(total_sent),
        "total_claimed_amount": cents_to_amount(total_claimed),
        "pending_count": pending_count or 0,
    }


def build_user_stats(db: Session, date_from: datetime | None = None, date_to: datetime | None = None) -> list[dict]:
    participants = db.scalars(select(Participant).order_by(Participant.name)).all()
    stats = {
        item.id: {
            "participant_id": item.id,
            "name": item.name,
            "send_count": 0,
            "send_amount_cents": 0,
            "receive_count": 0,
            "receive_amount_cents": 0,
        }
        for item in participants
    }

    records = db.scalars(
        apply_record_date_range(
            select(RedPacketRecord).where(RedPacketRecord.status == RecordStatus.approved.value, RedPacketRecord.deleted_at.is_(None)),
            date_from,
            date_to,
        ).options(selectinload(RedPacketRecord.sender), selectinload(RedPacketRecord.claims))
    ).all()

    for record in records:
        sender_stats = stats.setdefault(
            record.sender_id,
            {
                "participant_id": record.sender_id,
                "name": record.sender.name,
                "send_count": 0,
                "send_amount_cents": 0,
                "receive_count": 0,
                "receive_amount_cents": 0,
            },
        )
        sender_stats["send_count"] += 1
        sender_stats["send_amount_cents"] += record.total_amount_cents

        for claim in record.claims:
            receiver_stats = stats[claim.participant_id]
            receiver_stats["receive_count"] += 1
            receiver_stats["receive_amount_cents"] += claim.amount_cents

    rows = []
    for item in stats.values():
        total_count = item["send_count"] + item["receive_count"]
        receive_count = item["receive_count"]
        pnl = item["receive_amount_cents"] - item["send_amount_cents"]
        average_cents = (
            int((Decimal(item["receive_amount_cents"]) / Decimal(receive_count)).quantize(Decimal("1"), ROUND_HALF_UP))
            if receive_count
            else 0
        )
        rows.append(
            {
                "participant_id": item["participant_id"],
                "name": item["name"],
                "send_count": item["send_count"],
                "send_amount": cents_to_amount(item["send_amount_cents"]),
                "receive_count": receive_count,
                "receive_amount": cents_to_amount(item["receive_amount_cents"]),
                "average_receive_amount": cents_to_amount(average_cents),
                "pnl_amount": cents_to_amount(pnl),
                "send_ratio": f"{item['send_count'] / total_count * 100:.1f}%" if total_count else "-",
                "_pnl_cents": pnl,
            }
        )

    rows.sort(key=lambda row: (-row["_pnl_cents"], row["name"]))
    for row in rows:
        row.pop("_pnl_cents")
    return rows


def build_trends(db: Session, date_from: datetime | None = None, date_to: datetime | None = None) -> list[dict]:
    records = db.scalars(
        apply_record_date_range(
            select(RedPacketRecord).where(RedPacketRecord.status == RecordStatus.approved.value, RedPacketRecord.deleted_at.is_(None)),
            date_from,
            date_to,
        )
        .options(
            selectinload(RedPacketRecord.sender),
            selectinload(RedPacketRecord.claims).selectinload(RedPacketClaim.participant),
        )
        .order_by(RedPacketRecord.time.asc(), RedPacketRecord.id.asc())
    ).all()

    balances: defaultdict[int, int] = defaultdict(int)
    points = []
    for record in records:
        balances[record.sender_id] -= record.total_amount_cents
        points.append(
            {
                "record_id": record.id,
                "time": record.time,
                "participant_id": record.sender_id,
                "participant_name": record.sender.name,
                "pnl_amount": cents_to_amount(balances[record.sender_id]),
            }
        )

        for claim in record.claims:
            balances[claim.participant_id] += claim.amount_cents
            points.append(
                {
                    "record_id": record.id,
                    "time": record.time,
                    "participant_id": claim.participant_id,
                    "participant_name": claim.participant.name,
                    "pnl_amount": cents_to_amount(balances[claim.participant_id]),
                }
            )

    return points


def participant_summary(participant: Participant) -> dict:
    return {
        "id": participant.id,
        "name": participant.name,
        "avatar_data_url": participant.avatar_data_url,
    }


def claim_stat(record: RedPacketRecord, claim: RedPacketClaim) -> dict:
    return {
        "participant": participant_summary(claim.participant),
        "sender": participant_summary(record.sender),
        "amount": cents_to_amount(claim.amount_cents),
        "record_id": record.id,
        "time": record.time,
    }


def streak_stat(participant: Participant, count: int) -> dict:
    return {
        "participant": participant_summary(participant),
        "count": count,
    }


def counterparty_stat(participant: Participant, amount_cents: int) -> dict:
    return {
        "participant": participant_summary(participant),
        "amount": cents_to_amount(amount_cents),
    }


def build_record_stats(db: Session, date_from: datetime | None = None, date_to: datetime | None = None) -> dict:
    participants = db.scalars(select(Participant).order_by(Participant.name)).all()
    participant_by_id = {participant.id: participant for participant in participants}

    records = db.scalars(
        apply_record_date_range(
            select(RedPacketRecord).where(RedPacketRecord.status == RecordStatus.approved.value, RedPacketRecord.deleted_at.is_(None)),
            date_from,
            date_to,
        )
        .options(
            selectinload(RedPacketRecord.sender),
            selectinload(RedPacketRecord.claims).selectinload(RedPacketClaim.participant),
        )
        .order_by(RedPacketRecord.time.asc(), RedPacketRecord.id.asc())
    ).all()

    claims = [(record, claim) for record in records for claim in record.claims]
    max_claims = sorted(claims, key=lambda item: (-item[1].amount_cents, item[0].time, item[0].id))[:3]
    min_claims = sorted(claims, key=lambda item: (item[1].amount_cents, item[0].time, item[0].id))[:3]

    win_current: defaultdict[int, int] = defaultdict(int)
    win_best: defaultdict[int, int] = defaultdict(int)
    loss_current: defaultdict[int, int] = defaultdict(int)
    loss_best: defaultdict[int, int] = defaultdict(int)
    personal_max_claim: dict[int, tuple[RedPacketRecord, RedPacketClaim]] = {}
    personal_min_claim: dict[int, tuple[RedPacketRecord, RedPacketClaim]] = {}
    received_from: dict[int, defaultdict[int, int]] = defaultdict(lambda: defaultdict(int))
    sent_to: dict[int, defaultdict[int, int]] = defaultdict(lambda: defaultdict(int))

    for record in records:
        sender_id = record.sender_id
        loss_current[sender_id] += 1
        win_current[sender_id] = 0
        loss_best[sender_id] = max(loss_best[sender_id], loss_current[sender_id])

        for claim in record.claims:
            receiver_id = claim.participant_id
            win_current[receiver_id] += 1
            loss_current[receiver_id] = 0
            win_best[receiver_id] = max(win_best[receiver_id], win_current[receiver_id])

            current_max = personal_max_claim.get(receiver_id)
            if current_max is None or claim.amount_cents > current_max[1].amount_cents:
                personal_max_claim[receiver_id] = (record, claim)

            current_min = personal_min_claim.get(receiver_id)
            if current_min is None or claim.amount_cents < current_min[1].amount_cents:
                personal_min_claim[receiver_id] = (record, claim)

            received_from[receiver_id][sender_id] += claim.amount_cents
            sent_to[sender_id][receiver_id] += claim.amount_cents

    max_win_streaks = sorted(participants, key=lambda item: (-win_best[item.id], item.name))[:3]
    max_loss_streaks = sorted(participants, key=lambda item: (-loss_best[item.id], item.name))[:3]

    personal = []
    for participant in participants:
        received_rows = sorted(received_from[participant.id].items(), key=lambda item: (-item[1], participant_by_id[item[0]].name))
        sent_rows = sorted(sent_to[participant.id].items(), key=lambda item: (-item[1], participant_by_id[item[0]].name))
        net_received_rows = []
        net_sent_rows = []
        for counterparty_id in participant_by_id:
            if counterparty_id == participant.id:
                continue
            received_cents = received_from[participant.id][counterparty_id]
            sent_cents = sent_to[participant.id][counterparty_id]
            net_cents = received_cents - sent_cents
            if net_cents > 0:
                net_received_rows.append((counterparty_id, net_cents))
            elif net_cents < 0:
                net_sent_rows.append((counterparty_id, -net_cents))

        net_received_rows.sort(key=lambda item: (-item[1], participant_by_id[item[0]].name))
        net_sent_rows.sort(key=lambda item: (-item[1], participant_by_id[item[0]].name))
        max_claim = personal_max_claim.get(participant.id)
        min_claim = personal_min_claim.get(participant.id)

        personal.append(
            {
                "participant": participant_summary(participant),
                "max_claim": claim_stat(*max_claim) if max_claim else None,
                "min_claim": claim_stat(*min_claim) if min_claim else None,
                "max_win_streak": win_best[participant.id],
                "max_loss_streak": loss_best[participant.id],
                "top_received_from": counterparty_stat(participant_by_id[received_rows[0][0]], received_rows[0][1]) if received_rows else None,
                "top_sent_to": counterparty_stat(participant_by_id[sent_rows[0][0]], sent_rows[0][1]) if sent_rows else None,
                "top_net_received_from": counterparty_stat(participant_by_id[net_received_rows[0][0]], net_received_rows[0][1]) if net_received_rows else None,
                "top_net_sent_to": counterparty_stat(participant_by_id[net_sent_rows[0][0]], net_sent_rows[0][1]) if net_sent_rows else None,
            }
        )

    return {
        "max_claims": [claim_stat(record, claim) for record, claim in max_claims],
        "min_claims": [claim_stat(record, claim) for record, claim in min_claims],
        "max_win_streaks": [streak_stat(participant, win_best[participant.id]) for participant in max_win_streaks],
        "max_loss_streaks": [streak_stat(participant, loss_best[participant.id]) for participant in max_loss_streaks],
        "personal": personal,
    }


def reset_imported_data(db: Session) -> None:
    db.execute(delete(RedPacketClaim))
    db.execute(delete(RedPacketRecord))
    db.execute(delete(AmountPreset))
    db.execute(delete(Participant))
    db.commit()


def import_json_data(db: Session, source_path: str, reset: bool = False) -> ImportReport:
    path = Path(source_path)
    if not path.is_absolute():
        path = (Path(__file__).parent / path).resolve()
    if not path.exists():
        raise FileNotFoundError(str(path))

    if reset:
        reset_imported_data(db)

    raw = json.loads(path.read_text(encoding="utf-8"))
    created_participants: set[str] = set()
    created_presets: set[int] = set()
    records_imported = 0
    records_skipped = 0
    claims_imported = 0
    amount_mismatches = 0
    errors: list[str] = []

    for name in raw.get("users", []):
        if str(name).strip():
            get_or_create_participant(db, str(name), created_participants)

    for amount in raw.get("amount_history", []):
        try:
            get_or_create_preset(db, amount, created_presets)
        except ValueError as exc:
            errors.append(f"Invalid amount preset {amount}: {exc}")

    for item in raw.get("records", []):
        legacy_id = item.get("id")
        if legacy_id and db.scalar(select(RedPacketRecord).where(RedPacketRecord.legacy_id == legacy_id)):
            records_skipped += 1
            continue

        try:
            sender = get_or_create_participant(db, str(item["sender"]), created_participants)
            total_cents = amount_to_cents(item["total_amount"])
            record = RedPacketRecord(
                legacy_id=legacy_id,
                time=parse_record_time(item.get("time")),
                sender_id=sender.id,
                total_amount_cents=total_cents,
                note=str(item.get("note", "") or ""),
                status=RecordStatus.approved.value,
                approved_at=parse_record_time(item.get("time")),
            )
            db.add(record)
            db.flush()

            claim_total = 0
            for index, claim in enumerate(item.get("claims", [])):
                participant = get_or_create_participant(db, str(claim["user"]), created_participants)
                amount_cents = amount_to_cents(claim["amount"])
                claim_total += amount_cents
                db.add(
                    RedPacketClaim(
                        record_id=record.id,
                        participant_id=participant.id,
                        amount_cents=amount_cents,
                        sort_order=index,
                    )
                )
                claims_imported += 1

            if claim_total != total_cents:
                amount_mismatches += 1

            get_or_create_preset(db, item["total_amount"], created_presets)
            records_imported += 1
        except (KeyError, ValueError) as exc:
            errors.append(f"Record {legacy_id or '<missing id>'}: {exc}")

    db.commit()
    return ImportReport(
        participants_created=len(created_participants),
        presets_created=len(created_presets),
        records_imported=records_imported,
        records_skipped=records_skipped,
        claims_imported=claims_imported,
        amount_mismatches=amount_mismatches,
        errors=errors,
    )
