import pytest
from fastapi import HTTPException

from backend.services import dataset_sampling


def test_list_dataset_catalog_shape():
    """
    Purpose: verify dataset catalog response exposes required top-level fields.

    Inputs: no direct function inputs; reads catalog from service helper.
    Returns: no return value.
    Side effects: none.
    """
    catalog = dataset_sampling.list_dataset_catalog()
    assert "defaultDataset" in catalog
    assert "datasets" in catalog
    assert isinstance(catalog["datasets"], list)


def test_sample_dataset_response_maps_value_error(monkeypatch):
    """
    Purpose: ensure validation failures map to HTTP 400 responses.

    Inputs: pytest `monkeypatch` fixture used to stub dataset loader behavior.
    Returns: no return value.
    Side effects: temporarily patches `dataset_sampling.sample_dataset`.
    """
    def raise_value_error(**_kwargs):
        """
        Purpose: simulate a validation error from sampling internals.

        Inputs: keyword args ignored by the stub.
        Returns: no return value.
        Side effects: raises `ValueError`.
        """
        raise ValueError("bad split")

    monkeypatch.setattr(dataset_sampling, "sample_dataset", raise_value_error)
    with pytest.raises(HTTPException) as exc:
        dataset_sampling.sample_dataset_response("mnist", 5, "bad", None)
    assert exc.value.status_code == 400
    assert "bad split" in str(exc.value.detail)


def test_sample_dataset_response_maps_unknown_errors(monkeypatch):
    """
    Purpose: ensure unexpected failures map to HTTP 500 responses.

    Inputs: pytest `monkeypatch` fixture used to stub dataset loader behavior.
    Returns: no return value.
    Side effects: temporarily patches `dataset_sampling.sample_dataset`.
    """
    def raise_runtime_error(**_kwargs):
        """
        Purpose: simulate a non-validation runtime failure in sampling logic.

        Inputs: keyword args ignored by the stub.
        Returns: no return value.
        Side effects: raises `RuntimeError`.
        """
        raise RuntimeError("boom")

    monkeypatch.setattr(dataset_sampling, "sample_dataset", raise_runtime_error)
    with pytest.raises(HTTPException) as exc:
        dataset_sampling.sample_dataset_response("mnist", 5, "train", None)
    assert exc.value.status_code == 500
    assert "Failed to load dataset 'mnist'" in str(exc.value.detail)
