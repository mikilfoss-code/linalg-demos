export type GraphPoint = {
  x: number;
  y: number;
};

export type EdgePathGeometry = {
  pathData: string;
  labelPoint: GraphPoint;
};

/**
 * Build a quadratic edge path between two nodes with optional curve offset.
 */
export function buildQuadraticEdgePath(options: {
  fromPoint: GraphPoint;
  toPoint: GraphPoint;
  nodeRadius: number;
  curveOffset: number;
  markerTipOvershoot?: number;
}): EdgePathGeometry {
  const {
    fromPoint,
    toPoint,
    nodeRadius,
    curveOffset,
    markerTipOvershoot = 0,
  } = options;
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / distance;
  const uy = dy / distance;
  const nx = -uy;
  const ny = ux;

  const start = {
    x: fromPoint.x + ux * nodeRadius,
    y: fromPoint.y + uy * nodeRadius,
  };
  const boundaryEnd = {
    x: toPoint.x - ux * nodeRadius,
    y: toPoint.y - uy * nodeRadius,
  };
  const midpoint = {
    x: (start.x + boundaryEnd.x) / 2,
    y: (start.y + boundaryEnd.y) / 2,
  };
  const control = {
    x: midpoint.x + nx * curveOffset,
    y: midpoint.y + ny * curveOffset,
  };
  const end = movePointAgainstDirection(boundaryEnd, {
    x: boundaryEnd.x - control.x,
    y: boundaryEnd.y - control.y,
  }, markerTipOvershoot);

  return {
    pathData: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    labelPoint: {
      x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
      y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
    },
  };
}

/**
 * Build a loop path anchored around one node.
 */
export function buildSelfLoopPath(options: {
  center: GraphPoint;
  nodeRadius: number;
  markerTipOvershoot?: number;
}): EdgePathGeometry {
  const { center, nodeRadius, markerTipOvershoot = 0 } = options;
  const loopRadius = nodeRadius * 1.35;
  const top = {
    x: center.x,
    y: center.y - nodeRadius,
  };
  const controlA = {
    x: center.x - loopRadius,
    y: center.y - loopRadius * 1.9,
  };
  const controlB = {
    x: center.x + loopRadius,
    y: center.y - loopRadius * 1.9,
  };
  const boundaryEnd = {
    x: center.x + 0.01,
    y: center.y - nodeRadius,
  };
  const end = movePointAgainstDirection(boundaryEnd, {
    x: boundaryEnd.x - controlB.x,
    y: boundaryEnd.y - controlB.y,
  }, markerTipOvershoot);

  return {
    pathData: `M ${top.x.toFixed(2)} ${top.y.toFixed(2)} C ${controlA.x.toFixed(2)} ${controlA.y.toFixed(2)} ${controlB.x.toFixed(2)} ${controlB.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    labelPoint: {
      x: center.x,
      y: center.y - loopRadius * 2.15,
    },
  };
}

function movePointAgainstDirection(
  point: GraphPoint,
  direction: GraphPoint,
  distance: number
): GraphPoint {
  if (distance <= 0) {
    return point;
  }
  const magnitude = Math.hypot(direction.x, direction.y);
  if (magnitude <= 1e-6) {
    return point;
  }
  return {
    x: point.x - (direction.x / magnitude) * distance,
    y: point.y - (direction.y / magnitude) * distance,
  };
}
