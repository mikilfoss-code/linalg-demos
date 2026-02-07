from __future__ import annotations

import logging
from fastapi import HTTPException

try:
    from ..datasets import available_datasets, sample_dataset
except ImportError:
    # Allow service imports when running from backend/ as root.
    from datasets import available_datasets, sample_dataset

logger = logging.getLogger(__name__)


def list_dataset_catalog() -> dict:
    """
    Build the dataset catalog response consumed by frontend selectors.
    """
    return {
        "defaultDataset": "mnist",
        "datasets": available_datasets(),
    }


def sample_dataset_response(
    dataset: str,
    count: int,
    split: str | None,
    seed: int | None,
) -> dict:
    """
    Execute dataset sampling and normalize exceptions to HTTP-friendly errors.
    """
    try:
        return sample_dataset(dataset=dataset, count=count, split=split, seed=seed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception("Dataset sampling failed for dataset=%s split=%s", dataset, split)
        split_suffix = f" (split='{split}')" if split is not None else ""
        detail = (
            f"Failed to load dataset '{dataset}'"
            f"{split_suffix}: "
            f"{exc.__class__.__name__}: {exc}"
        )
        raise HTTPException(status_code=500, detail=detail) from exc

