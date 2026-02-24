from __future__ import annotations

import numpy as np
from scipy import sparse

from backend.services.markov_dataset_extraction import (
    DirectedGraphStore,
    MarkovExtractOptions,
    extract_markov_subgraph,
    list_markov_dataset_catalog,
)


def _build_test_graph() -> DirectedGraphStore:
    # Includes one dangling node (11) and mixed in/out degree structure.
    edges = [
        (0, 1),
        (0, 2),
        (1, 2),
        (1, 3),
        (2, 3),
        (2, 4),
        (3, 4),
        (3, 5),
        (4, 0),
        (4, 5),
        (5, 6),
        (6, 7),
        (7, 8),
        (8, 9),
        (9, 10),
        (10, 3),
        (0, 10),
        (6, 2),
        (10, 11),  # node 11 has inbound only and no outbound
    ]
    rows = np.asarray([edge[0] for edge in edges], dtype=np.int64)
    cols = np.asarray([edge[1] for edge in edges], dtype=np.int64)
    data = np.ones(len(edges), dtype=np.float32)
    node_count = 12
    csr = sparse.csr_matrix((data, (rows, cols)), shape=(node_count, node_count), dtype=np.float32)
    csr.sum_duplicates()
    csc = csr.tocsc()
    out_degree = np.diff(csr.indptr).astype(np.int64, copy=False)
    in_degree = np.diff(csc.indptr).astype(np.int64, copy=False)
    active_nodes = np.flatnonzero((out_degree + in_degree) > 0).astype(np.int64, copy=False)
    candidate_mask = np.zeros(node_count, dtype=bool)
    candidate_mask[active_nodes] = True
    pagerank = np.zeros(node_count, dtype=np.float64)
    if active_nodes.size > 0:
        pagerank[active_nodes] = 1.0 / active_nodes.size
    return DirectedGraphStore(
        dataset_id="web-google",
        node_count=node_count,
        edge_count=int(csr.nnz),
        csr=csr,
        csc=csc,
        out_degree=out_degree,
        in_degree=in_degree,
        active_nodes=active_nodes,
        largest_weak_component_nodes=active_nodes,
        candidate_nodes=active_nodes,
        candidate_mask=candidate_mask,
        pagerank=pagerank,
        node_labels_by_id=None,
    )


def test_catalog_contains_expected_defaults():
    catalog = list_markov_dataset_catalog()
    assert catalog["defaultDatasetId"] == "web-google"
    assert catalog["defaultPresetId"] == "balanced_instructional"
    assert len(catalog["datasets"]) >= 1
    assert len(catalog["presets"]) >= 5


def test_extract_balanced_instructional_returns_row_stochastic_matrix():
    graph = _build_test_graph()
    result = extract_markov_subgraph(
        MarkovExtractOptions(
            dataset_id="web-google",
            preset_id="balanced_instructional",
            target_node_count=20,
            seed=7,
            dangling_handling="redistribute_uniform",
        ),
        graph_override=graph,
    )
    assert result.selected_node_count == 12
    assert len(result.node_ids) == 12
    assert len(result.transition_matrix) == 12
    for row in result.transition_matrix:
        assert len(row) == 12
        assert abs(sum(row) - 1.0) < 1e-9
    assert abs(sum(result.initial_vector) - 1.0) < 1e-9
    assert abs(sum(result.current_vector) - 1.0) < 1e-9


def test_extract_random_baseline_supports_self_loop_dangling_policy():
    graph = _build_test_graph()
    result = extract_markov_subgraph(
        MarkovExtractOptions(
            dataset_id="web-google",
            preset_id="random_baseline",
            target_node_count=20,
            seed=3,
            dangling_handling="self_loop",
        ),
        graph_override=graph,
    )
    assert result.selected_node_count == 12
    assert len(result.transition_matrix) == 12
    assert result.dangling_node_count >= 0
    for row in result.transition_matrix:
        assert abs(sum(row) - 1.0) < 1e-9
