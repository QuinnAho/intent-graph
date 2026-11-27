// what the canvas tells nodes and wires: the pin table from planWires, and the node
// the pointer is over, so its wires can stand out.
import { createContext } from 'react';

import type { PinInfo } from './wire-plan.js';

export const PinContext = createContext<ReadonlyMap<string, PinInfo>>(new Map());
export const HoverNodeContext = createContext<string | null>(null);
