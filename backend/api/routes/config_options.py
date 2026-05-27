from fastapi import APIRouter
from config import AVAILABLE_MODELS, AVAILABLE_CHANNELS

router = APIRouter()


@router.get("/options")
async def get_options():
    return {"models": AVAILABLE_MODELS, "channels": AVAILABLE_CHANNELS}
