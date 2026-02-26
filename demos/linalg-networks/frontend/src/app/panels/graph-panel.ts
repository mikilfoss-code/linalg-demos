import { createTemplateElement, requireElement } from '@shared/lib/dom';
import {
  buildGraphHighlightPresentation,
  createEmptyGraphInteractionState,
  isSameGraphInteractionTarget,
  readGraphInteractionTargetFromElement,
  sanitizeGraphInteractionState,
  type GraphDirectedEdge,
  type GraphInteractionState,
} from '@shared/graph/highlight';
import { renderDirectedGraphSvg } from '@shared/graph/render-svg';
import { computeCircularNodeLayout } from '../graph-layout';
import type { NetworksBus } from '../events';
import type { NetworksState } from '../types';
import { MAX_EDGES, MAX_NODES } from '../reducer';

const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 500;
const NODE_RADIUS = 24;

export type GraphPanelController = {
  element: HTMLElement;
  destroy: () => void;
};

/**
 * Create graph panel controller for node/edge editing and SVG rendering.
 */
export function createGraphPanelController(bus: NetworksBus): GraphPanelController {
  const element = createTemplateElement<HTMLElement>(`
    <section class="base-panel networks-panel networks-panel-graph">
      <h2 class="base-panel-title">Directed Graph</h2>
      <p class="networks-panel-subtitle">
        Build a graph with up to ${MAX_NODES} nodes and ${MAX_EDGES} directed edges.
      </p>

      <div class="networks-controls-grid">
        <div class="networks-inline-actions">
          <button class="base-button" type="button" data-action="add-node">Add node</button>
          <button class="base-button base-button--secondary" type="button" data-action="remove-node">Remove node</button>
        </div>

        <div class="networks-edge-add">
          <label class="networks-control-label" for="graph-edge-from">Tail</label>
          <select id="graph-edge-from" class="networks-select"></select>
          <label class="networks-control-label" for="graph-edge-to">Head</label>
          <select id="graph-edge-to" class="networks-select"></select>
          <button class="base-button" type="button" data-action="add-edge">Add edge</button>
        </div>
      </div>

      <div class="networks-graph-meta">
        <span id="graph-node-count">Nodes: 0</span>
        <span id="graph-edge-count">Edges: 0</span>
      </div>
      <p class="networks-status" id="graph-status" role="status" aria-live="polite"></p>

      <svg class="networks-graph" id="graph-svg"></svg>

      <div class="networks-edge-list" id="graph-edge-list"></div>
    </section>
  `);

  const edgeFromSelect = requireElement<HTMLSelectElement>(element, '#graph-edge-from');
  const edgeToSelect = requireElement<HTMLSelectElement>(element, '#graph-edge-to');
  const graphNodeCount = requireElement<HTMLElement>(element, '#graph-node-count');
  const graphEdgeCount = requireElement<HTMLElement>(element, '#graph-edge-count');
  const graphStatus = requireElement<HTMLElement>(element, '#graph-status');
  const graphSvg = requireElement<SVGSVGElement>(element, '#graph-svg');
  const edgeList = requireElement<HTMLElement>(element, '#graph-edge-list');

  let interaction: GraphInteractionState = createEmptyGraphInteractionState();
  let lastState: NetworksState | null = null;

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    if (action === 'add-node') {
      bus.emit('command:add-node', undefined);
      return;
    }
    if (action === 'remove-node') {
      bus.emit('command:remove-node', undefined);
      return;
    }
    if (action === 'add-edge') {
      bus.emit('command:add-edge', undefined);
      return;
    }
    if (action === 'remove-edge') {
      const edgeId = target.dataset.edgeId;
      if (!edgeId) {
        return;
      }
      bus.emit('command:remove-edge', { edgeId });
      return;
    }

    const graphTarget = readGraphInteractionTargetFromElement(event.target);
    interaction = {
      ...interaction,
      selected: graphTarget,
    };
    renderGraphOnly();
  };

  const handlePointerMoveTarget = (event: Event) => {
    const target = readGraphInteractionTargetFromElement(event.target);
    if (isSameGraphInteractionTarget(interaction.hovered, target)) {
      return;
    }
    interaction = {
      ...interaction,
      hovered: target,
    };
    renderGraphOnly();
  };

  const clearHoveredTarget = () => {
    if (!interaction.hovered) {
      return;
    }
    interaction = {
      ...interaction,
      hovered: null,
    };
    renderGraphOnly();
  };

  element.addEventListener('click', handleClick);
  graphSvg.addEventListener('pointermove', handlePointerMoveTarget);
  graphSvg.addEventListener('pointerleave', clearHoveredTarget);
  edgeList.addEventListener('pointermove', handlePointerMoveTarget);
  edgeList.addEventListener('pointerleave', clearHoveredTarget);

  edgeFromSelect.addEventListener('change', () => {
    const nodeId = Number.parseInt(edgeFromSelect.value, 10);
    if (!Number.isInteger(nodeId)) {
      return;
    }
    bus.emit('command:set-edge-draft-from', { nodeId });
  });

  edgeToSelect.addEventListener('change', () => {
    const nodeId = Number.parseInt(edgeToSelect.value, 10);
    if (!Number.isInteger(nodeId)) {
      return;
    }
    bus.emit('command:set-edge-draft-to', { nodeId });
  });

  const unsubscribe = bus.on('state:changed', (state) => {
    lastState = state;
    renderGraphPanel(state);
  });

  return {
    element,
    destroy() {
      unsubscribe();
      element.removeEventListener('click', handleClick);
      graphSvg.removeEventListener('pointermove', handlePointerMoveTarget);
      graphSvg.removeEventListener('pointerleave', clearHoveredTarget);
      edgeList.removeEventListener('pointermove', handlePointerMoveTarget);
      edgeList.removeEventListener('pointerleave', clearHoveredTarget);
    },
  };

  function renderGraphOnly(): void {
    if (!lastState) {
      return;
    }
    renderGraphSvgScene(lastState);
  }

  function renderGraphPanel(state: NetworksState): void {
    graphNodeCount.textContent = `Nodes: ${state.nodes.length}/${MAX_NODES}`;
    graphEdgeCount.textContent = `Edges: ${state.edges.length}/${MAX_EDGES}`;
    graphStatus.textContent = state.message ?? '';
    renderEdgeDraftSelectors(state);
    renderGraphSvgScene(state);
    renderEdgeList(state);
  }

  function renderEdgeDraftSelectors(state: NetworksState): void {
    const options = state.nodes
      .map((node, index) => `<option value="${node.id}">N${index + 1}</option>`)
      .join('');
    edgeFromSelect.innerHTML = options;
    edgeToSelect.innerHTML = options;
    edgeFromSelect.value = String(state.edgeDraftFrom);
    edgeToSelect.value = String(state.edgeDraftTo);
    const canSelectEdge = state.nodes.length > 1;
    edgeFromSelect.disabled = !canSelectEdge;
    edgeToSelect.disabled = !canSelectEdge;
  }

  function renderGraphSvgScene(state: NetworksState): void {
    interaction = sanitizeGraphInteractionState(interaction, state.nodes.length);

    const nodePoints = computeCircularNodeLayout({
      nodeCount: state.nodes.length,
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
      padding: 86,
    });
    const nodeIndexById = new Map<number, number>();
    state.nodes.forEach((node, index) => {
      nodeIndexById.set(node.id, index);
    });

    const flowWeights = normalizeMagnitudes(state.flowVector);
    const imbalanceWeights = normalizeSignedMagnitudes(state.derived.imbalanceVector);

    const highlightEdges: GraphDirectedEdge[] = state.edges
      .map((edge) => {
        const fromIndex = nodeIndexById.get(edge.from);
        const toIndex = nodeIndexById.get(edge.to);
        if (fromIndex === undefined || toIndex === undefined) {
          return null;
        }
        return {
          fromIndex,
          toIndex,
          weight: 1,
        };
      })
      .filter((edge): edge is GraphDirectedEdge => edge !== null);

    const presentation = buildGraphHighlightPresentation({
      interaction,
      nodeCount: state.nodes.length,
      edges: highlightEdges,
      minEdgeWeight: 0,
    });

    renderDirectedGraphSvg({
      svg: graphSvg,
      presentation,
      scene: {
        width: GRAPH_WIDTH,
        height: GRAPH_HEIGHT,
        nodeRadius: NODE_RADIUS,
        ariaLabel: 'Directed graph with edge flow and node imbalance labels',
        nodes: state.nodes.map((_, nodeIndex) => {
          const point = nodePoints[nodeIndex];
          return {
            index: nodeIndex,
            x: point.x,
            y: point.y,
            label: `N${nodeIndex + 1}`,
            value: imbalanceWeights[nodeIndex] ?? 0,
            annotation: `b${nodeIndex + 1}=${formatNumber(state.derived.imbalanceVector[nodeIndex] ?? 0)}`,
          };
        }),
        edges: state.edges
          .map((edge, edgeIndex) => {
            const fromIndex = nodeIndexById.get(edge.from);
            const toIndex = nodeIndexById.get(edge.to);
            if (fromIndex === undefined || toIndex === undefined) {
              return null;
            }
            return {
              fromIndex,
              toIndex,
              weight: flowWeights[edgeIndex] ?? 0,
              label: `f${edgeIndex + 1}=${formatNumber(state.flowVector[edgeIndex] ?? 0)}`,
            };
          })
          .filter((edge): edge is NonNullable<typeof edge> => edge !== null),
      },
    });
  }

  function renderEdgeList(state: NetworksState): void {
    if (state.edges.length === 0) {
      edgeList.innerHTML = '<p class="networks-empty">No edges yet.</p>';
      return;
    }

    const nodeLabelById = new Map<number, string>();
    state.nodes.forEach((node, index) => {
      nodeLabelById.set(node.id, `N${index + 1}`);
    });

    const leftColumnCount = Math.ceil(state.edges.length / 2);
    const leftColumnRows = renderEdgeColumnRows({
      state,
      nodeLabelById,
      startIndex: 0,
      endIndex: leftColumnCount,
    });
    const rightColumnRows = renderEdgeColumnRows({
      state,
      nodeLabelById,
      startIndex: leftColumnCount,
      endIndex: state.edges.length,
    });

    edgeList.innerHTML = `
      <div class="networks-edge-columns">
        <table class="networks-edge-table" aria-label="Current edges left column">
          <thead>
            <tr>
              <th scope="col">Edge</th>
              <th scope="col">Flow</th>
              <th scope="col" aria-label="Action"></th>
            </tr>
          </thead>
          <tbody>
            ${leftColumnRows}
          </tbody>
        </table>
        <table class="networks-edge-table" aria-label="Current edges right column">
          <thead>
            <tr>
              <th scope="col">Edge</th>
              <th scope="col">Flow</th>
              <th scope="col" aria-label="Action"></th>
            </tr>
          </thead>
          <tbody>
            ${rightColumnRows}
          </tbody>
        </table>
      </div>
    `;
  }
}

function renderEdgeColumnRows(options: {
  state: NetworksState;
  nodeLabelById: ReadonlyMap<number, string>;
  startIndex: number;
  endIndex: number;
}): string {
  if (options.startIndex >= options.endIndex) {
    return '';
  }

  return options.state.edges
    .slice(options.startIndex, options.endIndex)
    .map((edge, columnIndex) => {
      const edgeIndex = options.startIndex + columnIndex;
      const fromLabel = options.nodeLabelById.get(edge.from) ?? `Node ${edge.from}`;
      const toLabel = options.nodeLabelById.get(edge.to) ?? `Node ${edge.to}`;
      const fromIndex = options.state.nodes.findIndex((node) => node.id === edge.from);
      const toIndex = options.state.nodes.findIndex((node) => node.id === edge.to);
      const targetAttrs =
        fromIndex >= 0 && toIndex >= 0
          ? `data-graph-target-kind="edge" data-from-index="${fromIndex}" data-to-index="${toIndex}"`
          : '';

      return `
        <tr ${targetAttrs}>
          <td ${targetAttrs}>e${edgeIndex + 1}: ${fromLabel} -> ${toLabel}</td>
          <td ${targetAttrs}>${formatNumber(options.state.flowVector[edgeIndex] ?? 0)}</td>
          <td>
            <button
              class="base-button base-button--secondary networks-table-button"
              type="button"
              data-action="remove-edge"
              data-edge-id="${edge.id}"
            >
              Remove
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function normalizeMagnitudes(values: readonly number[]): number[] {
  const maxMagnitude = values.reduce((maxValue, value) => {
    const magnitude = Math.abs(value);
    return magnitude > maxValue ? magnitude : maxValue;
  }, 0);
  if (maxMagnitude <= 1e-9) {
    return values.map(() => 0);
  }
  return values.map((value) => Math.min(1, Math.abs(value) / maxMagnitude));
}

function normalizeSignedMagnitudes(values: readonly number[]): number[] {
  const maxMagnitude = values.reduce((maxValue, value) => {
    const magnitude = Math.abs(value);
    return magnitude > maxValue ? magnitude : maxValue;
  }, 0);
  if (maxMagnitude <= 1e-9) {
    return values.map(() => 0);
  }
  return values.map((value) => {
    const normalized = value / maxMagnitude;
    if (normalized <= -1) {
      return -1;
    }
    if (normalized >= 1) {
      return 1;
    }
    return normalized;
  });
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00';
  }
  return value.toFixed(2);
}
