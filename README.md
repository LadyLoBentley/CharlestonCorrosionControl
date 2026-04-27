# Charleston Corrosion Control

A corrosion monitoring dashboard for industrial sensors. Tracks sensors in the field, groups them by location, runs an ML model on recent readings to flag at-risk equipment, and shows live trend charts so operators can spot trouble before it costs money.

> **Just picked this project up?** After reading this README, see [`HANDOFF.md`](./HANDOFF.md) for a deep tour of the codebase, known quirks, and a prioritized roadmap.

---

## Tech Stack

**Frontend** — React 19, Vite 6, React Router 7, hand-rolled CSS (no framework).

**Backend** — FastAPI, SQLModel, Postgres (hosted on Supabase). Tested with Python 3.14.

**Machine learning** — a pre-trained scikit-learn SVM pipeline, loaded once at API startup from `backend/artifacts/`.

---

## Quick Start

You'll need two terminal windows — one for the backend, one for the frontend.

### Backend

```bash
cd backend
python3 -m venv .venv                     # first time only
source .venv/bin/activate
pip install -r requirements.txt           # first time only
uvicorn main:app --reload --port 8001
```

Then test it:

```bash
curl http://127.0.0.1:8001/
# → {"status":"ok"}
```

### Seed the database (first time only)

```bash
cd backend
python -m scripts.seed_sensors_and_readings
```

This wipes and refills the database with 8 example sensors and 30 days of synthetic readings. To add fresh readings on top of existing data without wiping anything, use:

```bash
python -m scripts.update_sensor_readings --once
```

### Frontend

```bash
cd frontend
npm install                               # first time only
npm run dev
```

Open <http://localhost:5173>.

---

## Pages

| URL | What it does |
| --- | --- |
| `/dashboard` | System overview — KPIs, active alerts, recent activity. |
| `/sensors` | Searchable, filterable list of all sensors. |
| `/sensors/new` | Form to add a new sensor (accepts `?location=` to pre-fill). |
| `/sensors/:code` | One sensor's details — view, edit status/location, delete. |
| `/locations` | Locations grid grouped from each sensor's location field. |
| `/locations/:name` | One location — rename, list its sensors, add a new sensor. |
| `/activity` | Predictions for every sensor + trend charts (temp, humidity, pressure, corrosion). |

---

## Project Structure

```
CharlestonCorrosionControl/
├── HANDOFF.md                  ← read this for the deep tour
├── README.md
├── backend/
│   ├── main.py                 ← FastAPI app, CORS, router mounting
│   ├── requirements.txt
│   ├── .env                    ← DATABASE_URL (gitignored)
│   ├── artifacts/              ← saved ML model + metadata (.joblib files)
│   ├── core/
│   ├── db/                     ← SQLModel engine + session
│   ├── ml/                     ← prediction pipeline
│   ├── models/                 ← SQLModel tables (Sensors, SensorReading)
│   ├── routers/                ← sensors, locations, readings, corrosion
│   ├── schemas/                ← request/response shapes
│   ├── services/               ← business logic (CRUD, updates)
│   ├── scripts/                ← seed + live-update scripts
│   └── tests/
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx             ← routes
        ├── layout.jsx          ← sidebar + main shell
        ├── index.css           ← design tokens + all styles
        ├── components/
        │   ├── Icons.jsx       ← inline SVG icon set
        │   ├── LineChart.jsx   ← inline-SVG chart, no deps
        │   └── Card/
        └── pages/              ← Dashboard, Sensors, SensorForm, SensorDetail,
                                   Locations, LocationDetail, Activity
```

---

## Backend API (overview)

| Method & Path | Purpose |
| --- | --- |
| `GET /` | Health check |
| `GET /api/sensor-submissions/` | List sensors |
| `POST /api/sensor-submissions/` | Create a sensor |
| `GET /api/sensor-submissions/{code}` | Fetch one sensor |
| `PATCH /api/sensor-submissions/{code}` | Update sensor fields |
| `DELETE /api/sensor-submissions/{code}` | Delete a sensor (and its readings) |
| `GET /api/locations/{name}` | Sensors at a location |
| `PATCH /api/locations/{name}` | Bulk-rename a location |
| `GET /sensor-readings/` | All readings |
| `POST /sensor-readings/` | Add a reading |
| `GET /sensor-readings/{code}` | Readings for one sensor |
| `GET /corrosion/predict/{code}` | ML prediction for a sensor |
| `GET /corrosion/metadata` | Model features + decision threshold |

Auto-generated docs are available at <http://127.0.0.1:8001/docs> while the backend is running.

---

## Environment Variables

The backend reads `backend/.env`. It's gitignored — create your own.

Example contents:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
```

Use a Supabase Postgres URL (or any other Postgres) with credentials you control. Never commit real credentials.

---

## Development Ports

| Service | Port |
| --- | --- |
| Frontend (Vite) | 5173 |
| Backend (FastAPI) | 8001 |

The frontend talks to the backend at `http://127.0.0.1:8001` (currently hardcoded — see `HANDOFF.md` §2 for the cleanup note).

---

## Where to Go Next

For a full handoff — what's built, the known quirks, the planned roadmap, and ideas for things to improve — read [`HANDOFF.md`](./HANDOFF.md).
