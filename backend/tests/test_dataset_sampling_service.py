import pytest
from fastapi import HTTPException

from backend.services import dataset_sampling


def test_list_dataset_catalog_shape():
    catalog = dataset_sampling.list_dataset_catalog()
    assert "defaultDataset" in catalog
    assert "datasets" in catalog
    assert isinstance(catalog["datasets"], list)


def test_sample_dataset_response_maps_value_error(monkeypatch):
    def raise_value_error(**_kwargs):
        raise ValueError("bad split")

    monkeypatch.setattr(dataset_sampling, "sample_dataset", raise_value_error)
    with pytest.raises(HTTPException) as exc:
        dataset_sampling.sample_dataset_response("mnist", 5, "bad", None)
    assert exc.value.status_code == 400
    assert "bad split" in str(exc.value.detail)


def test_sample_dataset_response_maps_unknown_errors(monkeypatch):
    def raise_runtime_error(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(dataset_sampling, "sample_dataset", raise_runtime_error)
    with pytest.raises(HTTPException) as exc:
        dataset_sampling.sample_dataset_response("mnist", 5, "train", None)
    assert exc.value.status_code == 500
    assert "Failed to load dataset 'mnist'" in str(exc.value.detail)

