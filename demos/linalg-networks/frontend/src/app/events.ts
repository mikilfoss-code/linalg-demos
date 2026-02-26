import type { EventBus } from '@shared/lib/event-bus';
import type { BasisSpace, NetworksState } from './types';

export type NetworksEventMap = {
  'command:add-node': undefined;
  'command:remove-node': undefined;
  'command:set-edge-draft-from': { nodeId: number };
  'command:set-edge-draft-to': { nodeId: number };
  'command:add-edge': undefined;
  'command:remove-edge': { edgeId: string };
  'command:set-edge-flow': { edgeId: string; value: number };
  'command:select-basis': { space: BasisSpace; index: number };
  'state:changed': NetworksState;
};

export type NetworksBus = EventBus<NetworksEventMap>;
