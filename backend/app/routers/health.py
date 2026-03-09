from fastapi import APIRouter, HTTPException
import logging

router = APIRouter(
  prefix="/health",
  tags=["health"]
)


@router.get("/ping")
def ping() -> dict: 
    logger = logging.getLogger("health_logger")
    logger.info("getting health")
    return {"ok": True}