from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AppUser, PopupNotice


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
