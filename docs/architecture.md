# Red Packet App Architecture

This project keeps the existing React + TypeScript + Tailwind + shadcn/ui frontend and FastAPI + SQLite backend stack. The current refactor focuses on structure only: shared code is pulled out of large entry files, while route behavior, API contracts, and database usage stay unchanged.

## Backend

The backend entry point remains `backend/main.py` so existing commands such as `uvicorn main:app --reload` still work. That file now delegates to `backend/app/main.py`.

Recommended backend layout:

```text
backend/
  main.py                  # compatibility entry for uvicorn main:app
  app/
    main.py                # FastAPI app setup, middleware, lifespan, routes
    core/
      security.py          # password hashing, token creation, auth dependencies
      passwords.py         # password policy validation
    db/
      session.py           # SQLAlchemy engine, Base, SessionLocal, get_db
    models/
      __init__.py          # SQLAlchemy models and enums
    schemas/
      __init__.py          # Pydantic request/response schemas
    services/
      records.py           # record import, stats, serialization, setup helpers
      money.py             # amount/cents conversion helpers
      backups.py           # SQLite backup file creation/download helpers
      participants.py      # participant validation helpers
      popup_notices.py     # popup notice serialization and recipient validation
```

When adding backend features:

1. Put database tables in `app/models`.
2. Put request/response contracts in `app/schemas`.
3. Put reusable business logic in `app/services`.
4. Keep `app/main.py` focused on HTTP routing, dependency checks, and response wiring.
5. Keep `backend/main.py` as a small compatibility shim.

The default local database path is still `backend/hongbao.db`. In production, `RED_PACKET_DATABASE_PATH` can point to the online data file.

## Frontend

The frontend still enters through `frontend/src/App.tsx`, but common code has been separated so the app shell is easier to review.

Recommended frontend layout:

```text
frontend/src/
  App.tsx                         # app shell, page state, high-level render wiring
  api.ts                          # API client and shared API types
  components/
    ui/                           # shadcn/ui primitives
    common/AvatarBubble.tsx       # shared avatar display
    charts/TrendLineChart.tsx     # reusable trend chart
  config/
    navigation.ts                 # sidebar/top navigation permissions and labels
  features/
    auth/LoginPage.tsx            # login page
    notices/PopupNoticeModal.tsx  # user-facing popup notice modal
  lib/
    date.ts                       # date/time input helpers
    format.ts                     # display formatting helpers
    number.ts                     # numeric conversion helpers
    password.ts                   # frontend password policy
    records.ts                    # record-entry and trend helpers
    storage.ts                    # localStorage keys and session/default readers
  types/
    app.ts                        # frontend-only app state types
```

When adding frontend features:

1. Add API types and fetch functions to `api.ts`.
2. Add page-specific UI under `features/<feature-name>/`.
3. Add shared display components under `components/common` or `components/charts`.
4. Add pure helpers under `lib`.
5. Add cross-page UI types under `types/app.ts`.

## Review Notes

For human review, start with these files:

1. `backend/app/main.py` for endpoint behavior.
2. `backend/app/services/records.py` for statistics and record rules.
3. `frontend/src/App.tsx` for app state and page composition.
4. `frontend/src/api.ts` for frontend/backend contract.
5. `frontend/src/config/navigation.ts` for role-based page visibility.

This structure is intentionally conservative. It avoids changing the database schema or API behavior during the refactor, while creating clear places for future extraction.
