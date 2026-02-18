import math

import pytest
from fastapi import HTTPException

from backend.main import markov_analyze


def test_markov_analyze_returns_expected_shape():
    """
    Purpose: verify success payload shape and key numeric invariants.

    Inputs: no direct function inputs; uses a valid Markov request payload.
    Returns: no return value.
    Side effects: none.
    """
    payload = {
        "transitionMatrix": [
            [0.7, 0.2, 0.1],
            [0.25, 0.6, 0.15],
            [0.2, 0.25, 0.55],
        ],
        "initialVector": [1.0, 0.0, 0.0],
        "currentVector": [0.4, 0.35, 0.25],
    }

    result = markov_analyze(payload)

    assert result["isRowStochastic"] is True
    assert len(result["rowSums"]) == 3
    assert len(result["nextVector"]) == 3
    assert len(result["stationaryDistribution"]) == 3
    assert math.isclose(sum(result["stationaryDistribution"]), 1.0, rel_tol=1e-8, abs_tol=1e-8)
    assert isinstance(result["stationaryResidual"], float)
    assert result["spectralGap"] is None or result["spectralGap"] >= 0
    assert len(result["eigenvalues"]) == 3
    for value in result["eigenvalues"]:
        assert set(value.keys()) == {"real", "imag", "magnitude"}


def test_markov_analyze_rejects_non_stochastic_rows():
    """
    Purpose: verify non-row-stochastic matrices are rejected with HTTP 400.

    Inputs: no direct function inputs; uses an invalid transition matrix payload.
    Returns: no return value.
    Side effects: none.
    """
    payload = {
        "transitionMatrix": [
            [0.8, 0.3],
            [0.1, 0.9],
        ],
        "initialVector": [1.0, 0.0],
        "currentVector": [1.0, 0.0],
    }

    with pytest.raises(HTTPException) as exc:
        markov_analyze(payload)

    assert exc.value.status_code == 400
    assert "rows must each sum to 1" in str(exc.value.detail)


def test_markov_analyze_rejects_invalid_probability_vector():
    """
    Purpose: verify invalid probability vectors are rejected with HTTP 400.

    Inputs: no direct function inputs; uses an invalid initial vector payload.
    Returns: no return value.
    Side effects: none.
    """
    payload = {
        "transitionMatrix": [
            [0.7, 0.3],
            [0.2, 0.8],
        ],
        "initialVector": [0.8, 0.1],
        "currentVector": [1.0, 0.0],
    }

    with pytest.raises(HTTPException) as exc:
        markov_analyze(payload)

    assert exc.value.status_code == 400
    assert "initialVector must sum to 1" in str(exc.value.detail)
