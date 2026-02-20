from fastapi import APIRouter

router = APIRouter()


@router.get("", summary="Health check")
def health() -> dict[str, str]:
    return {"status": "ok"}
