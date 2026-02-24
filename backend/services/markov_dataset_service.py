from __future__ import annotations

import logging
from fastapi import HTTPException

try:
    from .markov_dataset_extraction import (
        DEFAULT_DATASET_ID,
        DEFAULT_PRESET_ID,
        MarkovExtractOptions,
        extract_markov_subgraph,
        list_markov_dataset_catalog,
        list_markov_dataset_presets,
    )
except ImportError:
    from services.markov_dataset_extraction import (  # type: ignore
        DEFAULT_DATASET_ID,
        DEFAULT_PRESET_ID,
        MarkovExtractOptions,
        extract_markov_subgraph,
        list_markov_dataset_catalog,
        list_markov_dataset_presets,
    )

logger = logging.getLogger(__name__)


def markov_dataset_catalog_response() -> dict:
    """
    Return catalog metadata for Markov dataset extraction controls.
    """

    return list_markov_dataset_catalog()


def markov_dataset_presets_response(dataset_id: str) -> dict:
    """
    Return available extraction presets for a specific Markov dataset id.
    """

    try:
        return list_markov_dataset_presets(dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception("Failed to list presets for datasetId=%s", dataset_id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list presets for dataset '{dataset_id}': {exc.__class__.__name__}: {exc}",
        ) from exc


def markov_extract_response(
    *,
    dataset_id: str,
    preset_id: str | None,
    target_node_count: int | None,
    seed: int | None,
    dangling_handling: str | None,
) -> dict:
    """
    Run Markov dataset extraction and normalize failures to HTTP exceptions.
    """

    options = MarkovExtractOptions(
        dataset_id=dataset_id if dataset_id else DEFAULT_DATASET_ID,
        preset_id=preset_id if preset_id is not None else DEFAULT_PRESET_ID,
        target_node_count=target_node_count if target_node_count is not None else 200,
        seed=seed,
        dangling_handling=dangling_handling or "redistribute_uniform",
    )
    try:
        result = extract_markov_subgraph(options)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception(
            "Markov extraction failed for datasetId=%s presetId=%s",
            options.dataset_id,
            options.preset_id,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "Failed to extract Markov subgraph "
                f"for dataset '{options.dataset_id}' and preset '{options.preset_id}': "
                f"{exc.__class__.__name__}: {exc}"
            ),
        ) from exc

    return {
        "datasetId": result.dataset_id,
        "presetId": result.preset_id,
        "nodeIds": result.node_ids,
        "nodeLabels": result.node_labels,
        "transitionMatrix": result.transition_matrix,
        "initialVector": result.initial_vector,
        "currentVector": result.current_vector,
        "stats": {
            "selectedNodeCount": result.selected_node_count,
            "selectedEdgeCount": result.selected_edge_count,
            "danglingNodeCount": result.dangling_node_count,
        },
    }
