import os
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from mnist_data import sample_mnist

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
MAX_MNIST_SAMPLES = 64

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


@app.get("/api/v1/mnist/samples")
def mnist_samples(
    count: int = Query(24, ge=1, le=MAX_MNIST_SAMPLES),
    split: str = Query("train"),
    seed: int | None = Query(None, ge=0),
) -> dict:
    """
    Return random MNIST samples with pixel bytes and normalized vectors.

    @param count: Number of samples to return (1..MAX_MNIST_SAMPLES).
    @param split: Dataset split ("train" or "test").
    @param seed: Optional RNG seed for reproducible sampling.
    @returns: JSON payload containing MNIST samples and metadata.
    """
    if split not in ("train", "test"):
        raise HTTPException(status_code=400, detail="split must be 'train' or 'test'")
    return sample_mnist(count=count, seed=seed, split=split)
