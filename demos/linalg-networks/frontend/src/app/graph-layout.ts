export type GraphPoint = {
  x: number;
  y: number;
};

/**
 * Place nodes with even angular distribution and deterministic radial/angle offsets.
 */
export function computeCircularNodeLayout(options: {
  nodeCount: number;
  width: number;
  height: number;
  padding: number;
}): GraphPoint[] {
  const { nodeCount, width, height, padding } = options;
  if (nodeCount <= 0) {
    return [];
  }
  if (nodeCount === 1) {
    return [
      {
        x: width / 2,
        y: height / 2,
      },
    ];
  }

  const radius = Math.max(40, Math.min(width, height) / 2 - padding);
  const centerX = width / 2;
  const centerY = height / 2;
  const eccentricityY = 0.9;
  const phase = 0.45;
  const angleJitter = Math.PI / Math.max(30, nodeCount * 11);
  const radiusJitter = Math.min(0.2, 0.1 + nodeCount * 0.008);

  return Array.from({ length: nodeCount }, (_, index) => {
    const baseAngle = (-Math.PI / 2) + (index / nodeCount) * Math.PI * 2;
    const indexSign = index % 2 === 0 ? 1 : -1;
    const localAngle =
      baseAngle +
      indexSign * angleJitter * (0.45 + 0.55 * Math.sin((index + 1) * 1.7 + phase));
    const localRadiusScale =
      1 - radiusJitter * 0.5 + radiusJitter * Math.sin((index + 1) * 2.05 + phase);
    const localRadius = radius * localRadiusScale;
    return {
      x: centerX + localRadius * Math.cos(localAngle),
      y: centerY + localRadius * eccentricityY * Math.sin(localAngle),
    };
  });
}
