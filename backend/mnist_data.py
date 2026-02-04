from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import threading
from typing import Callable, Literal

import numpy as np
from sklearn.datasets import fetch_lfw_people, fetch_openml

DatasetName = Literal["mnist", "fashion-mnist", "faces-in-the-wild"]
DatasetSplit = Literal["train", "test", "all"]

DATA_ROOT = Path(__file__).resolve().parent / "data"
OPENML_DATA_HOME = DATA_ROOT / "openml"
LFW_DATA_HOME = DATA_ROOT / "lfw"

# MNIST and Fashion-MNIST publish 60k train + 10k test rows in order.
OPENML_TRAIN_COUNT = 60_000


@dataclass(frozen=True)
class DatasetSpec:
    source: DatasetName
    display_name: str
    default_split: DatasetSplit
    supports_train_test: bool
    loader: Callable[[], "RawDataset"]


@dataclass(frozen=True)
class RawDataset:
    source: DatasetName
    display_name: str
    images: np.ndarray
    labels: np.ndarray
    label_names: tuple[str, ...] | None
    supports_train_test: bool


@dataclass(frozen=True)
class DatasetView:
    source: DatasetName
    display_name: str
    split: DatasetSplit
    images: np.ndarray
    labels: np.ndarray
    label_names: tuple[str, ...] | None
    image_width: int
    image_height: int
    total_count: int


_cache_lock = threading.Lock()
_raw_dataset_cache: dict[DatasetName, RawDataset] = {}
_split_dataset_cache: dict[tuple[DatasetName, DatasetSplit], DatasetView] = {}


def _load_openml_square_dataset(
    source: DatasetName,
    display_name: str,
    openml_name: str,
) -> RawDataset:
    """
    Fetch and normalize an OpenML grayscale image dataset.

    @param source: Public dataset id used by this API.
    @param display_name: Human-readable dataset name.
    @param openml_name: Dataset name in OpenML.
    @returns: Prepared dataset with uint8 image grids and int labels.
    """
    bunch = fetch_openml(
        name=openml_name,
        version=1,
        as_frame=False,
        parser="liac-arff",
        data_home=str(OPENML_DATA_HOME),
    )
    flat_pixels = np.asarray(bunch.data)
    if flat_pixels.ndim != 2:
        raise ValueError(f"{display_name} payload must be 2D, got shape {flat_pixels.shape!r}")

    vector_length = int(flat_pixels.shape[1])
    edge = int(np.sqrt(vector_length))
    if edge * edge != vector_length:
        raise ValueError(
            f"{display_name} vectors are not square image grids (length={vector_length})."
        )

    images = np.clip(np.rint(flat_pixels), 0, 255).astype(np.uint8).reshape(-1, edge, edge)
    labels = _to_label_ids(np.asarray(bunch.target))
    return _prepare_raw_dataset(
        source=source,
        display_name=display_name,
        images=images,
        labels=labels,
        label_names=None,
        supports_train_test=True,
    )


def _load_lfw_dataset() -> RawDataset:
    """
    Fetch and normalize the LFW dataset as grayscale images.

    @returns: Prepared LFW dataset.
    """
    bunch = fetch_lfw_people(
        data_home=str(LFW_DATA_HOME),
        color=False,
        resize=1.0,
        download_if_missing=True,
    )
    lfw_images = np.asarray(bunch.images, dtype=np.float32)
    if np.max(lfw_images) <= 1.0:
        lfw_images = lfw_images * 255.0
    images = np.clip(np.rint(lfw_images), 0, 255).astype(np.uint8)
    labels = np.asarray(bunch.target, dtype=np.int64)
    label_names = tuple(str(name).replace("_", " ") for name in np.asarray(bunch.target_names))
    return _prepare_raw_dataset(
        source="faces-in-the-wild",
        display_name="faces in the wild",
        images=images,
        labels=labels,
        label_names=label_names,
        supports_train_test=False,
    )


DATASET_SPECS: dict[DatasetName, DatasetSpec] = {
    "mnist": DatasetSpec(
        source="mnist",
        display_name="mnist",
        default_split="train",
        supports_train_test=True,
        loader=lambda: _load_openml_square_dataset(
            source="mnist",
            display_name="mnist",
            openml_name="mnist_784",
        ),
    ),
    "fashion-mnist": DatasetSpec(
        source="fashion-mnist",
        display_name="fashion-mnist",
        default_split="train",
        supports_train_test=True,
        loader=lambda: _load_openml_square_dataset(
            source="fashion-mnist",
            display_name="fashion-mnist",
            openml_name="Fashion-MNIST",
        ),
    ),
    "faces-in-the-wild": DatasetSpec(
        source="faces-in-the-wild",
        display_name="faces in the wild",
        default_split="all",
        supports_train_test=False,
        loader=_load_lfw_dataset,
    ),
}


def available_datasets() -> list[dict[str, str]]:
    """
    List dataset options exposed by the API.

    @returns: Dataset metadata for UI selection controls.
    """
    return [
        {
            "id": spec.source,
            "displayName": spec.display_name,
            "defaultSplit": spec.default_split,
        }
        for spec in DATASET_SPECS.values()
    ]


def sample_dataset(
    count: int,
    dataset: str = "mnist",
    seed: int | None = None,
    split: str | None = None,
) -> dict:
    """
    Return JSON-ready image samples with grayscale byte pixels.

    @param count: Number of samples to return.
    @param dataset: Dataset id ("mnist"|"fashion-mnist"|"faces-in-the-wild").
    @param seed: Optional RNG seed for reproducible sampling.
    @param split: Optional split ("train"|"test"|"all"), validated per dataset.
    @returns: Serializable dict with metadata and sampled rows.
    """
    selected = get_dataset(dataset=dataset, split=split)
    total = selected.total_count
    safe_count = min(max(int(count), 1), total)

    rng = np.random.default_rng(seed)
    indices = rng.choice(total, size=safe_count, replace=False)
    pixels = selected.images[indices].reshape(safe_count, -1)

    samples: list[dict] = []
    for i, idx in enumerate(indices):
        label_id = int(selected.labels[idx])
        sample = {
            "index": int(idx),
            "label": label_id,
            "pixels": pixels[i].tolist(),
        }
        label_name = _resolve_label_name(selected.label_names, label_id)
        if label_name is not None:
            sample["labelName"] = label_name
        samples.append(sample)

    return {
        "source": selected.source,
        "displayName": selected.display_name,
        "split": selected.split,
        "imageWidth": selected.image_width,
        "imageHeight": selected.image_height,
        "totalCount": selected.total_count,
        "samples": samples,
    }


def get_dataset(dataset: str = "mnist", split: str | None = None) -> DatasetView:
    """
    Load and cache the requested dataset + split.

    @param dataset: Dataset id.
    @param split: Optional split selector.
    @returns: Cached dataset view.
    """
    spec = _get_dataset_spec(dataset)
    resolved_split = _resolve_split(spec, split)
    cache_key = (spec.source, resolved_split)

    cached = _split_dataset_cache.get(cache_key)
    if cached is not None:
        return cached

    with _cache_lock:
        cached = _split_dataset_cache.get(cache_key)
        if cached is not None:
            return cached

        raw_dataset = _raw_dataset_cache.get(spec.source)
        if raw_dataset is None:
            raw_dataset = spec.loader()
            _raw_dataset_cache[spec.source] = raw_dataset

        prepared = _prepare_dataset_view(raw_dataset, resolved_split)
        _split_dataset_cache[cache_key] = prepared
        return prepared


def _get_dataset_spec(dataset: str) -> DatasetSpec:
    normalized = dataset.strip().lower()
    spec = DATASET_SPECS.get(normalized)
    if spec is None:
        supported = ", ".join(DATASET_SPECS.keys())
        raise ValueError(f"dataset must be one of: {supported}")
    return spec


def _resolve_split(spec: DatasetSpec, split: str | None) -> DatasetSplit:
    if split is None:
        return spec.default_split

    normalized = split.strip().lower()
    if normalized not in {"train", "test", "all"}:
        raise ValueError("split must be 'train', 'test', or 'all'")

    if not spec.supports_train_test and normalized != "all":
        raise ValueError(f"split must be 'all' for dataset '{spec.source}'")

    return normalized  # type: ignore[return-value]


def _prepare_dataset_view(raw_dataset: RawDataset, split: DatasetSplit) -> DatasetView:
    sliced_images, sliced_labels = _slice_for_split(raw_dataset, split)
    if sliced_images.shape[0] == 0:
        raise ValueError(f"split '{split}' for dataset '{raw_dataset.source}' has no samples")

    image_height = int(sliced_images.shape[1])
    image_width = int(sliced_images.shape[2])

    return DatasetView(
        source=raw_dataset.source,
        display_name=raw_dataset.display_name,
        split=split,
        images=sliced_images,
        labels=sliced_labels,
        label_names=raw_dataset.label_names,
        image_width=image_width,
        image_height=image_height,
        total_count=int(sliced_images.shape[0]),
    )


def _slice_for_split(raw_dataset: RawDataset, split: DatasetSplit) -> tuple[np.ndarray, np.ndarray]:
    if not raw_dataset.supports_train_test:
        if split != "all":
            raise ValueError(f"split must be 'all' for dataset '{raw_dataset.source}'")
        return raw_dataset.images, raw_dataset.labels

    total = int(raw_dataset.images.shape[0])
    boundary = min(OPENML_TRAIN_COUNT, total)
    if split == "all":
        return raw_dataset.images, raw_dataset.labels
    if split == "train":
        return raw_dataset.images[:boundary], raw_dataset.labels[:boundary]
    return raw_dataset.images[boundary:], raw_dataset.labels[boundary:]


def _prepare_raw_dataset(
    source: DatasetName,
    display_name: str,
    images: np.ndarray,
    labels: np.ndarray,
    label_names: tuple[str, ...] | None,
    supports_train_test: bool,
) -> RawDataset:
    if images.ndim != 3:
        raise ValueError(f"{display_name} images must be shape (n, h, w), got {images.shape!r}")
    if labels.ndim != 1:
        raise ValueError(f"{display_name} labels must be shape (n,), got {labels.shape!r}")
    if images.shape[0] != labels.shape[0]:
        raise ValueError(f"{display_name} image/label counts do not match")
    if images.shape[0] == 0:
        raise ValueError(f"{display_name} contains no samples")

    return RawDataset(
        source=source,
        display_name=display_name,
        images=np.asarray(images, dtype=np.uint8),
        labels=np.asarray(labels, dtype=np.int64),
        label_names=label_names,
        supports_train_test=supports_train_test,
    )


def _to_label_ids(raw_labels: np.ndarray) -> np.ndarray:
    if raw_labels.dtype.kind in {"i", "u"}:
        return raw_labels.astype(np.int64, copy=False)
    if raw_labels.dtype.kind == "f":
        return np.rint(raw_labels).astype(np.int64)
    try:
        return raw_labels.astype(np.int64)
    except (TypeError, ValueError):
        _, inverse = np.unique(raw_labels.astype(str), return_inverse=True)
        return inverse.astype(np.int64, copy=False)


def _resolve_label_name(label_names: tuple[str, ...] | None, label_id: int) -> str | None:
    if label_names is None:
        return None
    if label_id < 0 or label_id >= len(label_names):
        return None
    return label_names[label_id]
