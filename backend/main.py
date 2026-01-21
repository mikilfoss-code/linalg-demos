import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def _cors_origins() -> list[str]:
    """
    Comma-separated list of origins, e.g.
      CORS_ALLOW_ORIGINS=http://localhost:5173,https://your-site.onrender.com

    If unset or "*", allow all (fine for public, no-auth demo APIs).
    """
    raw = os.getenv("CORS_ALLOW_ORIGINS", "*").strip()
    if not raw or raw == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="Linear Algebra Demos API", version="0.1.0")

origins = _cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/v1/info")
def info() -> dict:
    return {
        "service": "linalg-demos-backend",
        "version": app.version,
    }
