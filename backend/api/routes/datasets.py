from __future__ import annotations

from fastapi import APIRouter, Query

try:
    from ...services.dataset_sampling import (
        list_dataset_catalog,
        sample_dataset_response,
    )
except ImportError:
    # Allow imports when running from backend/ as root.
    from services.dataset_sampling import list_dataset_catalog, sample_dataset_response

router = APIRouter(prefix="/api/v1", tags=["datasets"])
MAX_DATASET_SAMPLES = 64


@router.get("/datasets")
def datasets() -> dict:
    """
    Return dataset metadata for frontend selection controls.
    """
    return list_dataset_catalog()


@router.get("/datasets/samples")
def dataset_samples(
    dataset: str = Query("mnist"),
    count: int = Query(24, ge=1, le=MAX_DATASET_SAMPLES),
    split: str | None = Query(None),
    seed: int | None = Query(None, ge=0),
) -> dict:
    """
    Return random dataset samples (image or text).

    @param dataset: Dataset id.
    @param count: Number of samples to return (1..MAX_DATASET_SAMPLES).
    @param split: Optional split ("train"|"test"|"all"), validated by dataset.
    @param seed: Optional RNG seed for reproducible sampling.
    @returns: JSON payload containing sampled rows and metadata.
    """
    return sample_dataset_response(dataset=dataset, count=count, split=split, seed=seed)

