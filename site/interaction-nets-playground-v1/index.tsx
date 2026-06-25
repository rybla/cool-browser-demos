/**
 * Interaction Nets Playground
 * Implements a graphical editor and physical simulator for interaction net rewriting.
 * Supports Lafont's Interaction Combinators, Unary Arithmetic, Boolean Logic,
 * and user-defined custom systems with a visual rule editor.
 */

// ==========================================
// 1. DATA MODELS & TYPES
// ==========================================

interface Port {
  id: string;
  cellId: string | null; // null if it is a free port
  index: number; // 0 for principal, 1..N for auxiliary ports
}

interface Cell {
  id: string;
  symbol: string;
  ports: string[]; // List of port IDs. ports[0] is principal.
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  scale: number; // For spawn/despawn animations
  opacity: number; // For fade animations
  isSpawning: boolean;
  isDespawning: boolean;
}

interface FreePort {
  id: string;
  portId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Wire {
  id: string;
  portA: string;
  portB: string;
}

interface Loop {
  id: string;
  portId: string;
}

interface RuleRHS {
  cells: Array<{
    symbol: string;
    ports: number[]; // Port indices in the rule's local scope (0..arity1+arity2-1 are free ports)
  }>;
  wires: Array<[number, number]>;
  loops: number[];
}

interface Rule {
  symbol1: string;
  symbol2: string;
  rhs: RuleRHS;
}

interface SymbolDef {
  name: string;
  arity: number;
  color: string;
}

interface System {
  name: string;
  symbols: Record<string, SymbolDef>;
  rules: Rule[];
}

// Particle system for rewrite explosion animations
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// Rewrite animation tracking
interface RewriteAnimation {
  id: string;
  startTime: number;
  duration: number;
  midpoint: { x: number; y: number };
  particles: Particle[];
  oldCells: Array<{
    x: number;
    y: number;
    angle: number;
    symbol: string;
    color: string;
    arity: number;
  }>;
}

// ==========================================
// 2. BUILT-IN SYSTEMS & PRESETS
// ==========================================

const SYSTEMS: Record<string, System> = {
  combinators: {
    name: "Interaction Combinators",
    symbols: {
      Dup1: { name: "Dup1", arity: 2, color: "#f97316" }, // Orange
      Dup2: { name: "Dup2", arity: 2, color: "#06b6d4" }, // Cyan
      Era: { name: "Era", arity: 0, color: "#6b7280" }, // Gray
    },
    rules: [
      // Dup1 <-> Dup1 (Annihilation)
      {
        symbol1: "Dup1",
        symbol2: "Dup1",
        rhs: {
          cells: [],
          wires: [
            [0, 2],
            [1, 3],
          ],
          loops: [],
        },
      },
      // Dup2 <-> Dup2 (Annihilation)
      {
        symbol1: "Dup2",
        symbol2: "Dup2",
        rhs: {
          cells: [],
          wires: [
            [0, 2],
            [1, 3],
          ],
          loops: [],
        },
      },
      // Era <-> Era (Annihilation)
      {
        symbol1: "Era",
        symbol2: "Era",
        rhs: {
          cells: [],
          wires: [],
          loops: [],
        },
      },
      // Dup1 <-> Era (Erasure)
      {
        symbol1: "Dup1",
        symbol2: "Era",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] },
            { symbol: "Era", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Dup2 <-> Era (Erasure)
      {
        symbol1: "Dup2",
        symbol2: "Era",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] },
            { symbol: "Era", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Dup1 <-> Dup2 (Commutation)
      {
        symbol1: "Dup1",
        symbol2: "Dup2",
        rhs: {
          cells: [
            { symbol: "Dup2", ports: [4, 5, 6] }, // A: principal 4, auxs 5, 6
            { symbol: "Dup2", ports: [7, 8, 9] }, // B: principal 7, auxs 8, 9
            { symbol: "Dup1", ports: [10, 11, 12] }, // C: principal 10, auxs 11, 12
            { symbol: "Dup1", ports: [13, 14, 15] }, // D: principal 13, auxs 14, 15
          ],
          wires: [
            [4, 0],
            [7, 1], // A principal to Dup1 aux 1, B principal to Dup1 aux 2
            [10, 2],
            [13, 3], // C principal to Dup2 aux 1, D principal to Dup2 aux 2
            [5, 11],
            [6, 14], // A auxs to C/D aux 1s
            [8, 12],
            [9, 15], // B auxs to C/D aux 2s
          ],
          loops: [],
        },
      },
    ],
  },

  arithmetic: {
    name: "Unary Arithmetic",
    symbols: {
      Z: { name: "Z", arity: 0, color: "#3b82f6" }, // Blue (Zero)
      S: { name: "S", arity: 1, color: "#10b981" }, // Green (Successor)
      Add: { name: "Add", arity: 2, color: "#8b5cf6" }, // Purple (Addition)
      Mul: { name: "Mul", arity: 2, color: "#eab308" }, // Yellow (Multiplication)
      Dup: { name: "Dup", arity: 2, color: "#f97316" }, // Orange (Duplicator)
      Era: { name: "Era", arity: 0, color: "#6b7280" }, // Gray (Eraser)
    },
    rules: [
      // Add <-> Z (Zero addition: Add(Z, y) -> y)
      {
        symbol1: "Add",
        symbol2: "Z",
        rhs: {
          cells: [],
          wires: [[0, 1]], // Connect aux 1 (y) directly to aux 2 (result)
          loops: [],
        },
      },
      // Add <-> S (Successor addition: Add(S(x), y) -> S(Add(x, y)))
      {
        symbol1: "Add",
        symbol2: "S",
        rhs: {
          cells: [
            { symbol: "Add", ports: [3, 0, 4] }, // Add(x, y): principal 3 connects to x, aux1 connects to y, aux2 connects to internal 4
            { symbol: "S", ports: [1, 4] }, // S(Add): principal connects to result (1), aux connects to internal 4
          ],
          wires: [
            [3, 2], // Add principal to S aux 1 (x)
          ],
          loops: [],
        },
      },
      // Mul <-> Z (Zero multiplication: Mul(Z, y) -> Era(y) + Z)
      {
        symbol1: "Mul",
        symbol2: "Z",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] }, // Erase y
            { symbol: "Z", ports: [1] }, // Return Z
          ],
          wires: [],
          loops: [],
        },
      },
      // Mul <-> S (Successor multiplication: Mul(S(x), y) -> Add(y, Mul(x, y)) with duplication of y)
      {
        symbol1: "Mul",
        symbol2: "S",
        rhs: {
          cells: [
            { symbol: "Dup", ports: [3, 4, 5] }, // Dup(y): principal connects to y, auxs are 4, 5
            { symbol: "Mul", ports: [6, 4, 7] }, // Mul(x, y1): principal connects to x, aux1 to y1, aux2 to internal 7
            { symbol: "Add", ports: [7, 5, 1] }, // Add(Mul, y2): principal connects to Mul result, aux1 to y2, aux2 to result (1)
          ],
          wires: [
            [3, 0], // Dup principal to y
            [6, 2], // Mul principal to S aux 1 (x)
          ],
          loops: [],
        },
      },
      // Era <-> Z
      {
        symbol1: "Era",
        symbol2: "Z",
        rhs: { cells: [], wires: [], loops: [] },
      },
      // Era <-> S
      {
        symbol1: "Era",
        symbol2: "S",
        rhs: {
          cells: [{ symbol: "Era", ports: [0] }],
          wires: [],
          loops: [],
        },
      },
      // Era <-> Add
      {
        symbol1: "Era",
        symbol2: "Add",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] },
            { symbol: "Era", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Era <-> Mul
      {
        symbol1: "Era",
        symbol2: "Mul",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] },
            { symbol: "Era", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Dup <-> Z
      {
        symbol1: "Dup",
        symbol2: "Z",
        rhs: {
          cells: [
            { symbol: "Z", ports: [0] },
            { symbol: "Z", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Dup <-> S
      {
        symbol1: "Dup",
        symbol2: "S",
        rhs: {
          cells: [
            { symbol: "Dup", ports: [3, 4, 5] },
            { symbol: "S", ports: [0, 4] },
            { symbol: "S", ports: [1, 5] },
          ],
          wires: [[3, 2]],
          loops: [],
        },
      },
      // Dup <-> Add
      {
        symbol1: "Dup",
        symbol2: "Add",
        rhs: {
          cells: [
            { symbol: "Dup", ports: [4, 5, 6] },
            { symbol: "Dup", ports: [7, 8, 9] },
            { symbol: "Add", ports: [0, 5, 8] },
            { symbol: "Add", ports: [1, 6, 9] },
          ],
          wires: [
            [4, 2],
            [7, 3],
          ],
          loops: [],
        },
      },
    ],
  },

  logic: {
    name: "Boolean Logic",
    symbols: {
      T: { name: "T", arity: 0, color: "#10b981" }, // Green (True)
      F: { name: "F", arity: 0, color: "#ef4444" }, // Red (False)
      Not: { name: "Not", arity: 1, color: "#f59e0b" }, // Amber (Not)
      And: { name: "And", arity: 2, color: "#3b82f6" }, // Blue (And)
      Or: { name: "Or", arity: 2, color: "#8b5cf6" }, // Purple (Or)
      Dup: { name: "Dup", arity: 2, color: "#f97316" }, // Orange (Duplicator)
      Era: { name: "Era", arity: 0, color: "#6b7280" }, // Gray (Eraser)
    },
    rules: [
      // Not <-> T -> F
      {
        symbol1: "Not",
        symbol2: "T",
        rhs: {
          cells: [{ symbol: "F", ports: [0] }],
          wires: [],
          loops: [],
        },
      },
      // Not <-> F -> T
      {
        symbol1: "Not",
        symbol2: "F",
        rhs: {
          cells: [{ symbol: "T", ports: [0] }],
          wires: [],
          loops: [],
        },
      },
      // And <-> T -> Connect arg2 to result
      {
        symbol1: "And",
        symbol2: "T",
        rhs: {
          cells: [],
          wires: [[0, 1]],
          loops: [],
        },
      },
      // And <-> F -> Erase arg2, return F
      {
        symbol1: "And",
        symbol2: "F",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] },
            { symbol: "F", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Or <-> T -> Erase arg2, return T
      {
        symbol1: "Or",
        symbol2: "T",
        rhs: {
          cells: [
            { symbol: "Era", ports: [0] },
            { symbol: "T", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Or <-> F -> Connect arg2 to result
      {
        symbol1: "Or",
        symbol2: "F",
        rhs: {
          cells: [],
          wires: [[0, 1]],
          loops: [],
        },
      },
      // Era <-> T, Era <-> F
      {
        symbol1: "Era",
        symbol2: "T",
        rhs: { cells: [], wires: [], loops: [] },
      },
      {
        symbol1: "Era",
        symbol2: "F",
        rhs: { cells: [], wires: [], loops: [] },
      },
      // Dup <-> T -> Two Ts
      {
        symbol1: "Dup",
        symbol2: "T",
        rhs: {
          cells: [
            { symbol: "T", ports: [0] },
            { symbol: "T", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
      // Dup <-> F -> Two Fs
      {
        symbol1: "Dup",
        symbol2: "F",
        rhs: {
          cells: [
            { symbol: "F", ports: [0] },
            { symbol: "F", ports: [1] },
          ],
          wires: [],
          loops: [],
        },
      },
    ],
  },

  custom: {
    name: "Custom System",
    symbols: {},
    rules: [],
  },
};

// Preset Net Configurations
interface Preset {
  name: string;
  cells: Array<{
    id: string;
    symbol: string;
    x: number;
    y: number;
    angle: number;
  }>;
  freePorts: Array<{ id: string; x: number; y: number }>;
  wires: Array<[string, string]>;
  loops: string[];
}

const PRESETS: Record<string, Preset[]> = {
  combinators: [
    {
      name: "Annihilation Demo (Dup1 - Dup1)",
      cells: [
        { id: "c1", symbol: "Dup1", x: 250, y: 300, angle: Math.PI / 2 },
        { id: "c2", symbol: "Dup1", x: 450, y: 300, angle: -Math.PI / 2 },
      ],
      freePorts: [
        { id: "f1", x: 150, y: 220 },
        { id: "f2", x: 150, y: 380 },
        { id: "f3", x: 550, y: 220 },
        { id: "f4", x: 550, y: 380 },
      ],
      wires: [
        ["c1_p0", "c2_p0"], // Active pair
        ["c1_p1", "f1"],
        ["c1_p2", "f2"],
        ["c2_p1", "f3"],
        ["c2_p2", "f4"],
      ],
      loops: [],
    },
    {
      name: "Commutation Grid (Dup1 - Dup2)",
      cells: [
        { id: "c1", symbol: "Dup1", x: 280, y: 300, angle: Math.PI / 2 },
        { id: "c2", symbol: "Dup2", x: 420, y: 300, angle: -Math.PI / 2 },
      ],
      freePorts: [
        { id: "f1", x: 180, y: 200 },
        { id: "f2", x: 180, y: 400 },
        { id: "f3", x: 520, y: 200 },
        { id: "f4", x: 520, y: 400 },
      ],
      wires: [
        ["c1_p0", "c2_p0"], // Active pair
        ["c1_p1", "f1"],
        ["c1_p2", "f2"],
        ["c2_p1", "f3"],
        ["c2_p2", "f4"],
      ],
      loops: [],
    },
    {
      name: "Eraser Cascade",
      cells: [
        { id: "c1", symbol: "Dup1", x: 300, y: 200, angle: Math.PI },
        { id: "c2", symbol: "Era", x: 300, y: 320, angle: 0 },
        { id: "c3", symbol: "Dup2", x: 450, y: 200, angle: 0 },
      ],
      freePorts: [
        { id: "f1", x: 200, y: 150 },
        { id: "f2", x: 550, y: 150 },
      ],
      wires: [
        ["c1_p0", "c2_p0"],
        ["c1_p1", "f1"],
        ["c1_p2", "c3_p1"],
        ["c3_p0", "f2"],
      ],
      loops: ["c3_p2"],
    },
  ],

  arithmetic: [
    {
      name: "Addition: 1 + 1 = 2",
      cells: [
        // Representing 1 as S(Z) on addition input
        { id: "zero1", symbol: "Z", x: 150, y: 150, angle: 0 },
        { id: "succ1", symbol: "S", x: 230, y: 180, angle: Math.PI / 6 },
        { id: "add", symbol: "Add", x: 350, y: 250, angle: -Math.PI / 4 },
        // Second argument is 1: S(Z)
        { id: "zero2", symbol: "Z", x: 550, y: 180, angle: Math.PI },
        { id: "succ2", symbol: "S", x: 470, y: 220, angle: -Math.PI / 6 },
      ],
      freePorts: [
        { id: "res", x: 350, y: 400 }, // Output result
      ],
      wires: [
        ["succ1_p0", "add_p0"], // Active wire (Add principal connects to successor)
        ["succ1_p1", "zero1_p0"],
        ["add_p1", "succ2_p0"],
        ["succ2_p1", "zero2_p0"],
        ["add_p2", "res"],
      ],
      loops: [],
    },
    {
      name: "Multiplication: 2 * 1 = 2",
      cells: [
        // 2: S(S(Z))
        { id: "z1", symbol: "Z", x: 100, y: 120, angle: 0 },
        { id: "s1", symbol: "S", x: 180, y: 150, angle: 0 },
        { id: "s2", symbol: "S", x: 260, y: 180, angle: 0 },
        // Mul cell
        { id: "mul", symbol: "Mul", x: 360, y: 250, angle: -Math.PI / 3 },
        // 1: S(Z)
        { id: "z2", symbol: "Z", x: 550, y: 150, angle: Math.PI },
        { id: "s3", symbol: "S", x: 470, y: 200, angle: Math.PI },
      ],
      freePorts: [{ id: "res", x: 360, y: 420 }],
      wires: [
        ["s2_p0", "mul_p0"], // Active wire (Mul principal to S)
        ["s2_p1", "s1_p0"],
        ["s1_p1", "z1_p0"],
        ["mul_p1", "s3_p0"],
        ["s3_p1", "z2_p0"],
        ["mul_p2", "res"],
      ],
      loops: [],
    },
  ],

  logic: [
    {
      name: "Double Negation: Not(Not(True)) -> True",
      cells: [
        { id: "t", symbol: "T", x: 200, y: 300, angle: 0 },
        { id: "not1", symbol: "Not", x: 320, y: 300, angle: Math.PI },
        { id: "not2", symbol: "Not", x: 460, y: 300, angle: 0 },
      ],
      freePorts: [{ id: "out", x: 580, y: 300 }],
      wires: [
        ["not1_p0", "t_p0"], // Active pair: Not(True)
        ["not1_p1", "not2_p0"],
        ["not2_p1", "out"],
      ],
      loops: [],
    },
    {
      name: "And Gate: True And False -> False",
      cells: [
        { id: "t", symbol: "T", x: 220, y: 180, angle: Math.PI / 4 },
        { id: "and", symbol: "And", x: 320, y: 250, angle: -Math.PI / 4 },
        { id: "f", symbol: "F", x: 450, y: 250, angle: -Math.PI / 2 },
      ],
      freePorts: [{ id: "out", x: 320, y: 380 }],
      wires: [
        ["and_p0", "t_p0"], // Active pair: And <-> True
        ["and_p1", "f_p0"],
        ["and_p2", "out"],
      ],
      loops: [],
    },
  ],

  custom: [],
};

// ==========================================
// 3. GRAPH HELPER FUNCTIONS
// ==========================================

function getUniqueId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function getSymbolColor(symbol: string, currentSystem: System): string {
  const def = currentSystem.symbols[symbol];
  return def ? def.color : "#cbd5e1"; // Slate color fallback
}

function getSymbolArity(symbol: string, currentSystem: System): number {
  const def = currentSystem.symbols[symbol];
  return def ? def.arity : 0;
}

// Compute the offset positions of auxiliary ports in the local coordinate space of a cell
function getPortOffsets(arity: number): Array<{ x: number; y: number }> {
  const offsets: Array<{ x: number; y: number }> = [{ x: 0, y: -22 }]; // Principal port always at apex (pointing up)

  if (arity === 0) {
    return offsets;
  }

  if (arity === 1) {
    offsets.push({ x: 0, y: 15 });
  } else {
    const spacing = 46;
    for (let i = 0; i < arity; i++) {
      const t = i / (arity - 1);
      const x = -spacing / 2 + spacing * t;
      offsets.push({ x, y: 15 });
    }
  }

  return offsets;
}

// Translate local port offset to world coordinates
function getPortWorldPosition(
  cell: Cell,
  portIndex: number,
  currentSystem: System
): { x: number; y: number } {
  const arity = getSymbolArity(cell.symbol, currentSystem);
  const offsets = getPortOffsets(arity);
  const offset = offsets[portIndex];
  if (!offset) {
    return { x: cell.x, y: cell.y };
  }

  const cos = Math.cos(cell.angle);
  const sin = Math.sin(cell.angle);
  const scale = cell.scale;

  return {
    x: cell.x + (offset.x * cos - offset.y * sin) * scale,
    y: cell.y + (offset.x * sin + offset.y * cos) * scale,
  };
}

// Get the normal direction pointing outwards from a port in world space
function getPortWorldDirection(
  cell: Cell,
  portIndex: number,
  currentSystem: System
): { x: number; y: number } {
  const arity = getSymbolArity(cell.symbol, currentSystem);
  const offsets = getPortOffsets(arity);
  const offset = offsets[portIndex];
  if (!offset) {
    return { x: 0, y: -1 };
  }

  // Principal port points straight out of the apex (up)
  // Auxiliary ports point straight down
  const localAngle = portIndex === 0 ? -Math.PI / 2 : Math.PI / 2;
  const worldAngle = cell.angle + localAngle;

  return {
    x: Math.cos(worldAngle),
    y: Math.sin(worldAngle),
  };
}

// ==========================================
// 4. INTERACTION NET CLASS
// ==========================================

class InteractionNet {
  cells: Map<string, Cell> = new Map();
  freePorts: Map<string, FreePort> = new Map();
  wires: Map<string, Wire> = new Map();
  loops: Map<string, Loop> = new Map();
  ports: Map<string, Port> = new Map(); // Global port lookup table
  system: System;

  constructor(system: System) {
    this.system = system;
  }

  clear() {
    this.cells.clear();
    this.freePorts.clear();
    this.wires.clear();
    this.loops.clear();
    this.ports.clear();
  }

  addCell(symbol: string, x: number, y: number, angle = 0): Cell {
    const id = "c_" + getUniqueId();
    const arity = getSymbolArity(symbol, this.system);
    const cellPorts: string[] = [];

    // Allocate port IDs
    for (let i = 0; i <= arity; i++) {
      const pId = `${id}_p${i}`;
      cellPorts.push(pId);
      this.ports.set(pId, { id: pId, cellId: id, index: i });
    }

    const cell: Cell = {
      id,
      symbol,
      ports: cellPorts,
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      vAngle: 0,
      scale: 0.01,
      opacity: 0.01,
      isSpawning: true,
      isDespawning: false,
    };

    this.cells.set(id, cell);
    return cell;
  }

  addFreePort(x: number, y: number): FreePort {
    const id = "f_" + getUniqueId();
    const portId = `${id}_port`;

    this.ports.set(portId, { id: portId, cellId: null, index: 0 });

    const freePort: FreePort = {
      id,
      portId,
      x,
      y,
      vx: 0,
      vy: 0,
    };

    this.freePorts.set(id, freePort);
    return freePort;
  }

  addWire(portA: string, portB: string): Wire | null {
    if (portA === portB) {
      this.addLoop(portA);
      return null;
    }

    // A port can only connect to exactly one wire
    this.removeWireOnPort(portA);
    this.removeWireOnPort(portB);
    this.removeLoopOnPort(portA);
    this.removeLoopOnPort(portB);

    const id = "w_" + getUniqueId();
    const wire: Wire = { id, portA, portB };
    this.wires.set(id, wire);
    return wire;
  }

  addLoop(portId: string): Loop {
    this.removeWireOnPort(portId);
    this.removeLoopOnPort(portId);

    const id = "l_" + getUniqueId();
    const loop: Loop = { id, portId };
    this.loops.set(id, loop);
    return loop;
  }

  removeCell(id: string) {
    const cell = this.cells.get(id);
    if (!cell) return;

    // Remove connected wires and loops
    for (const pId of cell.ports) {
      this.removeWireOnPort(pId);
      this.removeLoopOnPort(pId);
      this.ports.delete(pId);
    }

    this.cells.delete(id);
  }

  removeFreePort(id: string) {
    const fp = this.freePorts.get(id);
    if (!fp) return;

    this.removeWireOnPort(fp.portId);
    this.removeLoopOnPort(fp.portId);
    this.ports.delete(fp.portId);
    this.freePorts.delete(id);
  }

  removeWire(id: string) {
    this.wires.delete(id);
  }

  removeLoop(id: string) {
    this.loops.delete(id);
  }

  private removeWireOnPort(portId: string) {
    for (const [wId, wire] of this.wires.entries()) {
      if (wire.portA === portId || wire.portB === portId) {
        this.wires.delete(wId);
      }
    }
  }

  private removeLoopOnPort(portId: string) {
    for (const [lId, loop] of this.loops.entries()) {
      if (loop.portId === portId) {
        this.loops.delete(lId);
      }
    }
  }

  getPortConnectedWire(
    portId: string
  ): { wireId: string; otherPortId: string } | null {
    for (const [wId, wire] of this.wires.entries()) {
      if (wire.portA === portId) {
        return { wireId: wId, otherPortId: wire.portB };
      }
      if (wire.portB === portId) {
        return { wireId: wId, otherPortId: wire.portA };
      }
    }
    return null;
  }

  // Find all active wires (linking two principal ports)
  getActiveWires(): Array<{
    wireId: string;
    portA: string;
    portB: string;
    cellA: Cell;
    cellB: Cell;
  }> {
    const active: Array<{
      wireId: string;
      portA: string;
      portB: string;
      cellA: Cell;
      cellB: Cell;
    }> = [];

    for (const [wId, wire] of this.wires.entries()) {
      const pA = this.ports.get(wire.portA);
      const pB = this.ports.get(wire.portB);

      if (pA && pB && pA.cellId && pB.cellId) {
        // Both ports belong to cells
        const cA = this.cells.get(pA.cellId);
        const cB = this.cells.get(pB.cellId);

        if (cA && cB && !cA.isDespawning && !cB.isDespawning) {
          // Both are principal ports
          if (pA.index === 0 && pB.index === 0) {
            active.push({
              wireId: wId,
              portA: wire.portA,
              portB: wire.portB,
              cellA: cA,
              cellB: cB,
            });
          }
        }
      }
    }

    return active;
  }

  // Find rewrite rule for a pair of symbols
  findRule(sym1: string, sym2: string): { rule: Rule; swap: boolean } | null {
    for (const rule of this.system.rules) {
      if (rule.symbol1 === sym1 && rule.symbol2 === sym2) {
        return { rule, swap: false };
      }
      if (rule.symbol1 === sym2 && rule.symbol2 === sym1) {
        return { rule, swap: true };
      }
    }
    return null;
  }

  // Apply a rewrite rule at a given active wire
  rewrite(wireId: string): RewriteAnimation | null {
    const wire = this.wires.get(wireId);
    if (!wire) return null;

    const pA = this.ports.get(wire.portA);
    const pB = this.ports.get(wire.portB);
    if (!pA || !pB || !pA.cellId || !pB.cellId) return null;

    const cellA = this.cells.get(pA.cellId);
    const cellB = this.cells.get(pB.cellId);
    if (!cellA || !cellB) return null;

    // Check for rule
    const ruleMatch = this.findRule(cellA.symbol, cellB.symbol);
    if (!ruleMatch) return null;

    const { rule, swap } = ruleMatch;

    // Sort cells according to rule signature
    const c1 = swap ? cellB : cellA;
    const c2 = swap ? cellA : cellB;

    const arity1 = getSymbolArity(c1.symbol, this.system);
    const arity2 = getSymbolArity(c2.symbol, this.system);

    const midpoint = {
      x: (c1.x + c2.x) / 2,
      y: (c1.y + c2.y) / 2,
    };

    // 1. Gather auxiliary ports of c1 and c2
    // c1_p1..c1_pN (length arity1)
    // c2_p1..c2_pM (length arity2)
    const lhsAux: string[] = [];
    for (let i = 1; i <= arity1; i++) {
      lhsAux.push(c1.ports[i]!);
    }
    for (let i = 1; i <= arity2; i++) {
      lhsAux.push(c2.ports[i]!);
    }

    // 2. Identify the external connections from the auxiliary ports
    const externalConnections: Record<number, string | null> = {};
    for (let i = 0; i < lhsAux.length; i++) {
      const portId = lhsAux[i]!;
      const conn = this.getPortConnectedWire(portId);
      if (conn) {
        externalConnections[i] = conn.otherPortId;
        this.removeWire(conn.wireId); // Disconnect
      } else {
        // Look up if it was a self loop or just free
        externalConnections[i] = null;
      }
    }

    // 3. Setup cleanup for anims
    const oldCellsAnimData = [
      {
        x: c1.x,
        y: c1.y,
        angle: c1.angle,
        symbol: c1.symbol,
        color: getSymbolColor(c1.symbol, this.system),
        arity: arity1,
      },
      {
        x: c2.x,
        y: c2.y,
        angle: c2.angle,
        symbol: c2.symbol,
        color: getSymbolColor(c2.symbol, this.system),
        arity: arity2,
      },
    ];

    // 4. Delete the interacting cells and active wire
    this.removeCell(c1.id);
    this.removeCell(c2.id);
    this.removeWire(wireId);

    // 5. Instantiate RHS
    const rhsToHostPort = new Map<number, string>();

    // Map RHS free ports to existing host ports
    const totalFreePorts = arity1 + arity2;
    for (let i = 0; i < totalFreePorts; i++) {
      const extPort = externalConnections[i];
      if (extPort) {
        rhsToHostPort.set(i, extPort);
      }
    }

    // Create RHS cells
    const newCellsList: Cell[] = [];
    rule.rhs.cells.forEach((rc, cIdx) => {
      // Create cell in host net
      const offsetDistance = 15;
      const angleOffset =
        (cIdx / Math.max(1, rule.rhs.cells.length)) * Math.PI * 2;
      const spawnX = midpoint.x + Math.cos(angleOffset) * offsetDistance;
      const spawnY = midpoint.y + Math.sin(angleOffset) * offsetDistance;

      const newC = this.addCell(
        rc.symbol,
        spawnX,
        spawnY,
        (c1.angle + c2.angle) / 2
      );

      // Add outward velocity push
      newC.vx = Math.cos(angleOffset) * 8;
      newC.vy = Math.sin(angleOffset) * 8;

      newCellsList.push(newC);

      // Map RHS cell ports to host ports
      rc.ports.forEach((rhsPortIdx, localPortIdx) => {
        if (rhsPortIdx >= totalFreePorts) {
          // Internal port: map RHS port index to this cell's fresh port
          const hostPortId = newC.ports[localPortIdx]!;
          rhsToHostPort.set(rhsPortIdx, hostPortId);
        } else {
          // Free port: connect this cell's port to whatever the RHS free port maps to
          const hostPortId = newC.ports[localPortIdx]!;
          const extPort = rhsToHostPort.get(rhsPortIdx);
          if (extPort) {
            // Already mapped, connect them
            this.addWire(hostPortId, extPort);
          } else {
            // Store mapping for when the wire is processed
            rhsToHostPort.set(rhsPortIdx, hostPortId);
          }
        }
      });
    });

    // Create wires from RHS spec
    rule.rhs.wires.forEach(([idxA, idxB]) => {
      const hostA = rhsToHostPort.get(idxA);
      const hostB = rhsToHostPort.get(idxB);

      if (hostA && hostB) {
        this.addWire(hostA, hostB);
      } else if (hostA) {
        // one port was unconnected, spawn free port
        const fp = this.addFreePort(midpoint.x, midpoint.y);
        this.addWire(hostA, fp.portId);
      } else if (hostB) {
        const fp = this.addFreePort(midpoint.x, midpoint.y);
        this.addWire(hostB, fp.portId);
      }
    });

    // Create loops from RHS spec
    rule.rhs.loops.forEach((idx) => {
      const hostPort = rhsToHostPort.get(idx);
      if (hostPort) {
        this.addLoop(hostPort);
      }
    });

    // Construct animation payload
    const animId = "anim_" + getUniqueId();
    const color1 = getSymbolColor(c1.symbol, this.system);
    const color2 = getSymbolColor(c2.symbol, this.system);

    // Spawn particles
    const particles: Particle[] = [];
    const particleCount = 20;
    for (let k = 0; k < particleCount; k++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x: midpoint.x,
        y: midpoint.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: k % 2 === 0 ? color1 : color2,
        size: 2 + Math.random() * 4,
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 20,
      });
    }

    return {
      id: animId,
      startTime: Date.now(),
      duration: 350, // 350ms duration
      midpoint,
      particles,
      oldCells: oldCellsAnimData,
    };
  }

  // Load a preset configuration into the net
  loadPreset(preset: Preset) {
    this.clear();

    // 1. Add cells
    preset.cells.forEach((c) => {
      const cell = this.addCell(c.symbol, c.x, c.y, c.angle);
      // Hack the ID to match preset connection specifications
      const oldId = cell.id;
      this.cells.delete(oldId);
      cell.id = c.id;

      // Update port lookups
      cell.ports.forEach((pId, idx) => {
        this.ports.delete(pId);
        const newPId = `${c.id}_p${idx}`;
        cell.ports[idx] = newPId;
        this.ports.set(newPId, { id: newPId, cellId: c.id, index: idx });
      });

      this.cells.set(c.id, cell);
    });

    // 2. Add free ports
    preset.freePorts.forEach((fp) => {
      const freePort = this.addFreePort(fp.x, fp.y);
      const oldId = freePort.id;
      const oldPortId = freePort.portId;

      this.freePorts.delete(oldId);
      this.ports.delete(oldPortId);

      freePort.id = fp.id;
      freePort.portId = fp.id; // Treat ID as port name for simplicity in presets
      this.ports.set(fp.id, { id: fp.id, cellId: null, index: 0 });
      this.freePorts.set(fp.id, freePort);
    });

    // 3. Add wires
    preset.wires.forEach(([pA, pB]) => {
      this.addWire(pA, pB);
    });

    // 4. Add loops
    preset.loops.forEach((pId) => {
      this.addLoop(pId);
    });
  }
}

// ==========================================
// 5. APPLICATION STATE & GRAPHICS ENVIRONMENT
// ==========================================

let activeSystemKey = "combinators";
let activeSystem = SYSTEMS[activeSystemKey]!;
let activeNet = new InteractionNet(activeSystem);
let initialPresetNet: Preset | null = null; // Save original for reset

// UI Mode
type AppMode = "edit" | "sim";
let currentMode: AppMode = "edit";

// Simulation Playing State
let isPlaying = false;
let simSpeed = 5; // Range 1..10
let playIntervalId: number | null = null;
let rewritesAppliedCount = 0;

// Dragging & Interaction State
let selectedElement: {
  type: "cell" | "wire" | "freePort" | "port" | "rotationHandle";
  id: string;
} | null = null;
let hoveredPortId: string | null = null;
let hoveredCellId: string | null = null;
let activeDragId: string | null = null;
let activeDragType: "cell" | "freePort" | "canvas" | null = null;
let wireStartPortId: string | null = null; // Port where user started dragging a wire
let tempMousePos = { x: 0, y: 0 }; // World space coordinate of mouse for wire preview

// Canvas Zoom & Pan
const panOffset = { x: 0, y: 0 };
let zoomScale = 1.0;
let lastMouseCanvasPos = { x: 0, y: 0 };

// Animation collection
let activeAnimations: RewriteAnimation[] = [];

// DOM Elements
let canvasEl: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

// Visual Rule Editor State (modal)
let modalNet: InteractionNet | null = null;
let modalWireStartPortId: string | null = null;
let modalSelectedElement: {
  type: "cell" | "wire" | "freePort" | "port" | "rotationHandle";
  id: string;
} | null = null;
let isRotatingCell = false;
let modalDragId: string | null = null;
let modalDragType: "cell" | "freePort" | null = null;

// ==========================================
// 6. PHYSICS LAYOUT ENGINE
// ==========================================

function updatePhysics(net: InteractionNet) {
  const cells = Array.from(net.cells.values());
  const freePorts = Array.from(net.freePorts.values());

  const repStrength = 150;
  const springStrength = 0.05;
  const torqueStrength = 0.08;
  const restLength = 65;

  // 1. Repulsion between all node centers (cells and free ports)
  const allNodes: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    setVel: (vx: number, vy: number) => void;
  }> = [];

  cells.forEach((c) => {
    allNodes.push({
      x: c.x,
      y: c.y,
      vx: c.vx,
      vy: c.vy,
      setVel: (vx, vy) => {
        c.vx = vx;
        c.vy = vy;
      },
    });
  });

  freePorts.forEach((fp) => {
    allNodes.push({
      x: fp.x,
      y: fp.y,
      vx: fp.vx,
      vy: fp.vy,
      setVel: (vx, vy) => {
        fp.vx = vx;
        fp.vy = vy;
      },
    });
  });

  for (let i = 0; i < allNodes.length; i++) {
    const nodeA = allNodes[i]!;
    for (let j = i + 1; j < allNodes.length; j++) {
      const nodeB = allNodes[j]!;
      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

      if (dist < 400) {
        // Push apart
        const fForce = (repStrength * 100) / (dist * dist);
        const fx = (dx / dist) * fForce;
        const fy = (dy / dist) * fForce;

        nodeA.setVel(nodeA.vx - fx, nodeA.vy - fy);
        nodeB.setVel(nodeB.vx + fx, nodeB.vy + fy);
      }
    }
  }

  // 2. Wire Tension and Torque
  net.wires.forEach((wire) => {
    const pA = net.ports.get(wire.portA);
    const pB = net.ports.get(wire.portB);
    if (!pA || !pB) return;

    // Get positions
    let posA = { x: 0, y: 0 };
    let cellA: Cell | null = null;
    if (pA.cellId) {
      cellA = net.cells.get(pA.cellId) || null;
      if (cellA) posA = getPortWorldPosition(cellA, pA.index, net.system);
    } else {
      const fp = net.freePorts.get(pA.id.split("_")[0]!);
      if (fp) posA = { x: fp.x, y: fp.y };
    }

    let posB = { x: 0, y: 0 };
    let cellB: Cell | null = null;
    if (pB.cellId) {
      cellB = net.cells.get(pB.cellId) || null;
      if (cellB) posB = getPortWorldPosition(cellB, pB.index, net.system);
    } else {
      const fp = net.freePorts.get(pB.id.split("_")[0]!);
      if (fp) posB = { x: fp.x, y: fp.y };
    }

    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

    // Spring force vector on A (towards B)
    const springForce = (dist - restLength) * springStrength;
    const fx = (dx / dist) * springForce;
    const fy = (dy / dist) * springForce;

    // Apply forces
    if (cellA) {
      // Translational force on center
      cellA.vx += fx;
      cellA.vy += fy;

      // Angular torque: T = r x F
      // relative port offset from cell center: r = worldPos - centerPos
      const rx = posA.x - cellA.x;
      const ry = posA.y - cellA.y;

      // Torque magnitude: rx * fy - ry * fx
      const torque = (rx * fy - ry * fx) * torqueStrength * 0.01;

      // Cap torque to keep stable
      cellA.vAngle += Math.max(-0.15, Math.min(0.15, torque));
    } else {
      // Free port
      const fpA = net.freePorts.get(pA.id.split("_")[0]!);
      if (fpA && fpA.id !== activeDragId) {
        fpA.vx += fx;
        fpA.vy += fy;
      }
    }

    if (cellB) {
      // Translational force (opposite)
      cellB.vx -= fx;
      cellB.vy -= fy;

      const rx = posB.x - cellB.x;
      const ry = posB.y - cellB.y;
      const torque = (rx * -fy - ry * -fx) * torqueStrength * 0.01;
      cellB.vAngle += Math.max(-0.15, Math.min(0.15, torque));
    } else {
      const fpB = net.freePorts.get(pB.id.split("_")[0]!);
      if (fpB && fpB.id !== activeDragId) {
        fpB.vx -= fx;
        fpB.vy -= fy;
      }
    }
  });

  // 3. Central gravity to keep the net centered
  cells.forEach((c) => {
    if (c.id === activeDragId) return;
    c.vx -= c.x * 0.0015;
    c.vy -= c.y * 0.0015;
  });

  freePorts.forEach((fp) => {
    if (fp.id === activeDragId) return;
    fp.vx -= fp.x * 0.0015;
    fp.vy -= fp.y * 0.0015;
  });

  // 4. Euler integration step
  cells.forEach((c) => {
    if (c.id === activeDragId) {
      c.vx = 0;
      c.vy = 0;
      c.vAngle = 0;
      return;
    }

    // Update translation
    c.x += c.vx;
    c.y += c.vy;
    c.vx *= 0.88; // Damping
    c.vy *= 0.88;

    // Update rotation
    c.angle += c.vAngle;
    c.vAngle *= 0.78; // Higher angular damping

    // Animate spawn scaling
    if (c.isSpawning) {
      c.scale += (1.0 - c.scale) * 0.15;
      c.opacity += (1.0 - c.opacity) * 0.15;
      if (c.scale > 0.98) {
        c.scale = 1.0;
        c.opacity = 1.0;
        c.isSpawning = false;
      }
    }
  });

  freePorts.forEach((fp) => {
    if (fp.id === activeDragId) {
      fp.vx = 0;
      fp.vy = 0;
      return;
    }
    fp.x += fp.vx;
    fp.y += fp.vy;
    fp.vx *= 0.88;
    fp.vy *= 0.88;
  });
}

// ==========================================
// 7. CANVAS RENDERING ENGINE
// ==========================================

function _drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
) {
  const headLength = 10;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWireCurve(
  ctx: CanvasRenderingContext2D,
  posA: { x: number; y: number },
  dirA: { x: number; y: number } | null,
  posB: { x: number; y: number },
  dirB: { x: number; y: number } | null,
  isActive: boolean,
  colorOverride?: string
) {
  ctx.save();

  // Choose wire styling
  if (isActive) {
    ctx.strokeStyle = "#a78bfa"; // Glowing purple
    ctx.lineWidth = 4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(139, 92, 246, 0.6)";
  } else {
    ctx.strokeStyle = colorOverride || "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
  }

  // Calculate Bezier control points based on port directions
  const dist = Math.sqrt((posB.x - posA.x) ** 2 + (posB.y - posA.y) ** 2);
  const factor = Math.min(100, dist * 0.4);

  const cpA = dirA
    ? { x: posA.x + dirA.x * factor, y: posA.y + dirA.y * factor }
    : { x: posA.x, y: posA.y };

  const cpB = dirB
    ? { x: posB.x + dirB.x * factor, y: posB.y + dirB.y * factor }
    : { x: posB.x, y: posB.y };

  ctx.beginPath();
  ctx.moveTo(posA.x, posA.y);

  if (dirA || dirB) {
    ctx.bezierCurveTo(cpA.x, cpA.y, cpB.x, cpB.y, posB.x, posB.y);
  } else {
    ctx.lineTo(posB.x, posB.y);
  }

  ctx.stroke();

  // Draw a flow animation bubble along active wires
  if (isActive) {
    const t = (Date.now() % 1200) / 1200;
    // Cubic Bezier interpolation
    const t1 = 1 - t;
    const ax =
      t1 ** 3 * posA.x +
      3 * t1 ** 2 * t * cpA.x +
      3 * t1 * t ** 2 * cpB.x +
      t ** 3 * posB.x;
    const ay =
      t1 ** 3 * posA.y +
      3 * t1 ** 2 * t * cpA.y +
      3 * t1 * t ** 2 * cpB.y +
      t ** 3 * posB.y;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderNet(
  net: InteractionNet,
  targetCanvas: HTMLCanvasElement,
  targetCtx: CanvasRenderingContext2D,
  isVisualEditor = false
) {
  targetCtx.save();

  // Clear screen
  targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);

  // Apply zoom and pan if it's the main editor
  if (!isVisualEditor) {
    targetCtx.translate(
      targetCanvas.width / 2 + panOffset.x,
      targetCanvas.height / 2 + panOffset.y
    );
    targetCtx.scale(zoomScale, zoomScale);
  } else {
    // Visual Editor center adjustment
    targetCtx.translate(targetCanvas.width / 2, targetCanvas.height / 2);
  }

  // 1. Draw Wires
  const activeWires = net.getActiveWires();
  const activeWireIds = new Set(activeWires.map((aw) => aw.wireId));

  net.wires.forEach((wire) => {
    const pA = net.ports.get(wire.portA);
    const pB = net.ports.get(wire.portB);
    if (!pA || !pB) return;

    let posA = { x: 0, y: 0 };
    let dirA: { x: number; y: number } | null = null;
    if (pA.cellId) {
      const cell = net.cells.get(pA.cellId);
      if (cell) {
        posA = getPortWorldPosition(cell, pA.index, net.system);
        dirA = getPortWorldDirection(cell, pA.index, net.system);
      }
    } else {
      const fp = net.freePorts.get(pA.id.split("_")[0]!);
      if (fp) posA = { x: fp.x, y: fp.y };
    }

    let posB = { x: 0, y: 0 };
    let dirB: { x: number; y: number } | null = null;
    if (pB.cellId) {
      const cell = net.cells.get(pB.cellId);
      if (cell) {
        posB = getPortWorldPosition(cell, pB.index, net.system);
        dirB = getPortWorldDirection(cell, pB.index, net.system);
      }
    } else {
      const fp = net.freePorts.get(pB.id.split("_")[0]!);
      if (fp) posB = { x: fp.x, y: fp.y };
    }

    const isActive = activeWireIds.has(wire.id);
    const isSelected =
      selectedElement?.type === "wire" && selectedElement.id === wire.id;
    const wireColor = isSelected ? "rgba(99, 102, 241, 0.9)" : undefined;

    drawWireCurve(targetCtx, posA, dirA, posB, dirB, isActive, wireColor);
  });

  // 2. Draw Wire Drag Preview (Lasso)
  if (wireStartPortId) {
    const pStart = net.ports.get(wireStartPortId);
    let startPos = { x: 0, y: 0 };
    let startDir: { x: number; y: number } | null = null;
    if (pStart) {
      if (pStart.cellId) {
        const cell = net.cells.get(pStart.cellId);
        if (cell) {
          startPos = getPortWorldPosition(cell, pStart.index, net.system);
          startDir = getPortWorldDirection(cell, pStart.index, net.system);
        }
      } else {
        const fp = net.freePorts.get(pStart.id.split("_")[0]!);
        if (fp) startPos = { x: fp.x, y: fp.y };
      }

      targetCtx.save();
      targetCtx.strokeStyle = "rgba(99, 102, 241, 0.7)";
      targetCtx.lineWidth = 2;
      targetCtx.setLineDash([5, 5]);

      // Bezier curve to mouse position
      const dx = tempMousePos.x - startPos.x;
      const dy = tempMousePos.y - startPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = Math.min(100, dist * 0.4);

      const cpX = startPos.x + (startDir ? startDir.x : 0) * factor;
      const cpY = startPos.y + (startDir ? startDir.y : 0) * factor;

      targetCtx.beginPath();
      targetCtx.moveTo(startPos.x, startPos.y);
      targetCtx.quadraticCurveTo(cpX, cpY, tempMousePos.x, tempMousePos.y);
      targetCtx.stroke();

      targetCtx.restore();
    }
  }

  // 3. Draw Loops
  net.loops.forEach((loop) => {
    const p = net.ports.get(loop.portId);
    if (!p) return;

    let pos = { x: 0, y: 0 };
    let dir: { x: number; y: number } | null = null;
    if (p.cellId) {
      const cell = net.cells.get(p.cellId);
      if (cell) {
        pos = getPortWorldPosition(cell, p.index, net.system);
        dir = getPortWorldDirection(cell, p.index, net.system);
      }
    } else {
      const fp = net.freePorts.get(p.id.split("_")[0]!);
      if (fp) pos = { x: fp.x, y: fp.y };
    }

    targetCtx.save();
    targetCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    targetCtx.lineWidth = 2;

    const loopRadius = 14;
    // Draw loop extending outward in the port normal direction
    const centerOffset = 14;
    const lDir = dir || { x: 0, y: -1 };
    const cx = pos.x + lDir.x * centerOffset;
    const cy = pos.y + lDir.y * centerOffset;

    targetCtx.beginPath();
    targetCtx.arc(cx, cy, loopRadius, 0, Math.PI * 2);
    targetCtx.stroke();
    targetCtx.restore();
  });

  // 4. Draw Free Ports
  net.freePorts.forEach((fp) => {
    const isSelected =
      selectedElement?.type === "freePort" && selectedElement.id === fp.id;

    targetCtx.save();
    targetCtx.fillStyle = isSelected ? "#818cf8" : "#ffffff";

    // Draw glowing orbit ring
    targetCtx.strokeStyle = isSelected
      ? "rgba(99, 102, 241, 0.4)"
      : "rgba(255, 255, 255, 0.15)";
    targetCtx.lineWidth = 1.5;
    targetCtx.beginPath();
    targetCtx.arc(fp.x, fp.y, 8, 0, Math.PI * 2);
    targetCtx.stroke();

    targetCtx.beginPath();
    targetCtx.arc(fp.x, fp.y, 4, 0, Math.PI * 2);
    targetCtx.fill();

    // Port ID label for debugging/visual builder
    targetCtx.font =
      "9px " + net.system.symbols[Object.keys(net.system.symbols)[0]!]?.name
        ? "var(--font-sans)"
        : "sans-serif";
    targetCtx.fillStyle = "rgba(255,255,255,0.4)";
    targetCtx.fillText(`f_${fp.id.substring(0, 3)}`, fp.x + 8, fp.y + 3);

    targetCtx.restore();
  });

  // 5. Draw Cells
  net.cells.forEach((cell) => {
    const color = getSymbolColor(cell.symbol, net.system);
    const arity = getSymbolArity(cell.symbol, net.system);
    const isSelected =
      selectedElement?.type === "cell" && selectedElement.id === cell.id;

    targetCtx.save();
    targetCtx.translate(cell.x, cell.y);
    targetCtx.rotate(cell.angle);
    targetCtx.scale(cell.scale, cell.scale);

    // Glassmorphic fill gradient
    const gradient = targetCtx.createLinearGradient(0, -25, 0, 18);
    gradient.addColorStop(0, `${color}44`); // semi-transparent glow
    gradient.addColorStop(1, "#1e293b99"); // slate backfill

    targetCtx.fillStyle = gradient;

    // Glow border if active or selected
    targetCtx.strokeStyle = isSelected
      ? "#818cf8"
      : "rgba(255, 255, 255, 0.25)";
    targetCtx.lineWidth = isSelected ? 3 : 1.5;
    if (isSelected) {
      targetCtx.shadowBlur = 12;
      targetCtx.shadowColor = "#6366f1";
    } else {
      targetCtx.shadowBlur = 4;
      targetCtx.shadowColor = `${color}66`;
    }

    // Draw Rounded Triangle cell shape
    targetCtx.beginPath();
    const cornerRadius = 6;

    // Apex
    const p0 = { x: 0, y: -25 };
    // Bottom right
    const p1 = { x: 22, y: 15 };
    // Bottom left
    const p2 = { x: -22, y: 15 };

    // Standard triangle with arc rounded corners
    targetCtx.moveTo(0, -25);
    targetCtx.arcTo(p1.x, p1.y, p2.x, p2.y, cornerRadius);
    targetCtx.arcTo(p2.x, p2.y, p0.x, p0.y, cornerRadius);
    targetCtx.arcTo(p0.x, p0.y, p1.x, p1.y, cornerRadius);
    targetCtx.closePath();

    targetCtx.fill();
    targetCtx.stroke();

    // Draw Rotation Handle (Only in Edit mode and if selected)
    if (currentMode === "edit" && isSelected && !isVisualEditor) {
      targetCtx.fillStyle = "#818cf8";
      targetCtx.beginPath();
      targetCtx.arc(0, -42, 4, 0, Math.PI * 2);
      targetCtx.fill();

      targetCtx.strokeStyle = "#818cf8";
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      targetCtx.moveTo(0, -25);
      targetCtx.lineTo(0, -42);
      targetCtx.stroke();
    }

    // Draw Symbol Label in center
    targetCtx.font = "bold 10px " + varMono();
    targetCtx.fillStyle = "#ffffff";
    targetCtx.textAlign = "center";
    targetCtx.textBaseline = "middle";
    targetCtx.fillText(cell.symbol, 0, 0);

    // Draw Ports
    const offsets = getPortOffsets(arity);
    offsets.forEach((offset, idx) => {
      const isPrincipal = idx === 0;
      const pId = cell.ports[idx]!;
      const isHovered = hoveredPortId === pId;

      targetCtx.save();

      if (isPrincipal) {
        // Principal: Golden double circle
        targetCtx.fillStyle = "#f59e0b"; // Gold
        targetCtx.beginPath();
        targetCtx.arc(offset.x, offset.y, 4.5, 0, Math.PI * 2);
        targetCtx.fill();

        targetCtx.strokeStyle = isHovered ? "#ffffff" : "#ffffff88";
        targetCtx.lineWidth = 1.2;
        targetCtx.beginPath();
        targetCtx.arc(offset.x, offset.y, 7, 0, Math.PI * 2);
        targetCtx.stroke();
      } else {
        // Auxiliary: Small cyan/blue/white port dot
        targetCtx.fillStyle = isHovered ? "#60a5fa" : "#38bdf8"; // light blue
        targetCtx.beginPath();
        targetCtx.arc(offset.x, offset.y, 3.5, 0, Math.PI * 2);
        targetCtx.fill();

        // Border ring
        targetCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        targetCtx.lineWidth = 1;
        targetCtx.beginPath();
        targetCtx.arc(offset.x, offset.y, 5, 0, Math.PI * 2);
        targetCtx.stroke();

        // Label port index
        targetCtx.font = "8px " + varMono();
        targetCtx.fillStyle = "rgba(255, 255, 255, 0.6)";
        targetCtx.fillText(idx.toString(), offset.x, offset.y + 11);
      }

      targetCtx.restore();
    });

    targetCtx.restore();
  });

  // 6. Draw Spawning Animations / Particle explosions
  activeAnimations.forEach((anim) => {
    // 1. Draw old cells imploding
    const elapsed = Date.now() - anim.startTime;
    const t = Math.min(1.0, elapsed / anim.duration); // 0..1
    const sizeScale = 1.0 - t;

    anim.oldCells.forEach((oc) => {
      targetCtx.save();
      targetCtx.translate(oc.x, oc.y);
      targetCtx.rotate(oc.angle);
      targetCtx.scale(sizeScale, sizeScale);

      targetCtx.fillStyle = `${oc.color}33`;
      targetCtx.strokeStyle = `${oc.color}aa`;
      targetCtx.lineWidth = 1.5;

      targetCtx.beginPath();
      const p0 = { x: 0, y: -25 };
      const p1 = { x: 22, y: 15 };
      const p2 = { x: -22, y: 15 };

      targetCtx.moveTo(0, -25);
      targetCtx.arcTo(p1.x, p1.y, p2.x, p2.y, 6);
      targetCtx.arcTo(p2.x, p2.y, p0.x, p0.y, 6);
      targetCtx.arcTo(p0.x, p0.y, p1.x, p1.y, 6);
      targetCtx.closePath();
      targetCtx.fill();
      targetCtx.stroke();

      targetCtx.restore();
    });

    // 2. Draw explosion particles
    anim.particles.forEach((p) => {
      targetCtx.save();
      targetCtx.globalAlpha = p.alpha;
      targetCtx.fillStyle = p.color;

      targetCtx.shadowBlur = 6;
      targetCtx.shadowColor = p.color;

      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.restore();

      // Update particles
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha = 1.0 - p.life / p.maxLife;
      p.life++;
    });
  });

  // Clean up completed animations
  activeAnimations = activeAnimations.filter((anim) => {
    const elapsed = Date.now() - anim.startTime;
    return elapsed < anim.duration;
  });

  targetCtx.restore();
}

function varMono(): string {
  return "var(--font-mono), monospace";
}

// ==========================================
// 8. INTERACTIVE ENGINE LOOP
// ==========================================

function loop() {
  const forceLayoutChecked =
    (document.getElementById("physics-toggle") as HTMLInputElement)?.checked ??
    true;
  const editPhysicsChecked =
    (document.getElementById("physics-edit-toggle") as HTMLInputElement)
      ?.checked ?? true;

  const enablePhysics =
    (currentMode === "sim" && forceLayoutChecked) ||
    (currentMode === "edit" && editPhysicsChecked);

  if (enablePhysics) {
    updatePhysics(activeNet);
  } else {
    // Just run damping if physics is off to keep drag snaps smooth
    activeNet.cells.forEach((c) => {
      c.vx = 0;
      c.vy = 0;
      c.vAngle = 0;
      if (c.isSpawning) {
        c.scale = 1.0;
        c.opacity = 1.0;
        c.isSpawning = false;
      }
    });
    activeNet.freePorts.forEach((fp) => {
      fp.vx = 0;
      fp.vy = 0;
    });
  }

  // Update particles inside anims even if layout is off
  activeAnimations.forEach((anim) => {
    anim.particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha = 1.0 - p.life / p.maxLife;
      p.life++;
    });
  });

  renderNet(activeNet, canvasEl, ctx);

  // Render sidebar preview rules
  renderActiveRulesPreviews();

  requestAnimationFrame(loop);
}

// ==========================================
// 9. REWRITE STEP-BY-STEP EXECUTOR
// ==========================================

function stepSimulation() {
  const active = activeNet.getActiveWires();
  if (active.length === 0) {
    isPlaying = false;
    updateSimPlayButton();
    updateHUDStatus("normalized");
    return;
  }

  // Pick the first active wire and rewrite it
  const activePair = active[0]!;

  // Flash status
  updateHUDStatus("running");

  const anim = activeNet.rewrite(activePair.wireId);
  if (anim) {
    activeAnimations.push(anim);
    rewritesAppliedCount++;
    updateHUDCounters();

    // If it normalized in this step, double check next frame
    setTimeout(() => {
      const remaining = activeNet.getActiveWires().length;
      if (remaining === 0) {
        updateHUDStatus("normalized");
      }
    }, anim.duration + 50);
  }
}

function startContinuousSim() {
  if (playIntervalId) return;

  const runStep = () => {
    const active = activeNet.getActiveWires();
    if (active.length === 0) {
      isPlaying = false;
      updateSimPlayButton();
      updateHUDStatus("normalized");
      stopContinuousSim();
      return;
    }

    stepSimulation();

    // Dynamic delay based on speed slider
    const speed = 11 - simSpeed; // 1 = 1000ms, 10 = 100ms
    const delay = speed * 130 + 100;

    if (isPlaying) {
      playIntervalId = window.setTimeout(runStep, delay);
    }
  };

  runStep();
}

function stopContinuousSim() {
  if (playIntervalId) {
    clearTimeout(playIntervalId);
    playIntervalId = null;
  }
}

// ==========================================
// 10. REWRITE RULE PREVIEW RENDERER
// ==========================================

// Renders the rule LHS and RHS in miniature canvas in the left sidebar
function renderActiveRulesPreviews() {
  const container = document.getElementById("rules-list");
  if (!container) return;

  // Render list once if size changes, otherwise we can just do lazy updates.
  // To keep it simple, we draw it if container is empty.
  if (container.children.length > 0) return;

  activeSystem.rules.forEach((rule) => {
    const card = document.createElement("div");
    card.className = "rule-card";

    const cardHeader = document.createElement("div");
    cardHeader.className = "rule-card-header";
    cardHeader.innerHTML = `<span>${rule.symbol1} ⨝ ${rule.symbol2}</span><span style="color:var(--accent-color)">→</span>`;
    card.appendChild(cardHeader);

    const cardBody = document.createElement("div");
    cardBody.className = "rule-card-body";

    const ruleCanvas = document.createElement("canvas");
    ruleCanvas.className = "rule-card-canvas";
    ruleCanvas.width = 260;
    ruleCanvas.height = 70;

    cardBody.appendChild(ruleCanvas);
    card.appendChild(cardBody);
    container.appendChild(card);

    // Draw miniature rule diagram
    drawMiniRuleDiagram(ruleCanvas, rule);
  });
}

function drawMiniRuleDiagram(canvas: HTMLCanvasElement, rule: Rule) {
  const mCtx = canvas.getContext("2d");
  if (!mCtx) return;

  mCtx.clearRect(0, 0, canvas.width, canvas.height);
  mCtx.save();

  // Draw LHS (left side) and RHS (right side) separated by arrow
  const midX = canvas.width / 2;
  const midY = canvas.height / 2;

  mCtx.strokeStyle = "rgba(255,255,255,0.1)";
  mCtx.lineWidth = 1;
  mCtx.beginPath();
  mCtx.moveTo(midX, 5);
  mCtx.lineTo(midX, canvas.height - 5);
  mCtx.stroke();

  // LHS: two cells sharing principal
  const drawCellShape = (
    x: number,
    y: number,
    angle: number,
    symbol: string,
    scale = 0.5
  ) => {
    mCtx.save();
    mCtx.translate(x, y);
    mCtx.rotate(angle);
    mCtx.scale(scale, scale);

    const color = getSymbolColor(symbol, activeSystem);
    mCtx.fillStyle = `${color}33`;
    mCtx.strokeStyle = color;
    mCtx.lineWidth = 2;

    mCtx.beginPath();
    mCtx.moveTo(0, -25);
    mCtx.arcTo(22, 15, -22, 15, 6);
    mCtx.arcTo(-22, 15, 0, -25, 6);
    mCtx.arcTo(0, -25, 22, 15, 6);
    mCtx.closePath();
    mCtx.fill();
    mCtx.stroke();

    // Label
    mCtx.font = "bold 13px sans-serif";
    mCtx.fillStyle = "#ffffff";
    mCtx.textAlign = "center";
    mCtx.textBaseline = "middle";
    mCtx.fillText(symbol.substring(0, 3), 0, 0);

    // Principal
    mCtx.fillStyle = "#f59e0b";
    mCtx.beginPath();
    mCtx.arc(0, -22, 4, 0, Math.PI * 2);
    mCtx.fill();

    mCtx.restore();
  };

  // Draw LHS cells
  drawCellShape(midX - 55, midY, Math.PI / 2, rule.symbol1);
  drawCellShape(midX - 22, midY, -Math.PI / 2, rule.symbol2);

  // Draw active wire linking their apexes (principal ports)
  mCtx.strokeStyle = "#a78bfa";
  mCtx.lineWidth = 2;
  mCtx.beginPath();
  mCtx.moveTo(midX - 44, midY);
  mCtx.lineTo(midX - 33, midY);
  mCtx.stroke();

  // RHS: Draw replacement cell list (simplified text or tiny cells)
  const cellCount = rule.rhs.cells.length;
  if (cellCount === 0) {
    // Empty annihilation
    mCtx.font = "11px var(--font-mono)";
    mCtx.fillStyle = "var(--text-muted)";
    mCtx.textAlign = "center";
    mCtx.textBaseline = "middle";
    mCtx.fillText("Empty / Wires", midX + 60, midY);
  } else {
    // Draw cells side by side
    rule.rhs.cells.forEach((rc, idx) => {
      const cx =
        midX +
        35 +
        (idx * 50) / Math.max(1, cellCount - 1) +
        (cellCount === 1 ? 25 : 0);
      drawCellShape(cx, midY, -Math.PI / 2, rc.symbol, 0.4);
    });
  }

  mCtx.restore();
}

// ==========================================
// 11. COORDINATE TRANSLATION HELPERS
// ==========================================

// Screen coordinate to world coordinate
function screenToWorld(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const screenX = clientX - rect.left;
  const screenY = clientY - rect.top;

  // Inverse transform:
  // screenX = width/2 + panOffset.x + worldX * zoomScale
  // worldX = (screenX - width/2 - panOffset.x) / zoomScale
  return {
    x: (screenX - canvas.width / 2 - panOffset.x) / zoomScale,
    y: (screenY - canvas.height / 2 - panOffset.y) / zoomScale,
  };
}

function findClickedElement(
  worldPos: { x: number; y: number },
  net: InteractionNet
): {
  type: "cell" | "freePort" | "port" | "wire" | "rotationHandle";
  id: string;
} | null {
  const clickTolerance = 14;

  // 1. Check cell ports first (high precedence)
  for (const cell of net.cells.values()) {
    const arity = getSymbolArity(cell.symbol, net.system);

    for (let i = 0; i <= arity; i++) {
      const portPos = getPortWorldPosition(cell, i, net.system);
      const dx = portPos.x - worldPos.x;
      const dy = portPos.y - worldPos.y;
      if (dx * dx + dy * dy < clickTolerance * clickTolerance) {
        return { type: "port", id: cell.ports[i]! };
      }
    }
  }

  // 2. Check Rotation Handles (Edit mode only)
  if (currentMode === "edit" && selectedElement?.type === "cell") {
    const activeCell = net.cells.get(selectedElement.id);
    if (activeCell) {
      // Rotation handle is 42px above the cell in local space
      const cos = Math.cos(activeCell.angle);
      const sin = Math.sin(activeCell.angle);
      const hWorld = {
        x: activeCell.x - 42 * sin,
        y: activeCell.y + 42 * cos,
      };

      const dx = hWorld.x - worldPos.x;
      const dy = hWorld.y - worldPos.y;
      if (dx * dx + dy * dy < (clickTolerance + 4) * (clickTolerance + 4)) {
        return { type: "rotationHandle", id: activeCell.id };
      }
    }
  }

  // 3. Check Cell bodies
  for (const cell of net.cells.values()) {
    const dx = cell.x - worldPos.x;
    const dy = cell.y - worldPos.y;
    // Click within cell radius (approx 25px)
    if (dx * dx + dy * dy < 28 * 28) {
      return { type: "cell", id: cell.id };
    }
  }

  // 4. Check Free Ports
  for (const fp of net.freePorts.values()) {
    const dx = fp.x - worldPos.x;
    const dy = fp.y - worldPos.y;
    if (dx * dx + dy * dy < 15 * 15) {
      return { type: "freePort", id: fp.id };
    }
  }

  // 5. Check Wires (intersection with line segments)
  for (const [wId, wire] of net.wires.entries()) {
    const pA = net.ports.get(wire.portA);
    const pB = net.ports.get(wire.portB);
    if (!pA || !pB) continue;

    let posA = { x: 0, y: 0 };
    if (pA.cellId) {
      const c = net.cells.get(pA.cellId);
      if (c) posA = getPortWorldPosition(c, pA.index, net.system);
    } else {
      const fp = net.freePorts.get(pA.id.split("_")[0]!);
      if (fp) posA = { x: fp.x, y: fp.y };
    }

    let posB = { x: 0, y: 0 };
    if (pB.cellId) {
      const c = net.cells.get(pB.cellId);
      if (c) posB = getPortWorldPosition(c, pB.index, net.system);
    } else {
      const fp = net.freePorts.get(pB.id.split("_")[0]!);
      if (fp) posB = { x: fp.x, y: fp.y };
    }

    // Distance from point to line segment
    const l2 = (posB.x - posA.x) ** 2 + (posB.y - posA.y) ** 2;
    if (l2 === 0) continue;

    // projection factor
    let t =
      ((worldPos.x - posA.x) * (posB.x - posA.x) +
        (worldPos.y - posA.y) * (posB.y - posA.y)) /
      l2;
    t = Math.max(0, Math.min(1, t));

    const projX = posA.x + t * (posB.x - posA.x);
    const projY = posA.y + t * (posB.y - posA.y);

    const dist2 = (worldPos.x - projX) ** 2 + (worldPos.y - projY) ** 2;
    if (dist2 < 8 * 8) {
      return { type: "wire", id: wId };
    }
  }

  return null;
}

// ==========================================
// 12. INTERACTIVE BUILDER EVENT HANDLERS
// ==========================================

function handleMouseDown(e: MouseEvent) {
  const worldPos = screenToWorld(e.clientX, e.clientY, canvasEl);
  const click = findClickedElement(worldPos, activeNet);

  if (currentMode === "edit") {
    if (click) {
      if (click.type === "cell") {
        activeDragId = click.id;
        activeDragType = "cell";
        selectElement("cell", click.id);
      } else if (click.type === "freePort") {
        activeDragId = click.id;
        activeDragType = "freePort";
        selectElement("freePort", click.id);
      } else if (click.type === "rotationHandle") {
        activeDragId = click.id;
        activeDragType = "cell"; // rotate mode is driven by mousemove
        // Custom flag for rotation
        isRotatingCell = true;
      } else if (click.type === "port") {
        // Start dragging wire
        wireStartPortId = click.id;
        tempMousePos = worldPos;
      } else if (click.type === "wire") {
        selectElement("wire", click.id);
      }
    } else {
      // Start panning canvas
      activeDragId = "canvas";
      activeDragType = "canvas";
      lastMouseCanvasPos = { x: e.clientX, y: e.clientY };
      selectElement(null);
    }
  } else {
    // Simulate Mode: click-dragging to pull things around is fun!
    if (click && (click.type === "cell" || click.type === "freePort")) {
      activeDragId = click.id;
      activeDragType = click.type;
    } else {
      activeDragId = "canvas";
      activeDragType = "canvas";
      lastMouseCanvasPos = { x: e.clientX, y: e.clientY };
    }
  }
}

function handleMouseMove(e: MouseEvent) {
  const worldPos = screenToWorld(e.clientX, e.clientY, canvasEl);
  tempMousePos = worldPos;

  // 1. Manage Hover States
  const click = findClickedElement(worldPos, activeNet);
  hoveredPortId = click && click.type === "port" ? click.id : null;
  hoveredCellId = click && click.type === "cell" ? click.id : null;

  // Adjust cursor style
  if (click) {
    if (click.type === "port") canvasEl.style.cursor = "crosshair";
    else if (click.type === "rotationHandle") canvasEl.style.cursor = "alias";
    else canvasEl.style.cursor = "move";
  } else {
    canvasEl.style.cursor = activeDragType === "canvas" ? "grabbing" : "grab";
  }

  // 2. Dragging Elements
  if (activeDragId && activeDragType) {
    if (activeDragType === "cell") {
      const cell = activeNet.cells.get(activeDragId);
      if (cell) {
        if (isRotatingCell) {
          // Compute rotation angle based on mouse position relative to cell center
          const dx = worldPos.x - cell.x;
          const dy = worldPos.y - cell.y;
          // Local offset rotation handle is pointing up, i.e. local angle is -Math.PI / 2
          cell.angle = Math.atan2(dy, dx) + Math.PI / 2;

          // Sync inspector UI slider
          const slider = document.getElementById(
            "inspect-cell-rotation"
          ) as HTMLInputElement;
          if (slider) {
            slider.value = Math.round((cell.angle * 180) / Math.PI).toString();
          }
        } else {
          cell.x = worldPos.x;
          cell.y = worldPos.y;
          cell.vx = 0;
          cell.vy = 0;
        }
      }
    } else if (activeDragType === "freePort") {
      const fp = activeNet.freePorts.get(activeDragId);
      if (fp) {
        fp.x = worldPos.x;
        fp.y = worldPos.y;
        fp.vx = 0;
        fp.vy = 0;
      }
    } else if (activeDragType === "canvas") {
      const dx = e.clientX - lastMouseCanvasPos.x;
      const dy = e.clientY - lastMouseCanvasPos.y;
      panOffset.x += dx;
      panOffset.y += dy;
      lastMouseCanvasPos = { x: e.clientX, y: e.clientY };
    }
  }
}

function handleMouseUp(e: MouseEvent) {
  // If dragging wire, check if we release over another port
  if (wireStartPortId) {
    const worldPos = screenToWorld(e.clientX, e.clientY, canvasEl);
    const click = findClickedElement(worldPos, activeNet);
    if (click && click.type === "port" && click.id !== wireStartPortId) {
      activeNet.addWire(wireStartPortId, click.id);
      updateHUDCounters();
    }
  }

  // Reset drags
  activeDragId = null;
  activeDragType = null;
  wireStartPortId = null;
  isRotatingCell = false;
}

function handleMouseWheel(e: WheelEvent) {
  e.preventDefault();

  // Scroll rotation of cell if hovering
  if (currentMode === "edit" && hoveredCellId) {
    const cell = activeNet.cells.get(hoveredCellId);
    if (cell) {
      cell.angle += e.deltaY > 0 ? 0.15 : -0.15;
      return;
    }
  }

  // Zoom canvas
  const zoomFactor = 1.08;
  if (e.deltaY < 0) {
    zoomScale = Math.min(3.0, zoomScale * zoomFactor);
  } else {
    zoomScale = Math.max(0.3, zoomScale / zoomFactor);
  }
}

function handleDoubleClick(e: MouseEvent) {
  if (currentMode !== "edit") return;

  const worldPos = screenToWorld(e.clientX, e.clientY, canvasEl);
  const click = findClickedElement(worldPos, activeNet);

  if (!click) {
    // Add cell or free port
    const selectedAddSymbol = getSelectedAddSymbolName();
    if (selectedAddSymbol) {
      const c = activeNet.addCell(selectedAddSymbol, worldPos.x, worldPos.y);
      selectElement("cell", c.id);
    } else {
      const fp = activeNet.addFreePort(worldPos.x, worldPos.y);
      selectElement("freePort", fp.id);
    }
    updateHUDCounters();
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedElement) {
      if (selectedElement.type === "cell") {
        activeNet.removeCell(selectedElement.id);
      } else if (selectedElement.type === "freePort") {
        activeNet.removeFreePort(selectedElement.id);
      } else if (selectedElement.type === "wire") {
        activeNet.removeWire(selectedElement.id);
      }
      selectElement(null);
      updateHUDCounters();
    }
  }

  // Spacebar controls play/pause in simulation mode
  if (e.key === " " && currentMode === "sim") {
    e.preventDefault();
    toggleSimPlayback();
  }

  // Right arrow triggers single step
  if (e.key === "ArrowRight" && currentMode === "sim") {
    stepSimulation();
  }
}

// ==========================================
// 13. UI DISPLAY SYNC & SELECTION INSPECTOR
// ==========================================

function selectElement(
  type: "cell" | "wire" | "freePort" | "port" | "rotationHandle" | null,
  id?: string
) {
  if (!type || !id) {
    selectedElement = null;
    document.getElementById("inspector-default")?.classList.remove("hidden");
    document.getElementById("inspector-cell")?.classList.add("hidden");
    document.getElementById("inspector-wire")?.classList.add("hidden");
    return;
  }

  selectedElement = { type, id };

  // Hide all inspect panels
  document.getElementById("inspector-default")?.classList.add("hidden");
  document.getElementById("inspector-cell")?.classList.add("hidden");
  document.getElementById("inspector-wire")?.classList.add("hidden");

  if (type === "cell") {
    const cell = activeNet.cells.get(id);
    if (!cell) return;

    document.getElementById("inspector-cell")?.classList.remove("hidden");

    // Set cell details in panel
    const idEl = document.getElementById("inspect-cell-id");
    if (idEl) idEl.textContent = cell.id;

    const arityEl = document.getElementById("inspect-cell-arity");
    if (arityEl)
      arityEl.textContent = getSymbolArity(
        cell.symbol,
        activeSystem
      ).toString();

    // Populate symbol options
    const select = document.getElementById(
      "inspect-cell-symbol"
    ) as HTMLSelectElement;
    if (select) {
      select.innerHTML = "";
      Object.keys(activeSystem.symbols).forEach((symName) => {
        const opt = document.createElement("option");
        opt.value = symName;
        opt.textContent = symName;
        opt.selected = symName === cell.symbol;
        select.appendChild(opt);
      });

      // Update cell symbol on change
      select.onchange = () => {
        const newSym = select.value;
        // If arity changes we need to re-create cell ports to be safe
        const oldArity = getSymbolArity(cell.symbol, activeSystem);
        const newArity = getSymbolArity(newSym, activeSystem);

        cell.symbol = newSym;
        if (oldArity !== newArity) {
          // Re-create
          activeNet.removeCell(cell.id);
          const freshCell = activeNet.addCell(
            newSym,
            cell.x,
            cell.y,
            cell.angle
          );
          selectElement("cell", freshCell.id);
        }
      };
    }

    // Rotation range slider
    const rotSlider = document.getElementById(
      "inspect-cell-rotation"
    ) as HTMLInputElement;
    if (rotSlider) {
      rotSlider.value = Math.round((cell.angle * 180) / Math.PI).toString();
      rotSlider.oninput = () => {
        cell.angle = (parseFloat(rotSlider.value) * Math.PI) / 180;
      };
    }
  } else if (type === "wire") {
    const wire = activeNet.wires.get(id);
    if (!wire) return;

    document.getElementById("inspector-wire")?.classList.remove("hidden");

    const idEl = document.getElementById("inspect-wire-id");
    if (idEl) idEl.textContent = wire.id;

    const pAEl = document.getElementById("inspect-wire-porta");
    if (pAEl) pAEl.textContent = wire.portA;

    const pBEl = document.getElementById("inspect-wire-portb");
    if (pBEl) pBEl.textContent = wire.portB;
  }
}

function getSelectedAddSymbolName(): string | null {
  const activeBtn = document.querySelector(
    "#add-cell-grid .btn-add-symbol.active"
  );
  return activeBtn ? activeBtn.getAttribute("data-symbol") : null;
}

function updateHUDCounters() {
  const activeCount = activeNet.getActiveWires().length;

  const activeCountEl = document.getElementById("hud-active-pairs");
  if (activeCountEl) activeCountEl.textContent = activeCount.toString();

  const rewritesEl = document.getElementById("hud-rewrites-count");
  if (rewritesEl) rewritesEl.textContent = rewritesAppliedCount.toString();
}

function updateHUDStatus(status: "idle" | "running" | "paused" | "normalized") {
  const badge = document.getElementById("hud-status");
  if (!badge) return;

  badge.className = `status-badge ${status}`;
  badge.textContent = status;
}

function toggleSimPlayback() {
  isPlaying = !isPlaying;
  updateSimPlayButton();

  if (isPlaying) {
    updateHUDStatus("running");
    startContinuousSim();
  } else {
    updateHUDStatus("paused");
    stopContinuousSim();
  }
}

function updateSimPlayButton() {
  const playBtn = document.getElementById("btn-play");
  if (playBtn) {
    playBtn.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
  }
}

function switchSystem(systemKey: string) {
  activeSystemKey = systemKey;
  activeSystem = SYSTEMS[systemKey]!;
  activeNet = new InteractionNet(activeSystem);

  // Empty rewrite count
  rewritesAppliedCount = 0;

  // Clear rules lists UI
  const rulesList = document.getElementById("rules-list");
  if (rulesList) rulesList.innerHTML = "";

  // Reset controls
  isPlaying = false;
  updateSimPlayButton();
  stopContinuousSim();

  // Populate presets list
  populatePresetsSelector();

  // Sync Custom System config sidebar panel
  const customSection = document.getElementById("custom-system-section");
  if (systemKey === "custom") {
    customSection?.classList.remove("hidden");
  } else {
    customSection?.classList.add("hidden");
  }

  // Populate quick-add symbols grid in inspector
  populateSymbolsInspectorGrid();

  // Load first preset
  const firstPreset = PRESETS[systemKey]?.[0];
  if (firstPreset) {
    initialPresetNet = firstPreset;
    activeNet.loadPreset(firstPreset);
  } else {
    initialPresetNet = null;
    activeNet.clear();
  }

  updateHUDCounters();
  updateHUDStatus("idle");
  selectElement(null);
}

function populatePresetsSelector() {
  const select = document.getElementById("preset-select") as HTMLSelectElement;
  if (!select) return;

  select.innerHTML = "";
  const list = PRESETS[activeSystemKey] || [];

  list.forEach((preset, idx) => {
    const opt = document.createElement("option");
    opt.value = idx.toString();
    opt.textContent = preset.name;
    select.appendChild(opt);
  });

  select.onchange = () => {
    const idx = parseInt(select.value);
    const preset = PRESETS[activeSystemKey]?.[idx];
    if (preset) {
      initialPresetNet = preset;
      activeNet.loadPreset(preset);
      rewritesAppliedCount = 0;
      updateHUDCounters();
      updateHUDStatus("idle");
      selectElement(null);
    }
  };
}

function populateSymbolsInspectorGrid() {
  const grid = document.getElementById("add-cell-grid");
  if (!grid) return;

  grid.innerHTML = "";

  // Add an option for "Free Port" as first option or button
  const keys = Object.keys(activeSystem.symbols);
  keys.forEach((symKey) => {
    const sym = activeSystem.symbols[symKey]!;

    const btn = document.createElement("button");
    btn.className = "btn-add-symbol";
    btn.setAttribute("data-symbol", sym.name);

    const color = sym.color;
    btn.innerHTML = `
      <div class="symbol-preview">
        <span class="color-dot" style="background-color:${color}; color:${color}"></span>
      </div>
      <span>${sym.name}</span>
      <span class="symbol-meta">Arity: ${sym.arity}</span>
    `;

    btn.onclick = () => {
      document
        .querySelectorAll("#add-cell-grid .btn-add-symbol")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    };

    grid.appendChild(btn);
  });

  // Make the first symbol active by default
  const firstBtn = grid.querySelector(".btn-add-symbol");
  if (firstBtn) firstBtn.classList.add("active");
}

// ==========================================
// 14. CUSTOM SYSTEM MANAGEMENT UI
// ==========================================

function syncCustomSymbolsPanel() {
  const list = document.getElementById("custom-symbols-list");
  if (!list) return;

  list.innerHTML = "";

  const symKeys = Object.keys(activeSystem.symbols);
  symKeys.forEach((key) => {
    const sym = activeSystem.symbols[key]!;

    const item = document.createElement("div");
    item.className = "custom-symbol-item";
    item.innerHTML = `
      <div class="symbol-info">
        <span class="color-dot" style="background-color:${sym.color}; color:${sym.color}"></span>
        <strong>${sym.name}</strong>
        <span style="color:var(--text-muted)">(${sym.arity})</span>
      </div>
      <button class="btn-remove-item">&times;</button>
    `;

    const deleteBtn = item.querySelector(".btn-remove-item");
    deleteBtn?.addEventListener("click", () => {
      // Remove symbol and all rules referencing it
      delete activeSystem.symbols[key];
      activeSystem.rules = activeSystem.rules.filter(
        (r) => r.symbol1 !== key && r.symbol2 !== key
      );

      // Update ui
      syncCustomSymbolsPanel();
      syncCustomRulesPanel();
      populateSymbolsInspectorGrid();

      // Clear rules list previews
      const rulesList = document.getElementById("rules-list");
      if (rulesList) rulesList.innerHTML = "";
    });

    list.appendChild(item);
  });
}

function syncCustomRulesPanel() {
  const list = document.getElementById("custom-rules-list");
  if (!list) return;

  list.innerHTML = "";

  activeSystem.rules.forEach((rule, rIdx) => {
    const item = document.createElement("div");
    item.className = "custom-rule-item";
    item.innerHTML = `
      <span>${rule.symbol1} ⨝ ${rule.symbol2}</span>
      <button class="btn-remove-item">&times;</button>
    `;

    const deleteBtn = item.querySelector(".btn-remove-item");
    deleteBtn?.addEventListener("click", () => {
      activeSystem.rules.splice(rIdx, 1);
      syncCustomRulesPanel();

      // Reset previews
      const rulesList = document.getElementById("rules-list");
      if (rulesList) rulesList.innerHTML = "";
    });

    list.appendChild(item);
  });
}

function handleAddCustomSymbol() {
  const name = prompt("Enter symbol name:")?.trim();
  if (!name) return;

  // Validate symbol name format
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    alert(
      "Invalid symbol name. Must start with a letter and contain letters/numbers only."
    );
    return;
  }

  if (activeSystem.symbols[name]) {
    alert("Symbol already exists.");
    return;
  }

  const arityStr = prompt("Enter arity (0, 1, 2, etc.):", "2");
  const arity = parseInt(arityStr || "2");
  if (isNaN(arity) || arity < 0) {
    alert("Arity must be a non-negative integer.");
    return;
  }

  // Pre-calculated vibrant HSL colors
  const hue = Math.floor(Math.random() * 360);
  const color = `hsl(${hue}, 85%, 60%)`;

  activeSystem.symbols[name] = { name, arity, color };

  syncCustomSymbolsPanel();
  populateSymbolsInspectorGrid();
}

// ==========================================
// 15. CUSTOM RULE MODAL DESIGNER CANVAS
// ==========================================

function openRuleEditorModal() {
  const sym1Select = document.getElementById(
    "rule-sym1-select"
  ) as HTMLSelectElement;
  const sym2Select = document.getElementById(
    "rule-sym2-select"
  ) as HTMLSelectElement;
  if (!sym1Select || !sym2Select) return;

  sym1Select.innerHTML = "";
  sym2Select.innerHTML = "";

  const symNames = Object.keys(activeSystem.symbols);
  if (symNames.length === 0) {
    alert("Define some symbols first!");
    return;
  }

  symNames.forEach((name) => {
    const opt1 = document.createElement("option");
    opt1.value = name;
    opt1.textContent = name;
    sym1Select.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = name;
    opt2.textContent = name;
    sym2Select.appendChild(opt2);
  });

  // Modal net workspace setup
  modalNet = new InteractionNet(activeSystem);

  // Re-generate visual mapping list of LHS ports
  setupRuleEditorMapping();

  // Show modal
  const modal = document.getElementById("rule-modal");
  modal?.classList.remove("hidden");
}

function closeRuleEditorModal() {
  const modal = document.getElementById("rule-modal");
  modal?.classList.add("hidden");
  modalNet = null;
}

function setupRuleEditorMapping() {
  const sym1Select = document.getElementById(
    "rule-sym1-select"
  ) as HTMLSelectElement;
  const sym2Select = document.getElementById(
    "rule-sym2-select"
  ) as HTMLSelectElement;
  if (!sym1Select || !sym2Select || !modalNet) return;

  const sym1 = sym1Select.value;
  const sym2 = sym2Select.value;

  const arity1 = getSymbolArity(sym1, activeSystem);
  const arity2 = getSymbolArity(sym2, activeSystem);
  const totalFree = arity1 + arity2;

  // Clear modal net
  modalNet.clear();

  // Draw LHS free ports as fixed nodes in modal net
  // We place Sym1's aux ports vertically on the left, and Sym2's aux ports vertically on the right
  const modalCanvas = document.getElementById(
    "rule-editor-canvas"
  ) as HTMLCanvasElement;
  const w = modalCanvas.width;
  const h = modalCanvas.height;

  // Left inputs
  const leftPortMap = document.getElementById("modal-ports-list");
  if (leftPortMap) leftPortMap.innerHTML = "";

  for (let i = 0; i < arity1; i++) {
    const cy =
      -h / 3 +
      (((h * 2) / 3) * i) / Math.max(1, arity1 - 1) +
      (arity1 === 1 ? h / 3 : 0);
    const fp = modalNet.addFreePort(-w / 2 + 40, cy);

    // Override port mapping representation
    const pId = `free_${i}`;
    modalNet.ports.delete(fp.portId);
    fp.portId = pId;
    modalNet.ports.set(pId, { id: pId, cellId: null, index: 0 });

    const item = document.createElement("li");
    item.innerHTML = `<span>Port ${i}</span><span>LHS ${sym1} Aux ${i + 1}</span>`;
    leftPortMap?.appendChild(item);
  }

  // Right inputs
  for (let j = 0; j < arity2; j++) {
    const index = arity1 + j;
    const cy =
      -h / 3 +
      (((h * 2) / 3) * j) / Math.max(1, arity2 - 1) +
      (arity2 === 1 ? h / 3 : 0);
    const fp = modalNet.addFreePort(w / 2 - 40, cy);

    const pId = `free_${index}`;
    modalNet.ports.delete(fp.portId);
    fp.portId = pId;
    modalNet.ports.set(pId, { id: pId, cellId: null, index: 0 });

    const item = document.createElement("li");
    item.innerHTML = `<span>Port ${index}</span><span>LHS ${sym2} Aux ${j + 1}</span>`;
    leftPortMap?.appendChild(item);
  }

  const freePortsCountEl = document.getElementById("modal-free-ports-count");
  if (freePortsCountEl) freePortsCountEl.textContent = totalFree.toString();

  // Populate sidebar selection buttons
  populateModalSymbolSidebar();

  // Render rule editor canvas
  renderModalEditor();
}

function populateModalSymbolSidebar() {
  const grid = document.getElementById("modal-symbol-grid");
  if (!grid) return;

  grid.innerHTML = "";

  Object.keys(activeSystem.symbols).forEach((name) => {
    const sym = activeSystem.symbols[name]!;
    const btn = document.createElement("button");
    btn.className = "btn-add-symbol";
    btn.setAttribute("data-symbol", name);
    btn.innerHTML = `
      <span class="color-dot" style="background-color:${sym.color}; color:${sym.color}"></span>
      <span>${sym.name}</span>
    `;

    btn.onclick = () => {
      document
        .querySelectorAll("#modal-symbol-grid .btn-add-symbol")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    };

    grid.appendChild(btn);
  });

  const first = grid.querySelector(".btn-add-symbol");
  if (first) first.classList.add("active");
}

function handleSaveRule() {
  const sym1Select = document.getElementById(
    "rule-sym1-select"
  ) as HTMLSelectElement;
  const sym2Select = document.getElementById(
    "rule-sym2-select"
  ) as HTMLSelectElement;
  if (!sym1Select || !sym2Select || !modalNet) return;

  const sym1 = sym1Select.value;
  const sym2 = sym2Select.value;

  const arity1 = getSymbolArity(sym1, activeSystem);
  const arity2 = getSymbolArity(sym2, activeSystem);
  const totalFree = arity1 + arity2;

  // Validate RHS: convert modal net to Rule RHS format
  const rhsCells: Array<{ symbol: string; ports: number[] }> = [];
  const rhsWires: Array<[number, number]> = [];
  const rhsLoops: number[] = [];

  // Local rule designer port indexing map:
  // Port indices:
  // 0..totalFree-1 represent free ports mapping (free_0..free_totalFree-1)
  // Indices >= totalFree represent internal cell ports in RHS
  const hostPortToRhsIndex = new Map<string, number>();

  // 1. Map LHS free ports first
  for (let i = 0; i < totalFree; i++) {
    const pId = `free_${i}`;
    hostPortToRhsIndex.set(pId, i);
  }

  // 2. Allocate indices for internal cell ports
  let internalIndexCounter = totalFree;
  modalNet.cells.forEach((cell) => {
    cell.ports.forEach((pId) => {
      hostPortToRhsIndex.set(pId, internalIndexCounter++);
    });
  });

  // 3. Populate RHS cells
  modalNet.cells.forEach((cell) => {
    const ports = cell.ports.map((pId) => hostPortToRhsIndex.get(pId)!);
    rhsCells.push({ symbol: cell.symbol, ports });
  });

  // 4. Populate RHS wires
  modalNet.wires.forEach((wire) => {
    const idxA = hostPortToRhsIndex.get(wire.portA);
    const idxB = hostPortToRhsIndex.get(wire.portB);

    if (idxA !== undefined && idxB !== undefined) {
      rhsWires.push([idxA, idxB]);
    }
  });

  // 5. Populate RHS loops
  modalNet.loops.forEach((loop) => {
    const idx = hostPortToRhsIndex.get(loop.portId);
    if (idx !== undefined) {
      rhsLoops.push(idx);
    }
  });

  // Save rule
  const newRule: Rule = {
    symbol1: sym1,
    symbol2: sym2,
    rhs: {
      cells: rhsCells,
      wires: rhsWires,
      loops: rhsLoops,
    },
  };

  // Add rule, replace if existing
  const existingIdx = activeSystem.rules.findIndex(
    (r) =>
      (r.symbol1 === sym1 && r.symbol2 === sym2) ||
      (r.symbol1 === sym2 && r.symbol2 === sym1)
  );

  if (existingIdx !== -1) {
    activeSystem.rules[existingIdx] = newRule;
  } else {
    activeSystem.rules.push(newRule);
  }

  // Sync left-panel rules preview
  const rulesList = document.getElementById("rules-list");
  if (rulesList) rulesList.innerHTML = ""; // force redraw

  syncCustomRulesPanel();
  closeRuleEditorModal();
}

// Visual modal loop renderer
function renderModalEditor() {
  const canvas = document.getElementById(
    "rule-editor-canvas"
  ) as HTMLCanvasElement;
  if (!canvas || !modalNet) return;

  const mCtx = canvas.getContext("2d");
  if (!mCtx) return;

  // Sync layout sizing
  const rect = canvas.parentNode
    ? (canvas.parentNode as HTMLElement).getBoundingClientRect()
    : { width: 500, height: 350 };
  canvas.width = rect.width;
  canvas.height = rect.height;

  renderNet(modalNet, canvas, mCtx, true);

  if (document.getElementById("rule-modal")?.classList.contains("hidden")) {
    return;
  }

  requestAnimationFrame(renderModalEditor);
}

// Modal Canvas Event Listeners (Visual designer interaction)
function initModalListeners() {
  const canvas = document.getElementById(
    "rule-editor-canvas"
  ) as HTMLCanvasElement;
  if (!canvas) return;

  const getModalSelectedSymbol = (): string | null => {
    const active = document.querySelector(
      "#modal-symbol-grid .btn-add-symbol.active"
    );
    return active ? active.getAttribute("data-symbol") : null;
  };

  canvas.addEventListener("mousedown", (e) => {
    if (!modalNet) return;

    // Screen to world (visual editor uses centering transform only)
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - canvas.width / 2;
    const clickY = e.clientY - rect.top - canvas.height / 2;
    const worldPos = { x: clickX, y: clickY };

    const click = findClickedElement(worldPos, modalNet);
    if (click) {
      if (click.type === "cell") {
        modalSelectedElement = click;
        modalDragId = click.id;
        modalDragType = "cell";
      } else if (click.type === "freePort") {
        // Can't drag LHS fixed ports in modal
      } else if (click.type === "port") {
        modalWireStartPortId = click.id;
        tempMousePos = worldPos;
      }
    } else {
      modalSelectedElement = null;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!modalNet) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - canvas.width / 2;
    const clickY = e.clientY - rect.top - canvas.height / 2;
    const worldPos = { x: clickX, y: clickY };

    tempMousePos = worldPos;

    const dragId = modalDragId;
    const dragType = modalDragType;

    if (dragId && dragType === "cell") {
      const cell = modalNet.cells.get(dragId);
      if (cell) {
        cell.x = worldPos.x;
        cell.y = worldPos.y;
      }
    }
  });

  canvas.addEventListener("mouseup", (e) => {
    if (!modalNet) return;

    if (modalWireStartPortId) {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left - canvas.width / 2;
      const clickY = e.clientY - rect.top - canvas.height / 2;
      const worldPos = { x: clickX, y: clickY };

      const click = findClickedElement(worldPos, modalNet);
      if (click && click.type === "port" && click.id !== modalWireStartPortId) {
        modalNet.addWire(modalWireStartPortId, click.id);
      }
    }

    modalDragId = null;
    modalDragType = null;
    modalWireStartPortId = null;
  });

  canvas.addEventListener("dblclick", (e) => {
    if (!modalNet) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left - canvas.width / 2;
    const clickY = e.clientY - rect.top - canvas.height / 2;
    const worldPos = { x: clickX, y: clickY };

    const click = findClickedElement(worldPos, modalNet);
    if (!click) {
      const sym = getModalSelectedSymbol();
      if (sym) {
        const c = modalNet.addCell(sym, worldPos.x, worldPos.y);
        modalSelectedElement = { type: "cell", id: c.id };
      }
    }
  });

  // Modal key bindings (delete key)
  window.addEventListener("keydown", (e) => {
    if (document.getElementById("rule-modal")?.classList.contains("hidden"))
      return;

    if (e.key === "Delete" || e.key === "Backspace") {
      if (modalSelectedElement && modalNet) {
        if (modalSelectedElement.type === "cell") {
          modalNet.removeCell(modalSelectedElement.id);
        } else if (modalSelectedElement.type === "wire") {
          modalNet.removeWire(modalSelectedElement.id);
        }
        modalSelectedElement = null;
      }
    }
  });

  // Clear modal net RHS additions
  document.getElementById("btn-modal-clear")?.addEventListener("click", () => {
    setupRuleEditorMapping();
  });
}

// ==========================================
// 16. PAGE INITIALIZATION
// ==========================================

function init() {
  canvasEl = document.getElementById("canvas") as HTMLCanvasElement;
  ctx = canvasEl.getContext("2d")!;

  // Resize handler
  const resize = () => {
    const parent = canvasEl.parentElement!;
    canvasEl.width = parent.clientWidth;
    canvasEl.height = parent.clientHeight;
  };
  window.addEventListener("resize", resize);
  resize();

  // Mode Selection: Edit vs Simulate
  const btnEdit = document.getElementById("btn-mode-edit")!;
  const btnSim = document.getElementById("btn-mode-sim")!;
  const editControls = document.getElementById("edit-controls")!;
  const simControls = document.getElementById("sim-controls")!;

  btnEdit.addEventListener("click", () => {
    btnEdit.classList.add("active");
    btnSim.classList.remove("active");
    editControls.classList.remove("hidden");
    simControls.classList.add("hidden");
    currentMode = "edit";

    // Stop continuous simulation
    isPlaying = false;
    updateSimPlayButton();
    stopContinuousSim();
    updateHUDStatus("idle");
    selectElement(null);
  });

  btnSim.addEventListener("click", () => {
    btnSim.classList.add("active");
    btnEdit.classList.remove("active");
    simControls.classList.remove("hidden");
    editControls.classList.add("hidden");
    currentMode = "sim";

    // Stop current drags
    activeDragId = null;
    activeDragType = null;
    selectElement(null);
    updateHUDCounters();

    // Check initial active wires
    const active = activeNet.getActiveWires();
    updateHUDStatus(active.length > 0 ? "idle" : "normalized");
  });

  // Global Controls Setup
  const systemSelect = document.getElementById(
    "system-select"
  ) as HTMLSelectElement;
  systemSelect.addEventListener("change", () => {
    switchSystem(systemSelect.value);
  });

  // Sim Toolbar buttons
  document.getElementById("btn-step")?.addEventListener("click", () => {
    stepSimulation();
  });

  document.getElementById("btn-play")?.addEventListener("click", () => {
    toggleSimPlayback();
  });

  document.getElementById("btn-reset")?.addEventListener("click", () => {
    if (initialPresetNet) {
      activeNet.loadPreset(initialPresetNet);
      rewritesAppliedCount = 0;
      updateHUDCounters();
      updateHUDStatus("idle");
      selectElement(null);
      isPlaying = false;
      updateSimPlayButton();
      stopContinuousSim();
    }
  });

  const speedSlider = document.getElementById(
    "speed-slider"
  ) as HTMLInputElement;
  speedSlider.addEventListener("input", () => {
    simSpeed = parseInt(speedSlider.value);
  });

  // Edit Toolbar buttons
  document.getElementById("btn-add-free")?.addEventListener("click", () => {
    const fp = activeNet.addFreePort(0, 0); // Spawns in center
    selectElement("freePort", fp.id);
    updateHUDCounters();
  });

  const clearNetAction = () => {
    activeNet.clear();
    rewritesAppliedCount = 0;
    updateHUDCounters();
    updateHUDStatus("idle");
    selectElement(null);
    isPlaying = false;
    updateSimPlayButton();
    stopContinuousSim();
  };

  document
    .getElementById("btn-clear")
    ?.addEventListener("click", clearNetAction);
  document
    .getElementById("btn-clear-edit")
    ?.addEventListener("click", clearNetAction);

  // Inspector Action Buttons
  document.getElementById("btn-delete-cell")?.addEventListener("click", () => {
    if (selectedElement?.type === "cell") {
      activeNet.removeCell(selectedElement.id);
      selectElement(null);
      updateHUDCounters();
    }
  });

  document.getElementById("btn-delete-wire")?.addEventListener("click", () => {
    if (selectedElement?.type === "wire") {
      activeNet.removeWire(selectedElement.id);
      selectElement(null);
      updateHUDCounters();
    }
  });

  // Custom System Event Listeners
  document
    .getElementById("btn-add-custom-symbol")
    ?.addEventListener("click", handleAddCustomSymbol);
  document
    .getElementById("btn-create-custom-rule")
    ?.addEventListener("click", openRuleEditorModal);

  // Rule designer modal controls
  document
    .getElementById("btn-close-modal")
    ?.addEventListener("click", closeRuleEditorModal);
  document
    .getElementById("btn-cancel-rule")
    ?.addEventListener("click", closeRuleEditorModal);
  document
    .getElementById("btn-save-rule")
    ?.addEventListener("click", handleSaveRule);

  const sym1Sel = document.getElementById(
    "rule-sym1-select"
  ) as HTMLSelectElement;
  const sym2Sel = document.getElementById(
    "rule-sym2-select"
  ) as HTMLSelectElement;
  sym1Sel?.addEventListener("change", setupRuleEditorMapping);
  sym2Sel?.addEventListener("change", setupRuleEditorMapping);

  // Canvas Mouse Listeners
  canvasEl.addEventListener("mousedown", handleMouseDown);
  canvasEl.addEventListener("mousemove", handleMouseMove);
  canvasEl.addEventListener("mouseup", handleMouseUp);
  canvasEl.addEventListener("wheel", handleMouseWheel, { passive: false });
  canvasEl.addEventListener("dblclick", handleDoubleClick);

  // Keypress listener for delete key
  window.addEventListener("keydown", handleKeyDown);

  // Initialize visual editor listeners
  initModalListeners();

  // Load default system
  switchSystem("combinators");

  // Run physics/rendering loop
  requestAnimationFrame(loop);
}

// Start app
window.addEventListener("DOMContentLoaded", init);
