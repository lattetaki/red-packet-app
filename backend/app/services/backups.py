from datetime import datetime
import gzip
import os
from pathlib import Path
import shutil
import sqlite3

from fastapi import HTTPException

from app.db.session import database_path

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
