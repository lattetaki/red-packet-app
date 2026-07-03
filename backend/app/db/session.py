from collections.abc import Generator
import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


default_database_path = Path(__file__).resolve().parents[2] / "hongbao.db"
database_path = Path(os.getenv("RED_PACKET_DATABASE_PATH", default_database_path)).expanduser()
database_path.parent.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{database_path}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def create_db_and_tables() -> None:
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
