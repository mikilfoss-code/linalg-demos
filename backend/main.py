import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

PROBABILITY_TOLERANCE = 1e-6

try:
    from .api.routes.datasets import router as datasets_router
except ImportError:
    # Allow `uvicorn main:app` when running from backend/.
    from api.routes.datasets import router as datasets_router

def _cors_origins() -> list[str]:
    """
    Resolve the CORS allowlist from the environment.

    Reads `CORS_ALLOW_ORIGINS` as a comma-separated list and normalizes each
    entry by trimming whitespace.

    Returns:
        A list of allowed origins. Returns `["*"]` when unset or explicitly
        configured as `"*"`.
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
    """
    Return a liveness response for container/service health checks.

    Returns:
        A JSON object with a stable `"ok"` status.
    """
    return {"status": "ok"}


@app.get("/api/v1/info")
def info() -> dict:
    """
    Return basic service metadata for frontend diagnostics.

    Returns:
        A JSON object containing the service identifier and backend version.
    """
    return {
        "service": "linalg-demos-backend",
        "version": app.version,
    }


def _validate_matrix(raw_matrix: object) -> np.ndarray:
    """
    Validate and coerce a request matrix into a finite float64 ndarray.

    Args:
        raw_matrix: Untrusted request payload expected to be a non-empty
            two-dimensional numeric array.

    Returns:
        A finite `numpy.ndarray` with dtype `float64`.

    Raises:
        ValueError: If structure, shape, or numeric constraints are invalid.
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

    Args:
        raw_vector: Untrusted request payload expected to be a non-empty
            one-dimensional numeric array.
        expected_length: Required vector length, usually matrix column count.

    Returns:
        A finite one-dimensional `numpy.ndarray` with dtype `float64`.

    Raises:
        ValueError: If shape, length, or numeric constraints are invalid.
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


def _validate_probability_vector(
    raw_vector: object, expected_length: int, vector_name: str
) -> np.ndarray:
    """
    Validate a probability vector (finite, non-negative, sums to 1).

    Args:
        raw_vector: Untrusted vector payload.
        expected_length: Required vector length.
        vector_name: Human-readable vector name for error messages.

    Returns:
        Probability vector as finite float64 ndarray.

    Raises:
        ValueError: If any probability constraints are violated.
    """
    vector = _validate_vector(raw_vector, expected_length)

    if np.any(vector < -PROBABILITY_TOLERANCE):
        raise ValueError(f"{vector_name} entries must be non-negative")

    vector_sum = float(np.sum(vector))
    if abs(vector_sum - 1.0) > PROBABILITY_TOLERANCE:
        raise ValueError(f"{vector_name} must sum to 1")

    return vector


def _validate_row_stochastic_matrix(matrix: np.ndarray) -> np.ndarray:
    """
    Validate that a matrix is square, non-negative, and row-stochastic.

    Args:
        matrix: Numeric matrix from request payload.

    Returns:
        Row-sum diagnostics for each matrix row.

    Raises:
        ValueError: If matrix is not a valid row-stochastic transition matrix.
    """
    if matrix.shape[0] != matrix.shape[1]:
        raise ValueError("transitionMatrix must be square")

    if np.any(matrix < -PROBABILITY_TOLERANCE):
        raise ValueError("transitionMatrix entries must be non-negative")

    row_sums = matrix.sum(axis=1)
    if not np.all(np.abs(row_sums - 1.0) <= PROBABILITY_TOLERANCE):
        bad_rows = [index + 1 for index, row_sum in enumerate(row_sums) if abs(row_sum - 1.0) > PROBABILITY_TOLERANCE]
        raise ValueError(
            "transitionMatrix rows must each sum to 1 "
            f"(failed rows: {bad_rows})"
        )

    return row_sums


def _step_markov_vector(current_vector: np.ndarray, transition_matrix: np.ndarray) -> np.ndarray:
    """
    Compute one Markov step using row-vector convention: x_{t+1} = x_t P.

    Args:
        current_vector: Current probability distribution row-vector.
        transition_matrix: Row-stochastic transition matrix.

    Returns:
        The next probability distribution vector.
    """
    next_vector = current_vector @ transition_matrix
    # Numerical guard to remove tiny negatives from floating-point noise.
    next_vector = np.clip(next_vector, 0.0, None)
    total = float(np.sum(next_vector))
    if total <= PROBABILITY_TOLERANCE:
        return next_vector
    return next_vector / total


def _stationary_distribution(transition_matrix: np.ndarray) -> tuple[np.ndarray, float]:
    """
    Approximate a stationary distribution via eigendecomposition of P^T.

    Args:
        transition_matrix: Row-stochastic transition matrix.

    Returns:
        A tuple containing the stationary distribution and an L1 residual.

    Raises:
        ValueError: If stationary distribution cannot be resolved.
    """
    try:
        eigenvalues_t, eigenvectors_t = np.linalg.eig(transition_matrix.T)
    except np.linalg.LinAlgError as exc:
        raise ValueError(f"unable to compute stationary distribution: {exc}") from exc

    target_index = int(np.argmin(np.abs(eigenvalues_t - 1.0)))
    candidate = np.real(eigenvectors_t[:, target_index])
    candidate = np.clip(candidate, 0.0, None)

    candidate_sum = float(np.sum(candidate))
    if candidate_sum <= PROBABILITY_TOLERANCE:
        candidate = np.abs(np.real(eigenvectors_t[:, target_index]))
        candidate_sum = float(np.sum(candidate))

    if candidate_sum <= PROBABILITY_TOLERANCE:
        raise ValueError("unable to resolve a valid stationary distribution")

    stationary = candidate / candidate_sum
    residual = float(np.linalg.norm((stationary @ transition_matrix) - stationary, ord=1))
    return stationary, residual


def _serialize_complex(value: complex) -> dict:
    """
    Serialize a complex scalar as real/imag/magnitude components.
    """
    return {
        "real": float(np.real(value)),
        "imag": float(np.imag(value)),
        "magnitude": float(np.abs(value)),
    }


@app.post("/api/v1/matrix/apply")
def matrix_apply(payload: dict) -> dict:
    """
    Apply a matrix to a vector and return the resulting vector.

    Args:
        payload: Request JSON expected to include `"matrix"` and `"vector"`.

    Returns:
        A JSON object containing the transformed vector in `"result"`.

    Raises:
        HTTPException: With status 400 when payload validation fails.
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

    Args:
        payload: Request JSON expected to include `"matrix"`.

    Returns:
        A JSON object containing real-valued `"eigenvalues"` and
        `"eigenvectors"`.

    Raises:
        HTTPException: With status 400 when validation fails, the matrix is not
            square, eigendecomposition fails, or results are complex-valued.
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


@app.post("/api/v1/markov/analyze")
def markov_analyze(payload: dict) -> dict:
    """
    Analyze a user-defined Markov chain.

    Request body fields:
        - transitionMatrix: row-stochastic matrix P
        - initialVector: initial distribution x0
        - currentVector: current distribution xt

    Returns:
        Diagnostics and analysis values used by the Markov demo frontend.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="request body must be a JSON object")

    try:
        transition_matrix = _validate_matrix(payload.get("transitionMatrix"))
        row_sums = _validate_row_stochastic_matrix(transition_matrix)
        _validate_probability_vector(
            payload.get("initialVector"),
            expected_length=transition_matrix.shape[0],
            vector_name="initialVector",
        )
        current_vector = _validate_probability_vector(
            payload.get("currentVector"),
            expected_length=transition_matrix.shape[0],
            vector_name="currentVector",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        next_vector = _step_markov_vector(current_vector, transition_matrix)
        stationary_distribution, stationary_residual = _stationary_distribution(transition_matrix)
        eigenvalues = np.linalg.eigvals(transition_matrix)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except np.linalg.LinAlgError as exc:
        raise HTTPException(status_code=400, detail=f"unable to analyze chain: {exc}") from exc

    magnitudes = np.abs(eigenvalues)
    spectral_gap: float | None = None
    if magnitudes.size > 1:
        sorted_magnitudes = np.sort(magnitudes)[::-1]
        spectral_gap = float(max(0.0, 1.0 - sorted_magnitudes[1]))

    return {
        "isRowStochastic": True,
        "rowSums": row_sums.astype(float).tolist(),
        "nextVector": next_vector.astype(float).tolist(),
        "stationaryDistribution": stationary_distribution.astype(float).tolist(),
        "stationaryResidual": stationary_residual,
        "spectralGap": spectral_gap,
        "eigenvalues": [_serialize_complex(value) for value in eigenvalues],
    }
