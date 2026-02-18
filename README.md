# Charleston Corrosion Control

A corrosion monitoring dashboard demo for tracking industrial sensors, inspection results, and risk alerts.

This project simulates a monitoring interface used in manufacturing environments to quickly identify degradation risk, offline sensors, and abnormal readings.

---

## Tech Stack

### Frontend
- React
- Vite
- React Router
- CSS (custom styling)

### Backend
- FastAPI
- Python 3.10+

---

## Project Structure

```text
CharlestonCorrosionControl/
├── backend/
│   ├── core/
│   ├── db/
│   │   ├── .env
│   │   └── .env.example
│   ├── models/
│   ├── routers/
│   ├── schemas/
│   ├── services/
│   ├── dependencies.py
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   ├── public/
│   │   └── vite.svg
│   ├── src/
│   │   ├── pages/
│   │   │   ├── dashboard.jsx
│   │   │   └── sensors.jsx
│   │   ├── App.jsx
│   │   ├── layout.jsx
│   │   ├── main.jsx
│   │   ├── App.css
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
│── resources/
│── .gitignore
└── README.md
```

---

## Running the Project

Backend and frontend run separately.

---

## Backend Setup (FastAPI)

Navigate into backend:

```bash
cd backend
```

Create virtual environment:

```bash
python3 -m venv .venv
```

Activate environment:

**Mac/Linux**

```bash
source .venv/bin/activate
```

**Windows**

```bash
.venv\\Scripts\\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run server:

```bash
uvicorn main:app --reload --port 8001
```

Test API:

Open browser:

```
http://127.0.0.1:8001/
```

Expected response:

```json
{"message": "Hello World"}
```

---

## Frontend Setup (React + Vite)

Open new terminal:

```bash
cd frontend
npm install
npm run dev
```

Open browser:

```
http://localhost:5173
```

---

## Pages

### Dashboard
Displays system overview:
- Active sensors
- At-risk sensors
- Critical sensors
- Online sensors
- Active alerts
- Recent inspections

### Sensors
Displays:
- Searchable sensor list
- Status filtering
- Risk indicators (Low, Medium, High, Critical)
- Last seen timestamps

---

## Environment Variables

Backend environment file:

```
backend/db/.env
```

Create from template:

```bash
cp backend/db/.env.example backend/db/.env
```

Do not commit real credentials.

---

## Development Ports

| Service  | Port |
|--------|----|
| Frontend | 5173 |
| Backend  | 8001 |

Frontend will later communicate with:

```
http://127.0.0.1:8001
```

---

## Current Status

- Frontend fully functional with mock data
- Backend initialized
- UI role switching is demo-only
- Sensors marked offline still count toward risk metrics

---

## Future Improvements

- Connect frontend to API
- Sensor detail view
- Historical inspection trends
- Alert acknowledgement workflow
- Authentication + role permissions
- Database persistence

---

## Purpose

This project demonstrates how a lightweight monitoring dashboard can assist operators in identifying corrosion risk early and prioritizing maintenance actions efficiently.

