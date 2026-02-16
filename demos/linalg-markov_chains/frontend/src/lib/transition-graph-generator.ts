import { clampNodeCount } from './markov';

export const DEFAULT_TRANSITION_GRAPH_STRATEGY_ID = 'random-directed-no-self';

export type TransitionGraphGeneration = {
  transitionMatrix: number[][];
  initialVector: number[];
  currentVector: number[];
};

export type TransitionGraphGenerationContext = {
  nodeCount: number;
  random: () => number;
};

export type TransitionGraphStrategy = {
  id: string;
  generate: (context: TransitionGraphGenerationContext) => TransitionGraphGeneration;
};

export type TransitionGraphGenerator = {
  defaultStrategyId: string;
  listStrategies: () => string[];
  generate: (options: { nodeCount: number; strategyId?: string }) => TransitionGraphGeneration;
};

/**
 * Create a pluggable graph-generation registry for manual/random/dataset-derived transition builders.
 */
export function createTransitionGraphGenerator(options?: {
  defaultStrategyId?: string;
  customStrategies?: TransitionGraphStrategy[];
  random?: () => number;
}): TransitionGraphGenerator {
  const random = options?.random ?? Math.random;
  const strategies = new Map<string, TransitionGraphStrategy>();

  const builtins: TransitionGraphStrategy[] = [createRandomDirectedNoSelfStrategy()];
  builtins.forEach((strategy) => strategies.set(strategy.id, strategy));
  options?.customStrategies?.forEach((strategy) => strategies.set(strategy.id, strategy));

  const defaultStrategyId =
    options?.defaultStrategyId && strategies.has(options.defaultStrategyId)
      ? options.defaultStrategyId
      : DEFAULT_TRANSITION_GRAPH_STRATEGY_ID;

  return {
    defaultStrategyId,
    listStrategies: () => Array.from(strategies.keys()),
    generate(generateOptions) {
      const nodeCount = clampNodeCount(generateOptions.nodeCount);
      const strategyId = generateOptions.strategyId ?? defaultStrategyId;
      const strategy = strategies.get(strategyId);
      if (!strategy) {
        throw new Error(`Unknown transition-graph strategy: ${strategyId}`);
      }
      return strategy.generate({
        nodeCount,
        random,
      });
    },
  };
}

function createRandomDirectedNoSelfStrategy(): TransitionGraphStrategy {
  return {
    id: DEFAULT_TRANSITION_GRAPH_STRATEGY_ID,
    generate(context) {
      const count = Math.max(2, context.nodeCount);
      const transitionMatrix = Array.from({ length: count }, (_, rowIndex) => {
        const row = Array.from({ length: count }, () => 0);
        const outgoingTargets = chooseOutgoingTargets(rowIndex, count, context.random);
        const probability = 1 / outgoingTargets.length;
        outgoingTargets.forEach((targetIndex) => {
          row[targetIndex] = probability;
        });
        row[rowIndex] = 0;
        return row;
      });

      const uniformValue = 1 / count;
      const uniformVector = Array.from({ length: count }, () => uniformValue);
      return {
        transitionMatrix,
        initialVector: [...uniformVector],
        currentVector: [...uniformVector],
      };
    },
  };
}

function chooseOutgoingTargets(
  rowIndex: number,
  nodeCount: number,
  random: () => number
): number[] {
  const targets: number[] = [];
  for (let colIndex = 0; colIndex < nodeCount; colIndex += 1) {
    if (colIndex === rowIndex) continue;
    if (random() < 0.25) {
      targets.push(colIndex);
    }
  }

  if (targets.length > 0) {
    return targets;
  }

  // Guarantee at least one outgoing edge to a distinct node in every row.
  const sampledIndex = Math.floor(random() * (nodeCount - 1));
  const fallbackTarget = sampledIndex >= rowIndex ? sampledIndex + 1 : sampledIndex;
  return [fallbackTarget];
}
