import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

try:
    from .api.routes.datasets import router as datasets_router
except ImportError:
    # Allow `uvicorn main:app` when running from backend/.
    from api.routes.datasets import router as datasets_router

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
app.include_router(datasets_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/v1/info")
def info() -> dict:
    return {
        "service": "linalg-demos-backend",
        "version": app.version,
    }


def _validate_matrix(raw_matrix: object) -> np.ndarray:
    """
    Validate and coerce a request matrix into a finite float64 ndarray.
    """
    if not isinstance(raw_matrix, list) or not raw_matrix:
        raise ValueError("matrix must be a non-empty 2D array")

    normalized_rows: list[list[float]] = []
    for row in raw_matrix:
        if not isinstance(row, list) or not row:
            raise ValueError("matrix rows must be non-empty arrays")
        try:
            normalized_row = [float(value) for value in row]
        except (TypeError, ValueError) as exc:
            raise ValueError("matrix entries must be numbers") from exc
        normalized_rows.append(normalized_row)

    column_count = len(normalized_rows[0])
    if any(len(row) != column_count for row in normalized_rows):
        raise ValueError("matrix rows must all have the same length")

    matrix = np.asarray(normalized_rows, dtype=np.float64)
    if not np.isfinite(matrix).all():
        raise ValueError("matrix entries must be finite numbers")
    return matrix


def _validate_vector(raw_vector: object, expected_length: int) -> np.ndarray:
    """
    Validate and coerce a request vector into a finite float64 ndarray.
    """
    if not isinstance(raw_vector, list) or not raw_vector:
        raise ValueError("vector must be a non-empty array")
    try:
        vector = np.asarray([float(value) for value in raw_vector], dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise ValueError("vector entries must be numbers") from exc

    if vector.ndim != 1:
        raise ValueError("vector must be a 1D array")
    if vector.shape[0] != expected_length:
        raise ValueError(
            f"vector length ({vector.shape[0]}) must match matrix column count ({expected_length})"
        )
    if not np.isfinite(vector).all():
        raise ValueError("vector entries must be finite numbers")
    return vector


@app.post("/api/v1/matrix/apply")
def matrix_apply(payload: dict) -> dict:
    """
    Apply a matrix to a vector and return the resulting vector.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")

    try:
        matrix = _validate_matrix(payload.get("matrix"))
        vector = _validate_vector(payload.get("vector"), expected_length=matrix.shape[1])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = matrix @ vector
    return {"result": result.astype(float).tolist()}


@app.post("/api/v1/matrix/eig")
def matrix_eig(payload: dict) -> dict:
    """
    Compute eigenvalues and eigenvectors for a real-valued square matrix.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")

    try:
        matrix = _validate_matrix(payload.get("matrix"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if matrix.shape[0] != matrix.shape[1]:
        raise HTTPException(status_code=400, detail="matrix must be square")

    try:
        eigenvalues, eigenvectors = np.linalg.eig(matrix)
    except np.linalg.LinAlgError as exc:
        raise HTTPException(status_code=400, detail=f"unable to compute eigendecomposition: {exc}") from exc

    # Keep the contract real-valued for current frontends.
    if np.any(np.abs(np.imag(eigenvalues)) > 1e-9) or np.any(np.abs(np.imag(eigenvectors)) > 1e-9):
        raise HTTPException(
            status_code=400,
            detail="matrix has complex eigenvalues/eigenvectors; only real-valued results are supported",
        )

    return {
        "eigenvalues": np.real(eigenvalues).astype(float).tolist(),
        "eigenvectors": np.real(eigenvectors).astype(float).tolist(),
    }
