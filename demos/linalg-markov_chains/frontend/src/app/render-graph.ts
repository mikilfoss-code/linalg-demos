import type { AppState } from './types';
import {
  colorForStateValue,
  edgePathKey,
  formatProbability,
  lerp,
  type FlowAnimationState,
} from '../lib/markov';

const GRAPH_WIDTH = 760;
const GRAPH_HEIGHT = 440;
const NODE_RADIUS = 26;
const PROBABILITY_EPSILON = 1e-6;

type NodeLayout = {
  index: number;
  angle: number;
  x: number;
  y: number;
};

type RuntimeParticle = {
  path: SVGPathElement;
  length: number;
  element: SVGCircleElement;
  delayMs: number;
  durationMs: number;
  opacity: number;
};

export type GraphPanelController = {
  element: HTMLElement;
  render: (state: AppState) => void;
  destroy: () => void;
};

/**
 * Create the graph panel and run edge-flow animation for each step transition.
 */
export function createGraphPanelController(options: {
  onFlowAnimationComplete: (animationId: number) => void;
}): GraphPanelController {
  const element = createTemplateElement(`
    <section class="base-panel markov-panel markov-panel-graph">
      <h2 class="base-panel-title">Transition Graph</h2>
      <p class="base-subtitle">Edge direction follows P<sub>ij</sub>. Self-transition probabilities draw loop arrows.</p>

      <svg
        class="markov-graph"
        id="markov-graph"
        viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}"
        role="img"
        aria-label="Directed Markov transition graph"
      >
        <defs>
          <marker
            id="markov-arrow-head"
            markerWidth="10"
            markerHeight="8"
            refX="8"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 4 L 0 8 z" fill="#0f4c81" />
          </marker>
        </defs>
        <g id="edge-layer"></g>
        <g id="particle-layer"></g>
        <g id="node-layer"></g>
      </svg>

      <div class="markov-legend">
        <span><strong>Edge width/opacity:</strong> transition probability</span>
        <span><strong>Node color:</strong> current state probability x<sub>t</sub></span>
      </div>
    </section>
  `);

  const graphSvg = requireElement<SVGSVGElement>(element, '#markov-graph');
  const edgeLayer = requireElement<SVGGElement>(element, '#edge-layer');
  const particleLayer = requireElement<SVGGElement>(element, '#particle-layer');
  const nodeLayer = requireElement<SVGGElement>(element, '#node-layer');

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let lastCompletedAnimationId: number | null = null;
  let animationFrameHandle: number | null = null;

  let currentNodeCircles = new Map<number, SVGCircleElement>();
  let currentPathByKey = new Map<string, SVGPathElement>();

  return {
    element,
    render(state) {
      drawGraph({
        state,
        graphSvg,
        edgeLayer,
        nodeLayer,
        currentNodeCircles,
        currentPathByKey,
      });

      if (!state.flowAnimation) {
        cancelAnimationLoop();
        particleLayer.replaceChildren();
        return;
      }

      if (reduceMotionQuery.matches) {
        if (state.flowAnimation.id !== lastCompletedAnimationId) {
          lastCompletedAnimationId = state.flowAnimation.id;
          options.onFlowAnimationComplete(state.flowAnimation.id);
        }
        return;
      }

      startFlowAnimation({
        animation: state.flowAnimation,
        nodeCircles: currentNodeCircles,
        pathByKey: currentPathByKey,
        particleLayer,
        onComplete: (animationId) => {
          lastCompletedAnimationId = animationId;
          options.onFlowAnimationComplete(animationId);
        },
        cancelAnimationLoop,
      });
    },
    destroy() {
      cancelAnimationLoop();
    },
  };

  function cancelAnimationLoop() {
    if (animationFrameHandle !== null) {
      cancelAnimationFrame(animationFrameHandle);
      animationFrameHandle = null;
    }
  }

  function startFlowAnimation(config: {
    animation: FlowAnimationState;
    nodeCircles: Map<number, SVGCircleElement>;
    pathByKey: Map<string, SVGPathElement>;
    particleLayer: SVGGElement;
    onComplete: (animationId: number) => void;
    cancelAnimationLoop: () => void;
  }) {
    config.cancelAnimationLoop();
    config.particleLayer.replaceChildren();

    const runtimeParticles: RuntimeParticle[] = [];
    config.animation.particles.forEach((particle) => {
      const path = config.pathByKey.get(particle.pathKey);
      if (!path) {
        return;
      }

      const dot = createSvgElement<SVGCircleElement>('circle');
      dot.classList.add('markov-flow-dot');
      dot.setAttribute('r', particle.radius.toFixed(2));
      dot.setAttribute('visibility', 'hidden');
      config.particleLayer.appendChild(dot);

      runtimeParticles.push({
        path,
        length: path.getTotalLength(),
        element: dot,
        delayMs: particle.delayMs,
        durationMs: particle.durationMs,
        opacity: particle.opacity,
      });
    });

    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const progress = clamp01(elapsed / config.animation.durationMs);
      const easedProgress = easeInOutCubic(progress);

      config.nodeCircles.forEach((circle, index) => {
        const from = config.animation.fromVector[index] ?? 0;
        const to = config.animation.toVector[index] ?? 0;
        const interpolated = lerp(from, to, easedProgress);
        circle.setAttribute('fill', colorForStateValue(interpolated));
      });

      runtimeParticles.forEach((particle) => {
        const localProgress = (elapsed - particle.delayMs) / particle.durationMs;
        if (localProgress <= 0 || localProgress >= 1) {
          particle.element.setAttribute('visibility', 'hidden');
          return;
        }

        const point = particle.path.getPointAtLength(clamp01(localProgress) * particle.length);
        particle.element.setAttribute('visibility', 'visible');
        particle.element.setAttribute('cx', point.x.toFixed(2));
        particle.element.setAttribute('cy', point.y.toFixed(2));

        const fade = Math.sin(Math.PI * clamp01(localProgress));
        particle.element.style.opacity = (particle.opacity * Math.max(0.15, fade)).toFixed(3);
      });

      if (elapsed < config.animation.durationMs) {
        animationFrameHandle = requestAnimationFrame(renderFrame);
        return;
      }

      config.cancelAnimationLoop();
      config.nodeCircles.forEach((circle, index) => {
        const to = config.animation.toVector[index] ?? 0;
        circle.setAttribute('fill', colorForStateValue(to));
      });
      config.particleLayer.replaceChildren();

      if (config.animation.id !== lastCompletedAnimationId) {
        config.onComplete(config.animation.id);
      }
    };

    animationFrameHandle = requestAnimationFrame(renderFrame);
  }
}

function drawGraph(args: {
  state: AppState;
  graphSvg: SVGSVGElement;
  edgeLayer: SVGGElement;
  nodeLayer: SVGGElement;
  currentNodeCircles: Map<number, SVGCircleElement>;
  currentPathByKey: Map<string, SVGPathElement>;
}) {
  args.edgeLayer.replaceChildren();
  args.nodeLayer.replaceChildren();
  args.currentNodeCircles.clear();
  args.currentPathByKey.clear();

  const nodeLayout = computeNodeLayout(args.state.nodeCount);
  const flowMassByPath = new Map<string, number>();
  args.state.flowAnimation?.edges.forEach((edge) => {
    flowMassByPath.set(edge.pathKey, edge.mass);
  });

  for (let fromIndex = 0; fromIndex < args.state.nodeCount; fromIndex += 1) {
    for (let toIndex = 0; toIndex < args.state.nodeCount; toIndex += 1) {
      const probability = args.state.transitionMatrix[fromIndex][toIndex] ?? 0;
      if (probability <= PROBABILITY_EPSILON) continue;

      const key = edgePathKey(fromIndex, toIndex);
      const flowMass = flowMassByPath.get(key) ?? 0;
      const edgePath = createSvgElement<SVGPathElement>('path');
      const geometry =
        fromIndex === toIndex
          ? createSelfLoopPath(nodeLayout[fromIndex])
          : createEdgePath(
              nodeLayout[fromIndex],
              nodeLayout[toIndex],
              (args.state.transitionMatrix[toIndex]?.[fromIndex] ?? 0) > PROBABILITY_EPSILON,
              fromIndex < toIndex
            );

      edgePath.setAttribute('d', geometry.pathData);
      edgePath.setAttribute('fill', 'none');
      edgePath.setAttribute('marker-end', 'url(#markov-arrow-head)');
      edgePath.classList.add('markov-edge');

      const strokeWidth = 1.2 + probability * 7.6;
      const baseOpacity = 0.14 + probability * 0.86;
      const emphasis = Math.min(1, flowMass * 11);
      const hue = 208 - emphasis * 34;
      const lightness = 34 - emphasis * 8;

      edgePath.style.stroke = `hsl(${hue.toFixed(1)} 72% ${lightness.toFixed(1)}%)`;
      edgePath.style.strokeWidth = strokeWidth.toFixed(3);
      edgePath.style.opacity = Math.min(1, baseOpacity + emphasis * 0.2).toFixed(3);

      args.edgeLayer.appendChild(edgePath);
      args.currentPathByKey.set(key, edgePath);

      if (probability >= 0.03) {
        const label = createSvgElement<SVGTextElement>('text');
        label.classList.add('markov-edge-label');
        label.setAttribute('x', geometry.labelPoint.x.toFixed(2));
        label.setAttribute('y', geometry.labelPoint.y.toFixed(2));
        label.textContent = formatProbability(probability, 2);
        args.edgeLayer.appendChild(label);
      }
    }
  }

  nodeLayout.forEach((node) => {
    const group = createSvgElement<SVGGElement>('g');
    group.classList.add('markov-node');

    const circle = createSvgElement<SVGCircleElement>('circle');
    circle.setAttribute('cx', node.x.toFixed(2));
    circle.setAttribute('cy', node.y.toFixed(2));
    circle.setAttribute('r', String(NODE_RADIUS));
    circle.setAttribute('fill', colorForStateValue(args.state.currentVector[node.index] ?? 0));
    circle.classList.add('markov-node-circle');

    const label = createSvgElement<SVGTextElement>('text');
    label.classList.add('markov-node-label');
    label.setAttribute('x', node.x.toFixed(2));
    label.setAttribute('y', (node.y + 4).toFixed(2));
    label.textContent = `S${node.index + 1}`;

    const valueLabel = createSvgElement<SVGTextElement>('text');
    valueLabel.classList.add('markov-node-value');
    valueLabel.setAttribute('x', node.x.toFixed(2));
    valueLabel.setAttribute('y', (node.y + NODE_RADIUS + 16).toFixed(2));
    valueLabel.textContent = `x=${formatProbability(args.state.currentVector[node.index], 2)}`;

    group.append(circle, label, valueLabel);
    args.nodeLayer.appendChild(group);
    args.currentNodeCircles.set(node.index, circle);
  });

  args.graphSvg.setAttribute('aria-description', `Graph with ${args.state.nodeCount} states.`);
}

function computeNodeLayout(nodeCount: number): NodeLayout[] {
  const centerX = GRAPH_WIDTH / 2;
  const centerY = GRAPH_HEIGHT / 2;
  const radius = Math.min(GRAPH_WIDTH, GRAPH_HEIGHT) * 0.34;

  return Array.from({ length: nodeCount }, (_, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / nodeCount;
    return {
      index,
      angle,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  });
}

function createEdgePath(
  fromNode: NodeLayout,
  toNode: NodeLayout,
  hasReverseEdge: boolean,
  isForwardPair: boolean
): {
  pathData: string;
  labelPoint: { x: number; y: number };
} {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance;
  const uy = dy / distance;

  const startX = fromNode.x + ux * NODE_RADIUS;
  const startY = fromNode.y + uy * NODE_RADIUS;
  const endX = toNode.x - ux * NODE_RADIUS;
  const endY = toNode.y - uy * NODE_RADIUS;

  const perpX = -uy;
  const perpY = ux;
  const bendAmount = hasReverseEdge ? (isForwardPair ? 30 : -30) : 0;

  const controlX = (startX + endX) / 2 + perpX * bendAmount;
  const controlY = (startY + endY) / 2 + perpY * bendAmount;

  const labelPoint = quadraticAt(
    { x: startX, y: startY },
    { x: controlX, y: controlY },
    { x: endX, y: endY },
    0.53
  );

  return {
    pathData: `M ${startX.toFixed(2)} ${startY.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(2)} ${endX.toFixed(2)} ${endY.toFixed(2)}`,
    labelPoint,
  };
}

function createSelfLoopPath(node: NodeLayout): {
  pathData: string;
  labelPoint: { x: number; y: number };
} {
  const start = pointAroundNode(node, node.angle - 0.76, NODE_RADIUS - 1);
  const end = pointAroundNode(node, node.angle + 0.76, NODE_RADIUS - 1);
  const control = pointAroundNode(node, node.angle, NODE_RADIUS + 40);

  return {
    pathData: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    labelPoint: {
      x: control.x,
      y: control.y - 8,
    },
  };
}

function pointAroundNode(node: NodeLayout, angle: number, radius: number): { x: number; y: number } {
  return {
    x: node.x + Math.cos(angle) * radius,
    y: node.y + Math.sin(angle) * radius,
  };
}

function quadraticAt(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const inv = 1 - t;
  const x = inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x;
  const y = inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y;
  return { x, y };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function easeInOutCubic(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function createSvgElement<T extends SVGElement>(tagName: string): T {
  return document.createElementNS('http://www.w3.org/2000/svg', tagName) as T;
}

function createTemplateElement(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!(node instanceof HTMLElement)) {
    throw new Error('Expected a single root HTMLElement for graph panel.');
  }
  return node;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}
