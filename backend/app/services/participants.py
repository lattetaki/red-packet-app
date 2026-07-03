from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AppUser, Participant


def assert_participant_available(db: Session, participant_id: int | None, user_id: int | None = None) -> None:
    if participant_id is None:
        return
    participant = db.get(Participant, participant_id)
    if participant is None:
        raise HTTPException(status_code=404, detail="Participant not found")
    linked_user = db.scalar(select(AppUser).where(AppUser.participant_id == participant_id, AppUser.id != user_id))
    if linked_user is not None:
        raise HTTPException(status_code=409, detail="Participant is already linked to another user")
