from __future__ import annotations

from dataclasses import dataclass
import gzip
from pathlib import Path
import threading
from collections import deque
from typing import Callable, Literal
import re
import shutil
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import numpy as np
from scipy import sparse

MarkovDatasetId = Literal["web-google"]
MarkovPresetId = Literal[
    "balanced_instructional",
    "community_lens",
    "authority_hub_contrast",
    "dangling_stress",
    "random_baseline",
]
DanglingHandling = Literal["redistribute_uniform", "self_loop"]

DEFAULT_DATASET_ID: MarkovDatasetId = "web-google"
DEFAULT_PRESET_ID: MarkovPresetId = "balanced_instructional"
DEFAULT_TARGET_NODE_COUNT = 30
MIN_TARGET_NODE_COUNT = 20
MAX_TARGET_NODE_COUNT = 320
MAX_BFS_DEPTH = 4
PAGERANK_DAMPING = 0.85
PAGERANK_MAX_ITER = 35
PAGERANK_TOLERANCE = 1e-10
INTEGRITY_MIN_NODE_RATIO = 0.95
INTEGRITY_MIN_EDGE_RATIO = 0.85
WEB_GOOGLE_DATASET_PAGE_URL = "https://snap.stanford.edu/data/web-Google.html"
WEB_GOOGLE_FALLBACK_DOWNLOAD_URL = "https://snap.stanford.edu/data/web-Google.txt.gz"
WEB_GOOGLE_DOWNLOAD_TIMEOUT_SECONDS = 120


@dataclass(frozen=True)
class MarkovDatasetInfo:
    """
    Metadata used by frontend dataset selectors.
    """

    id: MarkovDatasetId
    label: str
    directed: bool
    node_count: int
    edge_count: int


@dataclass(frozen=True)
class MarkovPresetInfo:
    """
    Metadata used by frontend preset selectors.
    """

    id: MarkovPresetId
    label: str
    description: str


@dataclass(frozen=True)
class MarkovExtractOptions:
    """
    Request options for extracting an instructional subgraph.
    """

    dataset_id: MarkovDatasetId
    preset_id: MarkovPresetId
    target_node_count: int
    seed: int | None
    dangling_handling: DanglingHandling


@dataclass(frozen=True)
class DirectedGraphStore:
    """
    Sparse graph store backing extraction strategies.
    """

    dataset_id: MarkovDatasetId
    node_count: int
    edge_count: int
    csr: sparse.csr_matrix
    csc: sparse.csc_matrix
    out_degree: np.ndarray
    in_degree: np.ndarray
    active_nodes: np.ndarray
    largest_weak_component_nodes: np.ndarray
    candidate_nodes: np.ndarray
    candidate_mask: np.ndarray
    pagerank: np.ndarray
    node_labels_by_id: dict[int, str] | None


@dataclass(frozen=True)
class MarkovExtractResult:
    """
    Serializable extraction result consumed by the Markov frontend.
    """

    dataset_id: MarkovDatasetId
    preset_id: MarkovPresetId
    node_ids: list[int]
    node_labels: list[str]
    transition_matrix: list[list[float]]
    initial_vector: list[float]
    current_vector: list[float]
    selected_node_count: int
    selected_edge_count: int
    dangling_node_count: int


@dataclass(frozen=True)
class _PresetContext:
    graph: DirectedGraphStore
    target_count: int
    rng: np.random.Generator


WEB_GOOGLE_DATASET_INFO = MarkovDatasetInfo(
    id="web-google",
    label="Google web graph (SNAP)",
    directed=True,
    node_count=875_713,
    edge_count=5_105_039,
)

DATASET_INFO_BY_ID: dict[MarkovDatasetId, MarkovDatasetInfo] = {
    "web-google": WEB_GOOGLE_DATASET_INFO,
}

PRESET_CATALOG: tuple[MarkovPresetInfo, ...] = (
    MarkovPresetInfo(
        id="balanced_instructional",
        label="Balanced instructional",
        description="Mixes hubs, authorities, bridges, and dangling nodes.",
    ),
    MarkovPresetInfo(
        id="community_lens",
        label="Community lens",
        description="Focuses on dense local neighborhoods and boundary nodes.",
    ),
    MarkovPresetInfo(
        id="authority_hub_contrast",
        label="Authority-hub contrast",
        description="Contrasts high out-degree hubs with high in-degree authorities.",
    ),
    MarkovPresetInfo(
        id="dangling_stress",
        label="Dangling stress",
        description="Emphasizes dangling/sink behavior and feeding structure.",
    ),
    MarkovPresetInfo(
        id="random_baseline",
        label="Random baseline",
        description="Unbiased baseline sample from active nodes.",
    ),
)

_GRAPH_CACHE_LOCK = threading.Lock()
_GRAPH_CACHE: dict[MarkovDatasetId, DirectedGraphStore] = {}


def list_markov_dataset_catalog() -> dict:
    """
    Return Markov dataset and preset metadata for frontend controls.
    """

    return {
        "defaultDatasetId": DEFAULT_DATASET_ID,
        "defaultPresetId": DEFAULT_PRESET_ID,
        "datasets": [
            {
                "id": dataset_info.id,
                "label": dataset_info.label,
                "directed": dataset_info.directed,
                "nodeCount": dataset_info.node_count,
                "edgeCount": dataset_info.edge_count,
            }
            for dataset_info in DATASET_INFO_BY_ID.values()
        ],
        "presets": [
            {
                "id": preset.id,
                "label": preset.label,
                "description": preset.description,
            }
            for preset in PRESET_CATALOG
        ],
    }


def list_markov_dataset_presets(dataset_id: str) -> dict:
    """
    Return preset metadata for a specific dataset id.
    """

    normalized_dataset_id = _validate_dataset_id(dataset_id)
    return {
        "datasetId": normalized_dataset_id,
        "defaultPresetId": DEFAULT_PRESET_ID,
        "presets": [
            {
                "id": preset.id,
                "label": preset.label,
                "description": preset.description,
            }
            for preset in PRESET_CATALOG
        ],
    }


def extract_markov_subgraph(
    options: MarkovExtractOptions,
    graph_override: DirectedGraphStore | None = None,
) -> MarkovExtractResult:
    """
    Extract a pedagogical subgraph and return Markov-ready matrix/vector payloads.
    """

    dataset_id = _validate_dataset_id(options.dataset_id)
    preset_id = _validate_preset_id(options.preset_id)
    target_count = _clamp_target_node_count(options.target_node_count)
    dangling_handling = _validate_dangling_handling(options.dangling_handling)
    rng = np.random.default_rng(options.seed if options.seed is not None else 0)

    graph = (
        graph_override if graph_override is not None else _get_graph_store(dataset_id)
    )
    if graph.node_count <= 1:
        raise ValueError("Dataset graph must contain at least two nodes.")

    strategy = _PRESET_REGISTRY[preset_id]
    selected_nodes = strategy(
        _PresetContext(
            graph=graph,
            target_count=target_count,
            rng=rng,
        )
    )
    if len(selected_nodes) < 2:
        raise ValueError("Failed to extract at least two nodes from dataset.")

    (
        transition_matrix,
        selected_edge_count,
        dangling_node_count,
    ) = _build_induced_transition_matrix(
        graph=graph,
        node_ids=selected_nodes,
        dangling_handling=dangling_handling,
    )

    selected_node_count = len(selected_nodes)
    node_labels = _resolve_selected_node_labels(graph=graph, node_ids=selected_nodes)
    uniform_probability = 1.0 / selected_node_count
    initial_vector = [uniform_probability for _ in range(selected_node_count)]
    current_vector = [uniform_probability for _ in range(selected_node_count)]

    return MarkovExtractResult(
        dataset_id=dataset_id,
        preset_id=preset_id,
        node_ids=selected_nodes,
        node_labels=node_labels,
        transition_matrix=transition_matrix,
        initial_vector=initial_vector,
        current_vector=current_vector,
        selected_node_count=selected_node_count,
        selected_edge_count=selected_edge_count,
        dangling_node_count=dangling_node_count,
    )


def get_web_google_path() -> Path:
    """
    Resolve supported local web-Google file paths.
    """

    data_root = Path(__file__).resolve().parents[1] / "data"
    candidates = (
        data_root / "web-google" / "web-Google.txt.gz",
        data_root / "web-google" / "web-Google.txt",
        data_root / "markov" / "web-google" / "web-Google.txt.gz",
        data_root / "markov" / "web-google" / "web-Google.txt",
        data_root / "markov" / "web-Google.txt.gz",
        data_root / "markov" / "web-Google.txt",
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate

    primary_download_path = data_root / "web-google" / "web-Google.txt.gz"
    try:
        downloaded_path = _download_web_google_dataset(primary_download_path)
        if downloaded_path.exists():
            return downloaded_path
    except Exception as exc:
        formatted_candidates = "\n- ".join(str(path) for path in candidates)
        raise ValueError(
            "web-Google dataset file not found and automatic download failed. "
            "Place web-Google.txt or web-Google.txt.gz in one of:\n- "
            f"{formatted_candidates}\n"
            f"Download source: {WEB_GOOGLE_DATASET_PAGE_URL}\n"
            f"Download error: {exc}"
        ) from exc

    formatted_candidates = "\n- ".join(str(path) for path in candidates)
    raise ValueError(
        "web-Google dataset file not found. Place web-Google.txt or web-Google.txt.gz in one of:\n- "
        f"{formatted_candidates}"
    )


def _download_web_google_dataset(destination: Path) -> Path:
    """
    Download the SNAP web-Google edge list when it is not already cached locally.
    """

    destination.parent.mkdir(parents=True, exist_ok=True)
    download_url = _resolve_web_google_download_url()
    request = Request(
        download_url, headers={"User-Agent": "linalg-markov-dataset-loader/1.0"}
    )
    with urlopen(request, timeout=WEB_GOOGLE_DOWNLOAD_TIMEOUT_SECONDS) as response:
        with destination.open("wb") as output_file:
            shutil.copyfileobj(response, output_file)
    if not destination.exists() or destination.stat().st_size <= 0:
        raise ValueError(f"Downloaded dataset is empty: {destination}")
    return destination


def _resolve_web_google_download_url() -> str:
    """
    Resolve the direct SNAP download link from the dataset page, with a stable fallback.
    """

    request = Request(
        WEB_GOOGLE_DATASET_PAGE_URL,
        headers={"User-Agent": "linalg-markov-dataset-loader/1.0"},
    )
    try:
        with urlopen(request, timeout=WEB_GOOGLE_DOWNLOAD_TIMEOUT_SECONDS) as response:
            html = response.read().decode("utf-8", errors="ignore")
    except Exception:
        return WEB_GOOGLE_FALLBACK_DOWNLOAD_URL

    match = re.search(
        r'href=["\']([^"\']*web-Google\\.txt\\.gz[^"\']*)["\']', html, re.IGNORECASE
    )
    if not match:
        return WEB_GOOGLE_FALLBACK_DOWNLOAD_URL
    return urljoin(WEB_GOOGLE_DATASET_PAGE_URL, match.group(1))


def _get_graph_store(dataset_id: MarkovDatasetId) -> DirectedGraphStore:
    cached = _GRAPH_CACHE.get(dataset_id)
    if cached is not None:
        return cached

    with _GRAPH_CACHE_LOCK:
        cached = _GRAPH_CACHE.get(dataset_id)
        if cached is not None:
            return cached
        graph = _load_web_google_graph(get_web_google_path())
        _GRAPH_CACHE[dataset_id] = graph
        return graph


def _load_web_google_graph(path: Path) -> DirectedGraphStore:
    source_nodes: list[int] = []
    target_nodes: list[int] = []
    max_node_id = -1

    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt", encoding="utf-8", errors="ignore") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 2 and "," in line:
                parts = [segment.strip() for segment in line.split(",")]
            if len(parts) < 2:
                continue
            try:
                source = int(parts[0])
                target = int(parts[1])
            except ValueError:
                continue
            if source < 0 or target < 0:
                continue
            source_nodes.append(source)
            target_nodes.append(target)
            if source > max_node_id:
                max_node_id = source
            if target > max_node_id:
                max_node_id = target

    if max_node_id < 1:
        raise ValueError("web-Google dataset appears empty.")

    node_count = max_node_id + 1
    edges = len(source_nodes)
    data = np.ones(edges, dtype=np.float32)
    csr = sparse.csr_matrix(
        (data, (np.asarray(source_nodes), np.asarray(target_nodes))),
        shape=(node_count, node_count),
        dtype=np.float32,
    )
    csr.sum_duplicates()
    csr.setdiag(0)
    csr.eliminate_zeros()
    csc = csr.tocsc()
    out_degree = np.diff(csr.indptr).astype(np.int64, copy=False)
    in_degree = np.diff(csc.indptr).astype(np.int64, copy=False)
    active_nodes = np.flatnonzero((out_degree + in_degree) > 0).astype(
        np.int64, copy=False
    )
    largest_weak_component_nodes = _largest_weak_component_nodes(csr)
    candidate_mask = np.zeros(node_count, dtype=bool)
    candidate_mask[largest_weak_component_nodes] = True
    candidate_nodes = np.flatnonzero(
        candidate_mask & ((out_degree + in_degree) > 0)
    ).astype(np.int64, copy=False)
    pagerank = _compute_pagerank(csr=csr, out_degree=out_degree)
    _validate_web_google_integrity(node_count=node_count, edge_count=int(csr.nnz))

    return DirectedGraphStore(
        dataset_id="web-google",
        node_count=node_count,
        edge_count=int(csr.nnz),
        csr=csr,
        csc=csc,
        out_degree=out_degree,
        in_degree=in_degree,
        active_nodes=active_nodes,
        largest_weak_component_nodes=largest_weak_component_nodes,
        candidate_nodes=candidate_nodes,
        candidate_mask=candidate_mask,
        pagerank=pagerank,
        node_labels_by_id=None,
    )


def _largest_weak_component_nodes(csr: sparse.csr_matrix) -> np.ndarray:
    """
    Compute node ids belonging to the largest weakly connected component.
    """

    undirected = (csr + csr.T).astype(np.float32)
    undirected.data = np.ones_like(undirected.data, dtype=np.float32)
    undirected.eliminate_zeros()
    component_count, labels = sparse.csgraph.connected_components(
        undirected, directed=False, return_labels=True
    )
    if component_count <= 1:
        return np.arange(csr.shape[0], dtype=np.int64)
    counts = np.bincount(labels)
    largest_label = int(np.argmax(counts))
    return np.flatnonzero(labels == largest_label).astype(np.int64, copy=False)


def _compute_pagerank(csr: sparse.csr_matrix, out_degree: np.ndarray) -> np.ndarray:
    """
    Compute PageRank scores over the directed graph using power iteration.
    """

    node_count = csr.shape[0]
    if node_count <= 0:
        return np.asarray([], dtype=np.float64)

    rank = np.full(node_count, 1.0 / node_count, dtype=np.float64)
    inv_out_degree = np.zeros(node_count, dtype=np.float64)
    positive_out = out_degree > 0
    inv_out_degree[positive_out] = 1.0 / out_degree[positive_out]
    dangling_mask = ~positive_out
    teleport = (1.0 - PAGERANK_DAMPING) / node_count

    for _ in range(PAGERANK_MAX_ITER):
        weighted = rank * inv_out_degree
        incoming_mass = csr.T @ weighted
        dangling_mass = float(np.sum(rank[dangling_mask])) / node_count
        next_rank = teleport + PAGERANK_DAMPING * (incoming_mass + dangling_mass)
        next_sum = float(np.sum(next_rank))
        if next_sum > 0:
            next_rank = next_rank / next_sum
        if float(np.sum(np.abs(next_rank - rank))) <= PAGERANK_TOLERANCE:
            rank = next_rank
            break
        rank = next_rank

    return rank.astype(np.float64, copy=False)


def _validate_web_google_integrity(node_count: int, edge_count: int) -> None:
    """
    Validate ingested web-Google graph counts against expected dataset scale.
    """

    min_nodes = int(WEB_GOOGLE_DATASET_INFO.node_count * INTEGRITY_MIN_NODE_RATIO)
    min_edges = int(WEB_GOOGLE_DATASET_INFO.edge_count * INTEGRITY_MIN_EDGE_RATIO)
    if node_count < min_nodes:
        raise ValueError(
            "web-Google node count looks incomplete: "
            f"got {node_count}, expected around {WEB_GOOGLE_DATASET_INFO.node_count}"
        )
    if edge_count < min_edges:
        raise ValueError(
            "web-Google edge count looks incomplete: "
            f"got {edge_count}, expected around {WEB_GOOGLE_DATASET_INFO.edge_count}"
        )


def _resolve_selected_node_labels(
    graph: DirectedGraphStore, node_ids: list[int]
) -> list[str]:
    labels: list[str] = []
    for node_id in node_ids:
        explicit = (
            graph.node_labels_by_id.get(node_id) if graph.node_labels_by_id else None
        )
        if explicit:
            labels.append(explicit)
            continue
        labels.append(_infer_dataset_node_label(graph, node_id))
    return labels


def _infer_dataset_node_label(graph: DirectedGraphStore, node_id: int) -> str:
    return f"Web page {node_id}"


def _build_induced_transition_matrix(
    graph: DirectedGraphStore,
    node_ids: list[int],
    dangling_handling: DanglingHandling,
) -> tuple[list[list[float]], int, int]:
    index_by_node_id = {node_id: index for index, node_id in enumerate(node_ids)}
    size = len(node_ids)
    matrix: list[list[float]] = [[0.0 for _ in range(size)] for _ in range(size)]
    selected_edge_count = 0
    dangling_node_count = 0

    for local_from_index, node_id in enumerate(node_ids):
        outgoing = _outgoing_neighbors(graph, node_id)
        targets: list[int] = []
        for neighbor in outgoing:
            local_to_index = index_by_node_id.get(int(neighbor))
            if local_to_index is None:
                continue
            targets.append(local_to_index)

        if len(targets) <= 0:
            dangling_node_count += 1
            if dangling_handling == "self_loop":
                matrix[local_from_index][local_from_index] = 1.0
            else:
                weight = 1.0 / size
                for local_to_index in range(size):
                    matrix[local_from_index][local_to_index] = weight
            continue

        selected_edge_count += len(targets)
        unique_targets = sorted(set(targets))
        weight = 1.0 / len(unique_targets)
        for local_to_index in unique_targets:
            matrix[local_from_index][local_to_index] = weight

    return matrix, selected_edge_count, dangling_node_count


def _extract_balanced_instructional(context: _PresetContext) -> list[int]:
    graph = context.graph
    target_count = context.target_count
    candidate_nodes = _candidate_pool(graph)
    score = _build_instructional_score(graph)

    hub_budget = max(8, target_count // 18)
    authority_budget = max(8, target_count // 18)
    dangling_budget = max(8, target_count // 24)

    selected: set[int] = set()
    selected.update(_pick_top_nodes(graph.out_degree, candidate_nodes, hub_budget))
    selected.update(_pick_top_nodes(graph.in_degree, candidate_nodes, authority_budget))

    dangling_candidates = np.flatnonzero(
        (graph.out_degree == 0) & (graph.in_degree > 0) & graph.candidate_mask
    )
    if dangling_candidates.size > 0:
        selected.update(
            _pick_top_nodes(graph.in_degree, dangling_candidates, dangling_budget)
        )

    _expand_with_frontier(
        graph=graph,
        selected=selected,
        target_count=target_count,
        rng=context.rng,
        score=score,
        mix_ratio=0.7,
    )

    _fill_with_top_scored_nodes(
        selected=selected,
        score=score,
        candidates=candidate_nodes,
        target_count=target_count,
    )

    return _to_sorted_node_list(selected, target_count, score=score)


def _extract_community_lens(context: _PresetContext) -> list[int]:
    graph = context.graph
    target_count = context.target_count
    candidate_nodes = _candidate_pool(graph)
    score = _build_instructional_score(graph)
    if candidate_nodes.size <= 0:
        return []

    seed_candidates = _pick_top_nodes(
        score, candidate_nodes, max(1, target_count // 12)
    )
    if len(seed_candidates) <= 0:
        seed_candidates = [int(candidate_nodes[0])]
    seed = int(seed_candidates[context.rng.integers(0, len(seed_candidates))])

    selected = _limited_bfs_undirected(
        graph, seed=seed, limit=max(2, int(target_count * 0.8))
    )
    selected_set = set(selected)

    boundary: set[int] = set()
    for node_id in list(selected_set):
        for neighbor in _outgoing_neighbors(graph, node_id):
            if neighbor not in selected_set:
                boundary.add(int(neighbor))
        for neighbor in _incoming_neighbors(graph, node_id):
            if neighbor not in selected_set:
                boundary.add(int(neighbor))

    boundary_candidates = np.asarray(sorted(boundary), dtype=np.int64)
    selected_set.update(
        _pick_top_nodes(
            score, boundary_candidates, max(0, target_count - len(selected_set))
        )
    )
    _fill_with_top_scored_nodes(
        selected=selected_set,
        score=score,
        candidates=candidate_nodes,
        target_count=target_count,
    )
    return _to_sorted_node_list(selected_set, target_count, score=score)


def _extract_authority_hub_contrast(context: _PresetContext) -> list[int]:
    graph = context.graph
    target_count = context.target_count
    candidate_nodes = _candidate_pool(graph)
    score = _build_instructional_score(graph)

    hub_budget = max(10, target_count // 5)
    authority_budget = max(10, target_count // 5)

    hubs = _pick_top_nodes(graph.out_degree, candidate_nodes, hub_budget)
    authorities = _pick_top_nodes(graph.in_degree, candidate_nodes, authority_budget)
    selected: set[int] = set(hubs) | set(authorities)

    for hub in hubs:
        neighbors = _outgoing_neighbors(graph, hub)
        for node_id in neighbors[: min(8, len(neighbors))]:
            selected.add(int(node_id))
    for authority in authorities:
        incoming = _incoming_neighbors(graph, authority)
        for node_id in incoming[: min(8, len(incoming))]:
            selected.add(int(node_id))

    _expand_with_frontier(
        graph=graph,
        selected=selected,
        target_count=target_count,
        rng=context.rng,
        score=score,
        mix_ratio=0.5,
    )
    _fill_with_top_scored_nodes(
        selected=selected,
        score=score,
        candidates=candidate_nodes,
        target_count=target_count,
    )
    return _to_sorted_node_list(selected, target_count, score=score)


def _extract_dangling_stress(context: _PresetContext) -> list[int]:
    graph = context.graph
    target_count = context.target_count
    candidate_nodes = _candidate_pool(graph)
    score = _build_instructional_score(graph)

    dangling_candidates = np.flatnonzero(
        (graph.out_degree == 0) & (graph.in_degree > 0) & graph.candidate_mask
    )
    if dangling_candidates.size <= 0:
        return _extract_balanced_instructional(context)

    selected: set[int] = set(
        _pick_top_nodes(
            values=graph.in_degree,
            candidates=dangling_candidates,
            count=max(16, target_count // 3),
        )
    )

    for dangling_node in list(selected):
        incoming = _incoming_neighbors(graph, dangling_node)
        for node_id in incoming[: min(12, len(incoming))]:
            selected.add(int(node_id))

    _expand_with_frontier(
        graph=graph,
        selected=selected,
        target_count=target_count,
        rng=context.rng,
        score=score,
        mix_ratio=0.45,
    )
    _fill_with_top_scored_nodes(
        selected=selected,
        score=score,
        candidates=candidate_nodes,
        target_count=target_count,
    )
    return _to_sorted_node_list(selected, target_count, score=score)


def _extract_random_baseline(context: _PresetContext) -> list[int]:
    graph = context.graph
    target_count = context.target_count
    candidate_nodes = _candidate_pool(graph)
    if candidate_nodes.size <= target_count:
        return sorted(int(node_id) for node_id in candidate_nodes)
    sampled = context.rng.choice(candidate_nodes, size=target_count, replace=False)
    return sorted(int(node_id) for node_id in sampled.tolist())


_PRESET_REGISTRY: dict[MarkovPresetId, Callable[[_PresetContext], list[int]]] = {
    "balanced_instructional": _extract_balanced_instructional,
    "community_lens": _extract_community_lens,
    "authority_hub_contrast": _extract_authority_hub_contrast,
    "dangling_stress": _extract_dangling_stress,
    "random_baseline": _extract_random_baseline,
}


def _candidate_pool(graph: DirectedGraphStore) -> np.ndarray:
    if graph.candidate_nodes.size > 0:
        return graph.candidate_nodes
    return graph.active_nodes


def _build_instructional_score(graph: DirectedGraphStore) -> np.ndarray:
    """
    Blend PageRank and structural degree signals for extraction ranking.
    """

    in_norm = _normalize_non_negative(graph.in_degree.astype(np.float64, copy=False))
    out_norm = _normalize_non_negative(graph.out_degree.astype(np.float64, copy=False))
    pagerank_norm = _normalize_non_negative(graph.pagerank)
    bridge_proxy = np.minimum(in_norm, out_norm)
    score = (
        0.46 * pagerank_norm + 0.24 * in_norm + 0.20 * out_norm + 0.10 * bridge_proxy
    )
    return score


def _normalize_non_negative(values: np.ndarray) -> np.ndarray:
    if values.size <= 0:
        return values
    sanitized = np.maximum(values, 0.0)
    max_value = float(np.max(sanitized))
    if max_value <= 0:
        return np.zeros_like(sanitized, dtype=np.float64)
    return sanitized / max_value


def _outgoing_neighbors(graph: DirectedGraphStore, node_id: int) -> np.ndarray:
    start = int(graph.csr.indptr[node_id])
    end = int(graph.csr.indptr[node_id + 1])
    return graph.csr.indices[start:end]


def _incoming_neighbors(graph: DirectedGraphStore, node_id: int) -> np.ndarray:
    start = int(graph.csc.indptr[node_id])
    end = int(graph.csc.indptr[node_id + 1])
    return graph.csc.indices[start:end]


def _pick_top_nodes(
    values: np.ndarray, candidates: np.ndarray, count: int
) -> list[int]:
    if count <= 0 or candidates.size <= 0:
        return []
    if candidates.size <= count:
        ranked = candidates[np.argsort(values[candidates])[::-1]]
        return [int(node_id) for node_id in ranked.tolist()]

    candidate_scores = values[candidates]
    top_indices = np.argpartition(candidate_scores, -count)[-count:]
    top_nodes = candidates[top_indices]
    ranked = top_nodes[np.argsort(values[top_nodes])[::-1]]
    return [int(node_id) for node_id in ranked.tolist()]


def _limited_bfs_undirected(
    graph: DirectedGraphStore, seed: int, limit: int
) -> list[int]:
    visited: set[int] = {seed}
    queue = deque([(seed, 0)])
    order: list[int] = [seed]

    while queue and len(order) < limit:
        node_id, depth = queue.popleft()
        if depth >= MAX_BFS_DEPTH:
            continue
        neighbors = np.concatenate(
            (_outgoing_neighbors(graph, node_id), _incoming_neighbors(graph, node_id))
        )
        for neighbor in neighbors:
            neighbor_id = int(neighbor)
            if neighbor_id in visited:
                continue
            visited.add(neighbor_id)
            order.append(neighbor_id)
            queue.append((neighbor_id, depth + 1))
            if len(order) >= limit:
                break

    return order


def _expand_with_frontier(
    graph: DirectedGraphStore,
    selected: set[int],
    target_count: int,
    rng: np.random.Generator,
    score: np.ndarray,
    mix_ratio: float,
) -> None:
    if len(selected) <= 0 and graph.active_nodes.size > 0:
        selected.add(int(graph.active_nodes[rng.integers(0, len(graph.active_nodes))]))

    iteration_guard = 0
    while len(selected) < target_count and iteration_guard < target_count * 20:
        iteration_guard += 1
        selected_snapshot = list(selected)
        frontier: set[int] = set()
        for node_id in selected_snapshot:
            outgoing = _outgoing_neighbors(graph, node_id)
            incoming = _incoming_neighbors(graph, node_id)
            combined = np.concatenate((outgoing, incoming))
            for neighbor in combined:
                neighbor_id = int(neighbor)
                if neighbor_id not in selected:
                    frontier.add(neighbor_id)

        if not frontier:
            break

        frontier_array = np.asarray(sorted(frontier), dtype=np.int64)
        frontier_budget = max(
            1, min(target_count - len(selected), int(max(1, target_count * 0.1)))
        )
        top_frontier = _pick_top_nodes(score, frontier_array, frontier_budget)
        if top_frontier:
            selected.update(top_frontier)

        if len(selected) >= target_count:
            break

        if rng.random() <= mix_ratio:
            continue

        random_pick = int(frontier_array[rng.integers(0, len(frontier_array))])
        selected.add(random_pick)


def _fill_with_top_scored_nodes(
    selected: set[int],
    score: np.ndarray,
    candidates: np.ndarray,
    target_count: int,
) -> None:
    if len(selected) >= target_count:
        return

    needed = target_count - len(selected)
    ranked = _pick_top_nodes(score, candidates, min(len(candidates), needed * 3))
    for node_id in ranked:
        selected.add(node_id)
        if len(selected) >= target_count:
            break

    if len(selected) >= target_count:
        return

    for node_id in candidates:
        selected.add(int(node_id))
        if len(selected) >= target_count:
            break


def _to_sorted_node_list(
    selected: set[int],
    target_count: int,
    score: np.ndarray | None = None,
) -> list[int]:
    if len(selected) <= target_count:
        return sorted(selected)
    selected_array = np.asarray(sorted(selected), dtype=np.int64)
    if score is None:
        return [int(node_id) for node_id in selected_array[:target_count].tolist()]
    top = _pick_top_nodes(score, selected_array, target_count)
    return sorted(top)


def _clamp_target_node_count(value: int) -> int:
    if value < MIN_TARGET_NODE_COUNT:
        return MIN_TARGET_NODE_COUNT
    if value > MAX_TARGET_NODE_COUNT:
        return MAX_TARGET_NODE_COUNT
    return int(value)


def _validate_dataset_id(dataset_id: str) -> MarkovDatasetId:
    normalized = dataset_id.strip().lower()
    if normalized not in DATASET_INFO_BY_ID:
        supported = ", ".join(sorted(DATASET_INFO_BY_ID.keys()))
        raise ValueError(f"datasetId must be one of: {supported}")
    return normalized  # type: ignore[return-value]


def _validate_preset_id(preset_id: str) -> MarkovPresetId:
    normalized = preset_id.strip().lower()
    if normalized not in _PRESET_REGISTRY:
        supported = ", ".join(sorted(_PRESET_REGISTRY.keys()))
        raise ValueError(f"presetId must be one of: {supported}")
    return normalized  # type: ignore[return-value]


def _validate_dangling_handling(value: str) -> DanglingHandling:
    normalized = value.strip().lower()
    if normalized not in {"redistribute_uniform", "self_loop"}:
        raise ValueError(
            "danglingHandling must be 'redistribute_uniform' or 'self_loop'"
        )
    return normalized  # type: ignore[return-value]
