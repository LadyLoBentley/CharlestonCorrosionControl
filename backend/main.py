from contextlib import asynccontextmanager
from fastapi import FastAPI

from db.database import create_db_and_tables
from fastapi.middleware.cors import CORSMiddleware
from routers.sensor_reading_router import router as sensor_readings_router
from routers.sensors_router import router as sensor_router
from routers.corrosion_router import router as corrosion_router
from routers.locations_router import router as locations_router


@asynccontextmanager
async def lifespan(app:FastAPI):
    create_db_and_tables()
    yield
app = FastAPI(lifespan=lifespan)

# Single CORS middleware. The previous setup added CORSMiddleware twice — the
# first call with no args defaulted to allow_methods=("GET",), which broke
# DELETE/PATCH preflight requests from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
def health():
    return {"status": "ok"}

app.include_router(sensor_router, prefix="/api")
app.include_router(locations_router, prefix="/api")
app.include_router(sensor_readings_router)

app.include_router(corrosion_router)