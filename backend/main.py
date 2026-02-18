import fastapi
from fastapi import FastAPI
app = fastapi.FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}