import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from .logging_config import setup_logging
from .routers import health, data, annotation, analysis, visualization, resolution, subcluster, chat

# Load environment variables from .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

app = FastAPI(title="cellpilot")
setup_logging()

# Allow renderer -> http://localhost:5173 or packaged file://
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "file://*",
        "*",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)

# Include all routers
app.include_router(health.router)
app.include_router(data.router)
app.include_router(annotation.router)
app.include_router(analysis.router)
app.include_router(visualization.router)
app.include_router(resolution.router)
app.include_router(subcluster.router)
app.include_router(chat.router)
