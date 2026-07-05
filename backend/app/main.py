from contextlib import asynccontextmanager
from datetime import datetime
import logging
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.passwords import validate_password_value
from app.core.security import create_access_token, get_current_user, hash_password, require_admin, require_super_admin, verify_password
from app.db.session import SessionLocal, create_db_and_tables, get_db
from app.models import (
    AmountPreset,
    Announcement,
    AppRole,
    AppSetting,
    AppUser,
    ActivityLog,
    Participant,
    PopupNotice,
    PopupNoticeRecipient,
    RecordStatus,
    RedPacketClaim,
    RedPacketRecord,
)
from app.schemas import (
    ActivityLogListResponse,
    ActivityPageView,
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
from app.services.activity import serialize_activity_log, write_activity_log
from app.services.backups import backup_dir, create_database_backup, get_backup_file, serialize_backup
from app.services.money import cents_to_amount
from app.services.participants import assert_participant_available
from app.services.popup_notices import serialize_popup_notice, validate_popup_recipients
from app.services.records import (
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


VALID_APP_ROLES = {AppRole.super_admin.value, AppRole.admin.value, AppRole.viewer.value, AppRole.contributor.value}
ADMIN_APP_ROLES = {AppRole.super_admin.value, AppRole.admin.value}
PINNED_NOTICE_KEY = "pinned_notice"
logger = logging.getLogger("red_packet")
logging.basicConfig(level=logging.INFO)


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
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = authenticate_app_user(db, payload.username, payload.password)
    if user is None:
        write_activity_log(
            db,
            "login_failed",
            f"登录失败：{payload.username}",
            request=request,
            target_type="auth",
            details={"username": payload.username},
        )
        db.commit()
        logger.warning("login failed username=%s", payload.username)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    write_activity_log(db, "login_success", f"{user.display_name} 登录成功", user, request=request, target_type="auth")
    db.commit()
    logger.info("login success user_id=%s username=%s role=%s", user.id, user.username, user.role)
    return {"user": serialize_app_user(user), "token": create_access_token(user)}


@app.post("/activity/page-view")
def log_page_view(payload: ActivityPageView, request: Request, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    write_activity_log(
        db,
        "page_view",
        f"{current_user.display_name} 查看了 {payload.view_label}",
        current_user,
        request=request,
        target_type="page",
        target_id=payload.view_key,
        details={"view_key": payload.view_key, "view_label": payload.view_label},
    )
    db.commit()
    return {"ok": True}


@app.get("/admin/activity-logs", response_model=ActivityLogListResponse)
def list_activity_logs(
    event_type: str | None = Query(default=None),
    actor_user_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    _: AppUser = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    query = select(ActivityLog).order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
    if event_type:
        query = query.where(ActivityLog.event_type == event_type)
    if actor_user_id:
        query = query.where(ActivityLog.actor_user_id == actor_user_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                ActivityLog.summary.ilike(pattern),
                ActivityLog.actor_username.ilike(pattern),
                ActivityLog.actor_display_name.ilike(pattern),
                ActivityLog.target_type.ilike(pattern),
                ActivityLog.target_id.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    logs = db.scalars(query.offset(offset).limit(limit)).all()
    return {"items": [serialize_activity_log(log) for log in logs], "total": total}


@app.get("/me", response_model=AppUserRead)
def get_me(current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.scalars(select(AppUser).where(AppUser.id == current_user.id).options(selectinload(AppUser.participant))).one()
    return serialize_app_user(user)


@app.put("/me/password", response_model=AppUserRead)
def change_my_password(payload: PasswordChange, request: Request, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    validate_password_value(payload.new_password)
    user = db.scalars(select(AppUser).where(AppUser.id == current_user.id).options(selectinload(AppUser.participant))).one()
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    write_activity_log(db, "password_changed", f"{user.display_name} 修改了自己的登录密码", user, request=request, target_type="app_user", target_id=user.id)
    db.commit()
    db.refresh(user)
    logger.info("password changed user_id=%s", user.id)
    return serialize_app_user(user)


@app.put("/me/avatar", response_model=AppUserRead)
def update_my_avatar(payload: ParticipantAvatarUpdate, request: Request, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.scalars(select(AppUser).where(AppUser.id == current_user.id).options(selectinload(AppUser.participant))).one()
    if user.participant is None:
        raise HTTPException(status_code=400, detail="Current user is not linked to a participant")

    avatar = payload.avatar_data_url
    if avatar and not avatar.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Avatar must be an image data URL")

    user.participant.avatar_data_url = avatar
    write_activity_log(
        db,
        "avatar_updated",
        f"{user.display_name} 更新了自己的头像",
        user,
        request=request,
        target_type="participant",
        target_id=user.participant_id,
        details={"self_service": True, "has_avatar": bool(avatar)},
    )
    db.commit()
    db.refresh(user)
    logger.info("self avatar updated user_id=%s participant_id=%s has_avatar=%s", user.id, user.participant_id, bool(avatar))
    return serialize_app_user(user)


@app.get("/participants", response_model=list[ParticipantRead])
def list_participants(_: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Participant).order_by(Participant.name)).all()


@app.post("/participants", response_model=ParticipantRead)
def create_participant(payload: ParticipantCreate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
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
        write_activity_log(
            db,
            "participant_created",
            f"{current_user.display_name} 新增了参与者 {name}",
            current_user,
            request=request,
            target_type="participant",
            target_id=participant.id,
            details={"participant_name": name},
        )
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
    request: Request,
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
    write_activity_log(
        db,
        "participant_avatar_updated",
        f"{current_user.display_name} 更新了 {participant.name} 的头像",
        current_user,
        request=request,
        target_type="participant",
        target_id=participant.id,
        details={"participant_name": participant.name, "has_avatar": bool(avatar)},
    )
    db.commit()
    db.refresh(participant)
    logger.info("participant avatar updated id=%s user_id=%s has_avatar=%s", participant_id, current_user.id, bool(avatar))
    return participant


@app.get("/admin/app-users", response_model=list[AppUserRead])
def list_app_users(_: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(select(AppUser).options(selectinload(AppUser.participant)).order_by(AppUser.role, AppUser.username)).all()
    return [serialize_app_user(user) for user in users]


@app.post("/admin/app-users", response_model=AppUserRead)
def create_app_user(payload: AppUserCreate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if payload.role == AppRole.super_admin.value:
        raise HTTPException(status_code=400, detail="Cannot create another super admin")
    if payload.role == AppRole.admin.value and current_user.role != AppRole.super_admin.value:
        raise HTTPException(status_code=403, detail="Only super admin can assign admin role")
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
        db.flush()
        write_activity_log(
            db,
            "app_user_created",
            f"{current_user.display_name} 新增了登录账号 {user.display_name}",
            current_user,
            request=request,
            target_type="app_user",
            target_id=user.id,
            details={"username": user.username, "display_name": user.display_name, "role": user.role, "is_active": user.is_active},
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from exc
    db.refresh(user)
    logger.info("app user created id=%s username=%s role=%s", user.id, user.username, user.role)
    user = db.scalars(select(AppUser).where(AppUser.id == user.id).options(selectinload(AppUser.participant))).one()
    return serialize_app_user(user)


@app.put("/admin/app-users/{user_id}", response_model=AppUserRead)
def update_app_user(user_id: int, payload: AppUserUpdate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    if payload.role not in VALID_APP_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = db.get(AppUser, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    assert_participant_available(db, payload.participant_id, user_id=user.id)
    if payload.role == AppRole.super_admin.value and user.role != AppRole.super_admin.value:
        raise HTTPException(status_code=400, detail="Cannot assign super admin role")
    if user.role == AppRole.super_admin.value:
        if payload.role != AppRole.super_admin.value or not payload.is_active:
            raise HTTPException(status_code=400, detail="Cannot remove super admin access")
    if user.id == current_user.id and (payload.role not in ADMIN_APP_ROLES or not payload.is_active):
        raise HTTPException(status_code=400, detail="Cannot remove your own admin access")
    if (user.role == AppRole.admin.value or payload.role == AppRole.admin.value) and current_user.role != AppRole.super_admin.value:
        raise HTTPException(status_code=403, detail="Only super admin can manage admin role")

    if user.role == AppRole.admin.value and (payload.role != AppRole.admin.value or not payload.is_active):
        active_admin_count = db.scalar(
            select(func.count()).select_from(AppUser).where(AppUser.role.in_(ADMIN_APP_ROLES), AppUser.is_active.is_(True))
        )
        if active_admin_count is not None and active_admin_count <= 1:
            raise HTTPException(status_code=400, detail="At least one active admin is required")

    user.display_name = payload.display_name.strip()
    user.participant_id = payload.participant_id
    user.role = payload.role
    user.is_active = payload.is_active
    changed_password = bool(payload.password)
    if payload.password:
        validate_password_value(payload.password)
        user.password_hash = hash_password(payload.password)

    write_activity_log(
        db,
        "app_user_updated",
        f"{current_user.display_name} 更新了登录账号 {user.display_name}",
        current_user,
        request=request,
        target_type="app_user",
        target_id=user.id,
        details={
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
            "is_active": user.is_active,
            "password_reset": changed_password,
            "participant_id": user.participant_id,
        },
    )
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
def update_pinned_notice(payload: PinnedNoticeUpdate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    setting = db.get(AppSetting, PINNED_NOTICE_KEY)
    if setting is None:
        setting = AppSetting(key=PINNED_NOTICE_KEY, value="")
        db.add(setting)

    setting.value = payload.content.strip()
    setting.updated_at = datetime.utcnow()
    write_activity_log(
        db,
        "pinned_notice_updated",
        f"{current_user.display_name} 更新了首页置顶公告",
        current_user,
        request=request,
        target_type="pinned_notice",
        details={"has_content": bool(setting.value)},
    )
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
def create_popup_notice(payload: PopupNoticeCreate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
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
    write_activity_log(
        db,
        "popup_notice_created",
        f"{current_user.display_name} 发布了弹窗公告：{notice.title}",
        current_user,
        request=request,
        target_type="popup_notice",
        target_id=notice.id,
        details={"title": notice.title, "recipient_count": len(users), "is_active": notice.is_active},
    )
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
    request: Request,
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
    write_activity_log(
        db,
        "popup_notice_updated",
        f"{current_user.display_name} 更新了弹窗公告：{notice.title}",
        current_user,
        request=request,
        target_type="popup_notice",
        target_id=notice.id,
        details={"title": notice.title, "recipient_count": len(users), "is_active": notice.is_active},
    )
    db.commit()
    notice = db.scalars(
        select(PopupNotice)
        .where(PopupNotice.id == notice_id)
        .options(selectinload(PopupNotice.recipients).selectinload(PopupNoticeRecipient.user))
    ).one()
    logger.info("popup notice updated id=%s user_id=%s recipients=%s", notice.id, current_user.id, len(users))
    return serialize_popup_notice(notice)


@app.post("/admin/announcements", response_model=AnnouncementRead)
def create_announcement(payload: AnnouncementCreate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    announcement = Announcement(
        title=payload.title.strip(),
        version=payload.version.strip(),
        content=payload.content.strip(),
        created_by_user_id=current_user.id,
    )
    db.add(announcement)
    db.flush()
    write_activity_log(
        db,
        "announcement_created",
        f"{current_user.display_name} 发布了更新公告：{announcement.title}",
        current_user,
        request=request,
        target_type="announcement",
        target_id=announcement.id,
        details={"title": announcement.title, "version": announcement.version},
    )
    db.commit()
    db.refresh(announcement)
    logger.info("announcement created id=%s user_id=%s version=%s", announcement.id, current_user.id, announcement.version)
    return announcement


@app.put("/admin/announcements/{announcement_id}", response_model=AnnouncementRead)
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    request: Request,
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
    write_activity_log(
        db,
        "announcement_updated",
        f"{current_user.display_name} 更新了更新公告：{announcement.title}",
        current_user,
        request=request,
        target_type="announcement",
        target_id=announcement.id,
        details={"title": announcement.title, "version": announcement.version},
    )
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
    if current_user.role not in ADMIN_APP_ROLES:
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
def add_record(payload: RecordCreate, request: Request, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.role not in ADMIN_APP_ROLES:
        payload.status = RecordStatus.pending.value
    try:
        record = create_record(db, payload, created_by_user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    record = db.scalars(get_record_query().where(RedPacketRecord.id == record.id)).one()
    write_activity_log(
        db,
        "record_submitted",
        f"{current_user.display_name} 提交了 {record.sender.name} 的红包记录",
        current_user,
        request=request,
        target_type="record",
        target_id=record.id,
        details={
            "sender_name": record.sender.name,
            "total_amount": cents_to_amount(record.total_amount_cents),
            "claim_count": len(record.claims),
            "status": record.status,
        },
    )
    db.commit()
    logger.info("record created id=%s user_id=%s status=%s", record.id, current_user.id, record.status)
    return serialize_record_detail(record)


@app.get("/records/{record_id}", response_model=RecordDetail)
def get_record(record_id: int, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if current_user.role not in ADMIN_APP_ROLES and record.status != RecordStatus.approved.value and record.created_by_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Record not found")
    return serialize_record_detail(record)


@app.post("/records/{record_id}/cancel", response_model=RecordDetail)
def cancel_my_record(record_id: int, request: Request, current_user: AppUser = Depends(get_current_user), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None or record.created_by_user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.status != RecordStatus.pending.value:
        raise HTTPException(status_code=400, detail="Only pending records can be cancelled")

    record.status = RecordStatus.cancelled.value
    write_activity_log(
        db,
        "record_cancelled",
        f"{current_user.display_name} 撤回了自己的待审核记录",
        current_user,
        request=request,
        target_type="record",
        target_id=record.id,
        details={"sender_id": record.sender_id, "total_amount": cents_to_amount(record.total_amount_cents)},
    )
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    logger.info("record cancelled id=%s user_id=%s", record_id, current_user.id)
    return serialize_record_detail(record)


@app.put("/records/{record_id}", response_model=RecordDetail)
def put_record(record_id: int, payload: RecordUpdate, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    try:
        updated = update_record(db, record, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated = db.scalars(get_record_query().where(RedPacketRecord.id == updated.id)).one()
    write_activity_log(
        db,
        "record_updated",
        f"{current_user.display_name} 编辑了 {updated.sender.name} 的红包记录",
        current_user,
        request=request,
        target_type="record",
        target_id=updated.id,
        details={"sender_name": updated.sender.name, "total_amount": cents_to_amount(updated.total_amount_cents), "status": updated.status},
    )
    db.commit()
    logger.info("record updated id=%s", updated.id)
    return serialize_record_detail(updated)


@app.delete("/records/{record_id}")
def delete_record(record_id: int, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.get(RedPacketRecord, record_id)
    if record is None or record.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = datetime.utcnow()
    record.deleted_by_user_id = current_user.id
    write_activity_log(
        db,
        "record_deleted",
        f"{current_user.display_name} 删除了一条红包记录",
        current_user,
        request=request,
        target_type="record",
        target_id=record.id,
        details={"sender_id": record.sender_id, "total_amount": cents_to_amount(record.total_amount_cents), "status": record.status},
    )
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
def restore_deleted_record(record_id: int, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(deleted_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.deleted_at = None
    record.deleted_by_user_id = None
    write_activity_log(
        db,
        "record_restored",
        f"{current_user.display_name} 恢复了一条已删除记录",
        current_user,
        request=request,
        target_type="record",
        target_id=record.id,
        details={"sender_id": record.sender_id, "total_amount": cents_to_amount(record.total_amount_cents), "status": record.status},
    )
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
def create_backup(request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    path = create_database_backup()
    write_activity_log(
        db,
        "backup_created",
        f"{current_user.display_name} 创建了数据库备份",
        current_user,
        request=request,
        target_type="backup",
        target_id=path.name,
        details={"filename": path.name, "size_bytes": path.stat().st_size},
    )
    db.commit()
    logger.info("backup created filename=%s user_id=%s", path.name, current_user.id)
    return serialize_backup(path)


@app.get("/admin/backups/{filename}")
def download_backup(filename: str, _: AppUser = Depends(require_admin)):
    path = get_backup_file(filename)
    return FileResponse(path, media_type="application/gzip", filename=path.name)


@app.post("/admin/review-records/{record_id}/approve", response_model=RecordDetail)
def approve_record(record_id: int, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.status = RecordStatus.approved.value
    record.approved_by_user_id = current_user.id
    record.approved_at = datetime.utcnow()
    write_activity_log(
        db,
        "record_approved",
        f"{current_user.display_name} 通过了一条待审核记录",
        current_user,
        request=request,
        target_type="record",
        target_id=record.id,
        details={"sender_id": record.sender_id, "total_amount": cents_to_amount(record.total_amount_cents)},
    )
    db.commit()
    record = db.scalars(get_record_query().where(RedPacketRecord.id == record_id)).one()
    logger.info("record approved id=%s user_id=%s", record_id, current_user.id)
    return serialize_record_detail(record)


@app.post("/admin/review-records/{record_id}/reject", response_model=RecordDetail)
def reject_record(record_id: int, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.scalars(active_records_query().where(RedPacketRecord.id == record_id)).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    record.status = RecordStatus.rejected.value
    write_activity_log(
        db,
        "record_rejected",
        f"{current_user.display_name} 驳回了一条待审核记录",
        current_user,
        request=request,
        target_type="record",
        target_id=record.id,
        details={"sender_id": record.sender_id, "total_amount": cents_to_amount(record.total_amount_cents)},
    )
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
def import_json(payload: ImportRequest, request: Request, current_user: AppUser = Depends(require_admin), db: Session = Depends(get_db)):
    source_path = Path(payload.path)
    if not source_path.is_absolute():
        source_path = (Path(__file__).parent / source_path).resolve()
    try:
        report = import_json_data(db, str(source_path), reset=payload.reset)
        write_activity_log(
            db,
            "json_imported",
            f"{current_user.display_name} 执行了 JSON 数据导入",
            current_user,
            request=request,
            target_type="import",
            target_id=str(source_path),
            details={
                "path": str(source_path),
                "reset": payload.reset,
                "records_imported": report.records_imported,
                "records_skipped": report.records_skipped,
                "claims_imported": report.claims_imported,
                "errors": len(report.errors),
            },
        )
        db.commit()
        logger.info("json imported path=%s reset=%s records=%s skipped=%s", source_path, payload.reset, report.records_imported, report.records_skipped)
        return report
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"JSON file not found: {source_path}") from exc
