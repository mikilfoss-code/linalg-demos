from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

try:
    from ...services.markov_dataset_service import (
        markov_dataset_catalog_response,
        markov_dataset_presets_response,
        markov_extract_response,
    )
except ImportError:
    from services.markov_dataset_service import (  # type: ignore
        markov_dataset_catalog_response,
        markov_dataset_presets_response,
        markov_extract_response,
    )

router = APIRouter(prefix="/api/v1/markov", tags=["markov-datasets"])


@router.get("/datasets")
def markov_datasets() -> dict:
    """
    Return available Markov datasets and extraction presets.
    """

    return markov_dataset_catalog_response()


@router.get("/datasets/{dataset_id}/presets")
def markov_dataset_presets(dataset_id: str) -> dict:
    """
    Return extraction preset options for one Markov dataset.
    """

    return markov_dataset_presets_response(dataset_id)


@router.post("/datasets/{dataset_id}/extract")
def markov_dataset_extract(
    dataset_id: str,
    payload: dict | None = Body(default=None),
) -> dict:
    """
    Extract an instructional subgraph from the selected Markov dataset.
    """

    body = payload or {}
    preset_id = body.get("presetId")
    target_node_count = body.get("targetNodeCount")
    seed = body.get("seed")
    dangling_handling = body.get("danglingHandling")

    if target_node_count is not None:
        try:
            target_node_count = int(target_node_count)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="targetNodeCount must be an integer.") from exc
    if seed is not None:
        try:
            seed = int(seed)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="seed must be an integer.") from exc

    return markov_extract_response(
        dataset_id=dataset_id,
        preset_id=str(preset_id) if preset_id is not None else None,
        target_node_count=target_node_count,
        seed=seed,
        dangling_handling=str(dangling_handling) if dangling_handling is not None else None,
    )
