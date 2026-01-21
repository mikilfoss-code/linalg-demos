from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import gzip
import struct
import threading
import urllib.request
from typing import Literal

import numpy as np

MNIST_BASE_URL = "https://storage.googleapis.com/cvdf-datasets/mnist/"
MNIST_FILES = {
    "train": {
        "images": "train-images-idx3-ubyte.gz",
        "labels": "train-labels-idx1-ubyte.gz",
    },
    "test": {
        "images": "t10k-images-idx3-ubyte.gz",
        "labels": "t10k-labels-idx1-ubyte.gz",
    },
}

DATA_DIR = Path(__file__).resolve().parent / "data" / "mnist"
MnistSplit = Literal["train", "test"]

_cache_lock = threading.Lock()
_dataset_cache: dict[MnistSplit, "MnistDataset"] = {}


@dataclass(frozen=True)
class MnistDataset:
    images: np.ndarray
    labels: np.ndarray
    image_size: int
    total_count: int
    split: MnistSplit


def sample_mnist(count: int, seed: int | None = None, split: MnistSplit = "train") -> dict:
    """
    Return JSON-ready MNIST samples with pixel bytes and normalized vectors.

    @param count: Number of samples to return.
    @param seed: Optional RNG seed for reproducible sampling.
    @param split: Dataset split to sample from ("train" or "test").
    @returns: Serializable dict with metadata and samples.
    """
    dataset = get_dataset(split)
    total = dataset.total_count
    safe_count = min(max(int(count), 1), total)

    rng = np.random.default_rng(seed)
    indices = rng.choice(total, size=safe_count, replace=False)
    pixels = dataset.images[indices].reshape(safe_count, -1)
    vectors = pixels.astype(np.float32) / 255.0

    samples = []
    for i, idx in enumerate(indices):
        samples.append(
            {
                "index": int(idx),
                "label": int(dataset.labels[idx]),
                "pixels": pixels[i].tolist(),
                "vector": vectors[i].tolist(),
            }
        )

    return {
        "source": "mnist",
        "split": dataset.split,
        "imageSize": dataset.image_size,
        "totalCount": dataset.total_count,
        "samples": samples,
    }


def get_dataset(split: MnistSplit = "train") -> MnistDataset:
    """
    Load and cache the requested MNIST dataset split.

    @param split: Dataset split ("train" or "test").
    @returns: Cached MNIST dataset with images and labels.
    """
    if split not in MNIST_FILES:
        raise ValueError(f"Unsupported MNIST split: {split}")

    cached = _dataset_cache.get(split)
    if cached is not None:
        return cached

    with _cache_lock:
        cached = _dataset_cache.get(split)
        if cached is not None:
            return cached
        dataset = _load_dataset(split)
        _dataset_cache[split] = dataset
        return dataset


def _load_dataset(split: MnistSplit) -> MnistDataset:
    """
    Download and parse MNIST image/label files for a split.

    @param split: Dataset split ("train" or "test").
    @returns: Parsed MNIST dataset.
    """
    images_path = _ensure_file(MNIST_FILES[split]["images"])
    labels_path = _ensure_file(MNIST_FILES[split]["labels"])

    images = _read_images(images_path)
    labels = _read_labels(labels_path)

    if images.shape[0] != labels.shape[0]:
        raise ValueError("MNIST image/label counts do not match.")

    return MnistDataset(
        images=images,
        labels=labels,
        image_size=images.shape[1],
        total_count=images.shape[0],
        split=split,
    )


def _ensure_file(filename: str) -> Path:
    """
    Ensure an MNIST gzip file exists locally, downloading if missing.

    @param filename: MNIST gzip filename.
    @returns: Path to the local gzip file.
    """
    path = DATA_DIR / filename
    if path.exists():
        return path

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    url = f"{MNIST_BASE_URL}{filename}"
    _download_file(url, path)
    return path


def _download_file(url: str, path: Path) -> None:
    """
    Download a remote file to disk.

    @param url: Remote URL to fetch.
    @param path: Destination path.
    """
    with urllib.request.urlopen(url) as response, path.open("wb") as handle:
        handle.write(response.read())


def _read_images(path: Path) -> np.ndarray:
    """
    Parse MNIST image gzip file into a uint8 array.

    @param path: Path to gzip file.
    @returns: Array of shape (count, rows, cols).
    """
    with gzip.open(path, "rb") as handle:
        header = handle.read(16)
        magic, count, rows, cols = struct.unpack(">IIII", header)
        if magic != 2051:
            raise ValueError("Invalid MNIST image file header.")
        data = handle.read(count * rows * cols)

    images = np.frombuffer(data, dtype=np.uint8)
    return images.reshape(count, rows, cols)


def _read_labels(path: Path) -> np.ndarray:
    """
    Parse MNIST label gzip file into a uint8 array.

    @param path: Path to gzip file.
    @returns: Array of shape (count,).
    """
    with gzip.open(path, "rb") as handle:
        header = handle.read(8)
        magic, count = struct.unpack(">II", header)
        if magic != 2049:
            raise ValueError("Invalid MNIST label file header.")
        data = handle.read(count)

    return np.frombuffer(data, dtype=np.uint8)
