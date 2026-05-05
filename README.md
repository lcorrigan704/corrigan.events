# sweepstakes.corrigan.events

Small FastAPI + React Vite app for creating private sweepstakes with GBP buy-ins, shareable participant codes, secret organiser URLs, scheduled reveal replays, and World Cup 2026/generic draw templates.

## Run Locally

```bash
docker compose up --build
```

Frontend: <http://localhost:5173>  
API: <http://localhost:8000>

## Backend Tests

```bash
cd backend
pip install -e ".[test]"
pytest
```

## Notes

- The app never handles money. Buy-ins and payouts are display/accounting only.
- Participant codes are short 6-character codes. Organiser permissions use a long secret URL.
- World Cup sports data is adapter-based and best-effort; manual organiser overrides are built in.

