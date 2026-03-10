import { createTemplateElement, requireElement } from '@shared/lib/dom';
import {
  formatIndexedMathAssignment,
  formatIndexedMathSymbol,
  formatMathNumber,
  mathTextClassName,
} from '@shared/lib/math-text';
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
import { NETWORKS_MATH_TEXT_STYLE } from '../math-style';

const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 500;
const NODE_RADIUS = 24;
type EdgeMenuKind = 'from' | 'to';

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
          <div class="networks-math-select" data-select-kind="from">
            <button
              id="graph-edge-from"
              class="networks-math-select-trigger"
              type="button"
              data-action="toggle-edge-menu"
              data-menu-kind="from"
              aria-haspopup="listbox"
              aria-controls="graph-edge-from-menu"
              aria-expanded="false"
            ></button>
            <div
              id="graph-edge-from-menu"
              class="networks-math-select-menu"
              role="listbox"
              aria-label="Tail node options"
            ></div>
          </div>
          <label class="networks-control-label" for="graph-edge-to">Head</label>
          <div class="networks-math-select" data-select-kind="to">
            <button
              id="graph-edge-to"
              class="networks-math-select-trigger"
              type="button"
              data-action="toggle-edge-menu"
              data-menu-kind="to"
              aria-haspopup="listbox"
              aria-controls="graph-edge-to-menu"
              aria-expanded="false"
            ></button>
            <div
              id="graph-edge-to-menu"
              class="networks-math-select-menu"
              role="listbox"
              aria-label="Head node options"
            ></div>
          </div>
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

  const edgeFromSelect = requireElement<HTMLButtonElement>(element, '#graph-edge-from');
  const edgeToSelect = requireElement<HTMLButtonElement>(element, '#graph-edge-to');
  const edgeFromMenu = requireElement<HTMLElement>(element, '#graph-edge-from-menu');
  const edgeToMenu = requireElement<HTMLElement>(element, '#graph-edge-to-menu');
  const edgeFromSelectRoot = requireElement<HTMLElement>(element, '[data-select-kind="from"]');
  const edgeToSelectRoot = requireElement<HTMLElement>(element, '[data-select-kind="to"]');
  const graphNodeCount = requireElement<HTMLElement>(element, '#graph-node-count');
  const graphEdgeCount = requireElement<HTMLElement>(element, '#graph-edge-count');
  const graphStatus = requireElement<HTMLElement>(element, '#graph-status');
  const graphSvg = requireElement<SVGSVGElement>(element, '#graph-svg');
  const edgeList = requireElement<HTMLElement>(element, '#graph-edge-list');

  let interaction: GraphInteractionState = createEmptyGraphInteractionState();
  let lastState: NetworksState | null = null;
  let openEdgeMenu: EdgeMenuKind | null = null;

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const actionTarget = target.closest<HTMLElement>('[data-action]');
    const action = actionTarget?.dataset.action;

    if (action === 'toggle-edge-menu') {
      const menuKind = actionTarget?.dataset.menuKind;
      if (menuKind !== 'from' && menuKind !== 'to') {
        return;
      }
      setEdgeMenuOpen(openEdgeMenu === menuKind ? null : menuKind);
      return;
    }

    if (action === 'select-edge-node') {
      const menuKind = actionTarget?.dataset.menuKind;
      const nodeId = Number.parseInt(actionTarget?.dataset.nodeId ?? '', 10);
      if ((menuKind !== 'from' && menuKind !== 'to') || !Number.isInteger(nodeId)) {
        return;
      }
      if (menuKind === 'from') {
        bus.emit('command:set-edge-draft-from', { nodeId });
      } else {
        bus.emit('command:set-edge-draft-to', { nodeId });
      }
      setEdgeMenuOpen(null);
      return;
    }

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
      const edgeId = actionTarget?.dataset.edgeId;
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

  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Node)) {
      return;
    }
    if (!element.contains(event.target)) {
      setEdgeMenuOpen(null);
      return;
    }
    if (!(event.target instanceof HTMLElement)) {
      return;
    }
    if (!event.target.closest('.networks-math-select')) {
      setEdgeMenuOpen(null);
    }
  };
  document.addEventListener('pointerdown', handleDocumentPointerDown);

  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || openEdgeMenu === null) {
      return;
    }
    setEdgeMenuOpen(null);
  };
  document.addEventListener('keydown', handleDocumentKeyDown);

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
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
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
    const nodeIndexById = new Map<number, number>();
    state.nodes.forEach((node, index) => {
      nodeIndexById.set(node.id, index);
    });

    edgeFromMenu.innerHTML = renderEdgeMenuOptions({
      kind: 'from',
      state,
      selectedNodeId: state.edgeDraftFrom,
    });
    edgeToMenu.innerHTML = renderEdgeMenuOptions({
      kind: 'to',
      state,
      selectedNodeId: state.edgeDraftTo,
    });

    const fromLabel = renderEdgeMenuTriggerLabel({
      nodeIndex: nodeIndexById.get(state.edgeDraftFrom),
    });
    const toLabel = renderEdgeMenuTriggerLabel({
      nodeIndex: nodeIndexById.get(state.edgeDraftTo),
    });
    edgeFromSelect.innerHTML = fromLabel;
    edgeToSelect.innerHTML = toLabel;

    const canSelectEdge = state.nodes.length > 1;
    edgeFromSelect.disabled = !canSelectEdge;
    edgeToSelect.disabled = !canSelectEdge;
    if (!canSelectEdge) {
      setEdgeMenuOpen(null);
    } else {
      setEdgeMenuOpen(openEdgeMenu);
    }

  }

  function renderGraphSvgScene(state: NetworksState): void {
    interaction = sanitizeGraphInteractionState(interaction, state.nodes.length);

    const nodePoints = computeCircularNodeLayout({
      nodeCount: state.nodes.length,
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT,
      padding: 60,
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
            label: formatIndexedMathSymbol({
              symbol: 'N',
              index: nodeIndex + 1,
              style: NETWORKS_MATH_TEXT_STYLE,
            }),
            value: imbalanceWeights[nodeIndex] ?? 0,
            annotation: formatIndexedMathAssignment({
              symbol: 'b',
              index: nodeIndex + 1,
              value: state.derived.imbalanceVector[nodeIndex] ?? 0,
              style: NETWORKS_MATH_TEXT_STYLE,
              fractionDigits: 2,
            }),
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
              label: formatIndexedMathAssignment({
                symbol: 'f',
                index: edgeIndex + 1,
                value: state.flowVector[edgeIndex] ?? 0,
                style: NETWORKS_MATH_TEXT_STYLE,
                fractionDigits: 2,
              }),
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
      nodeLabelById.set(
        node.id,
        formatIndexedMathSymbol({
          symbol: 'N',
          index: index + 1,
          style: NETWORKS_MATH_TEXT_STYLE,
        })
      );
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

  function setEdgeMenuOpen(nextMenu: EdgeMenuKind | null): void {
    const canSelectEdge = (lastState?.nodes.length ?? 0) > 1;
    openEdgeMenu = canSelectEdge ? nextMenu : null;

    const isFromOpen = openEdgeMenu === 'from';
    const isToOpen = openEdgeMenu === 'to';
    edgeFromSelectRoot.classList.toggle('is-open', isFromOpen);
    edgeToSelectRoot.classList.toggle('is-open', isToOpen);
    edgeFromSelect.setAttribute('aria-expanded', String(isFromOpen));
    edgeToSelect.setAttribute('aria-expanded', String(isToOpen));
  }
}

function renderEdgeMenuOptions(options: {
  kind: EdgeMenuKind;
  state: NetworksState;
  selectedNodeId: number;
}): string {
  if (options.state.nodes.length === 0) {
    return '<p class="networks-empty">No nodes available.</p>';
  }
  return options.state.nodes
    .map((node, index) => {
      const nodeLabel = formatIndexedMathSymbol({
        symbol: 'N',
        index: index + 1,
        style: NETWORKS_MATH_TEXT_STYLE,
        mode: 'html',
      });
      return `
        <button
          class="networks-math-select-option"
          type="button"
          role="option"
          data-action="select-edge-node"
          data-menu-kind="${options.kind}"
          data-node-id="${node.id}"
          aria-selected="${node.id === options.selectedNodeId ? 'true' : 'false'}"
        >
          <span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${nodeLabel}</span>
        </button>
      `;
    })
    .join('');
}

function renderEdgeMenuTriggerLabel(options: {
  nodeIndex: number | undefined;
}): string {
  if (options.nodeIndex === undefined) {
    return '<span class="networks-empty">Select</span>';
  }
  const nodeLabel = formatIndexedMathSymbol({
    symbol: 'N',
    index: options.nodeIndex + 1,
    style: NETWORKS_MATH_TEXT_STYLE,
    mode: 'html',
  });
  return `
    <span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${nodeLabel}</span>
  `;
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
      const fromLabel =
        options.nodeLabelById.get(edge.from) ??
        `Node ${formatIndexedMathSymbol({
          symbol: 'N',
          index: edge.from,
          style: NETWORKS_MATH_TEXT_STYLE,
        })}`;
      const toLabel =
        options.nodeLabelById.get(edge.to) ??
        `Node ${formatIndexedMathSymbol({
          symbol: 'N',
          index: edge.to,
          style: NETWORKS_MATH_TEXT_STYLE,
        })}`;
      const fromIndex = options.state.nodes.findIndex((node) => node.id === edge.from);
      const toIndex = options.state.nodes.findIndex((node) => node.id === edge.to);
      const targetAttrs =
        fromIndex >= 0 && toIndex >= 0
          ? `data-graph-target-kind="edge" data-from-index="${fromIndex}" data-to-index="${toIndex}"`
          : '';

      return `
        <tr ${targetAttrs}>
          <td ${targetAttrs}><span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatIndexedMathSymbol({
            symbol: 'e',
            index: edgeIndex + 1,
            style: NETWORKS_MATH_TEXT_STYLE,
          })}</span>: <span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${fromLabel}</span> -> <span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${toLabel}</span></td>
          <td ${targetAttrs}><span class="${mathTextClassName(NETWORKS_MATH_TEXT_STYLE)}">${formatMathNumber(options.state.flowVector[edgeIndex] ?? 0, 2)}</span></td>
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
