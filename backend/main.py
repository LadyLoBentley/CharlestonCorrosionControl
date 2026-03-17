from contextlib import asynccontextmanager
from fastapi import FastAPI

from db.database import create_db_and_tables
from routers.sensors_router import router as sensor_router
from fastapi.middleware.cors import CORSMiddleware
from routers.sensor_reading_router import router as sensor_readings_router
from routers.sensors_router import router as sensor_router


@asynccontextmanager
async def lifespan(app:FastAPI):
    create_db_and_tables()
    yield
app = (FastAPI(lifespan=lifespan))
app.add_middleware(
    CORSMiddleware,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def health():
    return {"status": "ok"}

app.include_router(sensor_router, prefix="/api")
app.include_router(sensor_readings_router)