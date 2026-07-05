import json
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import ActivityLog, AppUser


def _request_ip(request: Request | None) -> str:
    if request is None or request.client is None:
        return ""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host


def _request_user_agent(request: Request | None) -> str:
    if request is None:
        return ""
    return request.headers.get("user-agent", "")[:500]


def write_activity_log(
    db: Session,
    event_type: str,
    summary: str,
    actor: AppUser | None = None,
    *,
    request: Request | None = None,
    target_type: str = "",
    target_id: str | int | None = None,
    details: dict[str, Any] | None = None,
) -> ActivityLog:
    log = ActivityLog(
        event_type=event_type,
        summary=summary[:240],
        actor_user_id=actor.id if actor else None,
        actor_username=actor.username if actor else "",
        actor_display_name=actor.display_name if actor else "",
        actor_role=actor.role if actor else "",
        target_type=target_type,
        target_id="" if target_id is None else str(target_id),
        details_json=json.dumps(details or {}, ensure_ascii=False, default=str),
        ip_address=_request_ip(request),
        user_agent=_request_user_agent(request),
    )
    db.add(log)
    return log


def serialize_activity_log(log: ActivityLog) -> dict:
    try:
        details = json.loads(log.details_json or "{}")
    except json.JSONDecodeError:
        details = {}

    return {
        "id": log.id,
        "event_type": log.event_type,
        "summary": log.summary,
        "actor_user_id": log.actor_user_id,
        "actor_username": log.actor_username,
        "actor_display_name": log.actor_display_name,
        "actor_role": log.actor_role,
        "target_type": log.target_type,
        "target_id": log.target_id,
        "details": details,
        "ip_address": log.ip_address,
        "user_agent": log.user_agent,
        "created_at": log.created_at,
    }
