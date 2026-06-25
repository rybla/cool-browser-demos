// Interaction Nets Playground
// Premium, interactive visual tool for building and simulating interaction nets.

// ==========================================
// 1. Core Interfaces & Types
// ==========================================

export interface GraphNode {
  id: string;
  type: "cell" | "free";
  symbol: string; // e.g. 'gamma', 'delta', 'epsilon', or 'Free'
  x: number;
  y: number;
  vx: number;
  vy: number;
  isDragging?: boolean;
  angle?: number; // Orientation angle (radians) for cells
  animating?: boolean;
}

export interface Wire {
  id: string;
  fromNodeId: string;
  fromPortIndex: number;
  toNodeId: string;
  toPortIndex: number;
  isRedex?: boolean; // Highlight active pairs
}

export interface SymbolConfig {
  name: string;
  labelChar: string;
  arity: number;
  color: string;
  description: string;
}

export interface SystemConfig {
  name: string;
  symbols: { [symbolName: string]: SymbolConfig };
  description: string;
  presets: {
    name: string;
    setup: () => { nodes: GraphNode[]; wires: Wire[] };
  }[];
}

export interface RewriteAnimation {
  id: string;
  startTime: number;
  duration: number;
  nodeA: {
    x: number;
    y: number;
    symbol: string;
    color: string;
    arity: number;
    angle: number;
  };
  nodeB: {
    x: number;
    y: number;
    symbol: string;
    color: string;
    arity: number;
    angle: number;
  };
  midX: number;
  midY: number;
  phase: "merge" | "spark" | "expand" | "done";
}

// ==========================================
// 2. Predefined Systems & Presets
// ==========================================

export const SYSTEMS: { [systemKey: string]: SystemConfig } = {
  combinators: {
    name: "Interaction Combinators",
    description:
      "Yves Lafont's universal model of distributed computation. It consists of two duplicators (γ, δ) and an eraser (ε). Dual constructors annihilate, different constructors commute (duplicate and cross-connect).",
    symbols: {
      gamma: {
        name: "γ (Gamma)",
        labelChar: "γ",
        arity: 2,
        color: "#10b981",
        description: "Primary constructor / Duplicator node.",
      },
      delta: {
        name: "δ (Delta)",
        labelChar: "δ",
        arity: 2,
        color: "#f59e0b",
        description: "Secondary constructor / Duplicator node.",
      },
      epsilon: {
        name: "ε (Eraser)",
        labelChar: "ε",
        arity: 0,
        color: "#ef4444",
        description: "Eraser node that garbage-collects other cells.",
      },
    },
    presets: [
      {
        name: "Annihilation Demo (γ × γ)",
        setup: () => {
          return {
            nodes: [
              {
                id: "g1",
                type: "cell",
                symbol: "gamma",
                x: 250,
                y: 150,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "g2",
                type: "cell",
                symbol: "gamma",
                x: 250,
                y: 350,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              {
                id: "f1",
                type: "free",
                symbol: "Free",
                x: 150,
                y: 80,
                vx: 0,
                vy: 0,
              },
              {
                id: "f2",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 80,
                vx: 0,
                vy: 0,
              },
              {
                id: "f3",
                type: "free",
                symbol: "Free",
                x: 150,
                y: 420,
                vx: 0,
                vy: 0,
              },
              {
                id: "f4",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 420,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_p",
                fromNodeId: "g1",
                fromPortIndex: 0,
                toNodeId: "g2",
                toPortIndex: 0,
              },
              {
                id: "w_a1",
                fromNodeId: "g1",
                fromPortIndex: 1,
                toNodeId: "f1",
                toPortIndex: 0,
              },
              {
                id: "w_a2",
                fromNodeId: "g1",
                fromPortIndex: 2,
                toNodeId: "f2",
                toPortIndex: 0,
              },
              {
                id: "w_a3",
                fromNodeId: "g2",
                fromPortIndex: 1,
                toNodeId: "f3",
                toPortIndex: 0,
              },
              {
                id: "w_a4",
                fromNodeId: "g2",
                fromPortIndex: 2,
                toNodeId: "f4",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
      {
        name: "Commutation Demo (γ × δ)",
        setup: () => {
          return {
            nodes: [
              {
                id: "g1",
                type: "cell",
                symbol: "gamma",
                x: 250,
                y: 160,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "d1",
                type: "cell",
                symbol: "delta",
                x: 250,
                y: 340,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              {
                id: "f1",
                type: "free",
                symbol: "Free",
                x: 150,
                y: 80,
                vx: 0,
                vy: 0,
              },
              {
                id: "f2",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 80,
                vx: 0,
                vy: 0,
              },
              {
                id: "f3",
                type: "free",
                symbol: "Free",
                x: 150,
                y: 420,
                vx: 0,
                vy: 0,
              },
              {
                id: "f4",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 420,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_p",
                fromNodeId: "g1",
                fromPortIndex: 0,
                toNodeId: "d1",
                toPortIndex: 0,
              },
              {
                id: "w_a1",
                fromNodeId: "g1",
                fromPortIndex: 1,
                toNodeId: "f1",
                toPortIndex: 0,
              },
              {
                id: "w_a2",
                fromNodeId: "g1",
                fromPortIndex: 2,
                toNodeId: "f2",
                toPortIndex: 0,
              },
              {
                id: "w_a3",
                fromNodeId: "d1",
                fromPortIndex: 1,
                toNodeId: "f3",
                toPortIndex: 0,
              },
              {
                id: "w_a4",
                fromNodeId: "d1",
                fromPortIndex: 2,
                toNodeId: "f4",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
      {
        name: "Eraser Commutation (γ × ε)",
        setup: () => {
          return {
            nodes: [
              {
                id: "g1",
                type: "cell",
                symbol: "gamma",
                x: 250,
                y: 160,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "e1",
                type: "cell",
                symbol: "epsilon",
                x: 250,
                y: 340,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              {
                id: "f1",
                type: "free",
                symbol: "Free",
                x: 150,
                y: 80,
                vx: 0,
                vy: 0,
              },
              {
                id: "f2",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 80,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_p",
                fromNodeId: "g1",
                fromPortIndex: 0,
                toNodeId: "e1",
                toPortIndex: 0,
              },
              {
                id: "w_a1",
                fromNodeId: "g1",
                fromPortIndex: 1,
                toNodeId: "f1",
                toPortIndex: 0,
              },
              {
                id: "w_a2",
                fromNodeId: "g1",
                fromPortIndex: 2,
                toNodeId: "f2",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
      {
        name: "Self-Replication Loop",
        setup: () => {
          // Creates a loop structure of γ and δ pointing principal-to-principal. This replicas outwards infinitely!
          return {
            nodes: [
              {
                id: "g1",
                type: "cell",
                symbol: "gamma",
                x: 200,
                y: 250,
                vx: 0,
                vy: 0,
                angle: 0,
              },
              {
                id: "d1",
                type: "cell",
                symbol: "delta",
                x: 300,
                y: 250,
                vx: 0,
                vy: 0,
                angle: Math.PI,
              },
              {
                id: "f1",
                type: "free",
                symbol: "Free",
                x: 120,
                y: 120,
                vx: 0,
                vy: 0,
              },
              {
                id: "f2",
                type: "free",
                symbol: "Free",
                x: 120,
                y: 380,
                vx: 0,
                vy: 0,
              },
              {
                id: "f3",
                type: "free",
                symbol: "Free",
                x: 380,
                y: 120,
                vx: 0,
                vy: 0,
              },
              {
                id: "f4",
                type: "free",
                symbol: "Free",
                x: 380,
                y: 380,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_p",
                fromNodeId: "g1",
                fromPortIndex: 0,
                toNodeId: "d1",
                toPortIndex: 0,
              },
              {
                id: "w_g1",
                fromNodeId: "g1",
                fromPortIndex: 1,
                toNodeId: "f1",
                toPortIndex: 0,
              },
              {
                id: "w_g2",
                fromNodeId: "g1",
                fromPortIndex: 2,
                toNodeId: "f2",
                toPortIndex: 0,
              },
              {
                id: "w_d1",
                fromNodeId: "d1",
                fromPortIndex: 1,
                toNodeId: "f3",
                toPortIndex: 0,
              },
              {
                id: "w_d2",
                fromNodeId: "d1",
                fromPortIndex: 2,
                toNodeId: "f4",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
    ],
  },
  arithmetic: {
    name: "Interaction Arithmetic",
    description:
      "Implements Peano arithmetic on interaction nets. Successor (S, arity 1) and Zero (Z, arity 0) represent numbers. Addition (Add, arity 2) and Multiplication (Mul, arity 2) reduce recursively. Duplicator (D) and Eraser (E) handle garbage collection and sharing.",
    symbols: {
      S: {
        name: "S (Successor)",
        labelChar: "S",
        arity: 1,
        color: "#3b82f6",
        description: "Successor node representing (+1).",
      },
      Z: {
        name: "Z (Zero)",
        labelChar: "0",
        arity: 0,
        color: "#64748b",
        description: "Zero constant node.",
      },
      Add: {
        name: "Add (Addition)",
        labelChar: "+",
        arity: 2,
        color: "#8b5cf6",
        description: "Addition node. Principal port connects to operand 1.",
      },
      Mul: {
        name: "Mul (Multiplication)",
        labelChar: "×",
        arity: 2,
        color: "#ec4899",
        description:
          "Multiplication node. Principal port connects to multiplier.",
      },
      D: {
        name: "D (Duplicator)",
        labelChar: "D",
        arity: 2,
        color: "#10b981",
        description: "Sharing / Duplication node.",
      },
      E: {
        name: "E (Eraser)",
        labelChar: "E",
        arity: 0,
        color: "#ef4444",
        description: "Garbage collection node.",
      },
    },
    presets: [
      {
        name: "Addition: 2 + 1 = 3",
        setup: () => {
          // Represent 2 as S(S(0)), 1 as S(0)
          // Add cell: principal connected to operand 1 (2), aux 1 to operand 2 (1), aux 2 to output.
          return {
            nodes: [
              {
                id: "add",
                type: "cell",
                symbol: "Add",
                x: 250,
                y: 250,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              // Number 2: S1 -> S2 -> Z2
              {
                id: "s1",
                type: "cell",
                symbol: "S",
                x: 250,
                y: 170,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "s2",
                type: "cell",
                symbol: "S",
                x: 250,
                y: 100,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "z2",
                type: "cell",
                symbol: "Z",
                x: 250,
                y: 40,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              // Number 1: S3 -> Z3
              {
                id: "s3",
                type: "cell",
                symbol: "S",
                x: 150,
                y: 340,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "z3",
                type: "cell",
                symbol: "Z",
                x: 150,
                y: 410,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              // Output
              {
                id: "out",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 340,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_add_p",
                fromNodeId: "add",
                fromPortIndex: 0,
                toNodeId: "s1",
                toPortIndex: 0,
              },
              {
                id: "w_s1_s2",
                fromNodeId: "s1",
                fromPortIndex: 1,
                toNodeId: "s2",
                toPortIndex: 0,
              },
              {
                id: "w_s2_z2",
                fromNodeId: "s2",
                fromPortIndex: 1,
                toNodeId: "z2",
                toPortIndex: 0,
              },
              {
                id: "w_add_a1",
                fromNodeId: "add",
                fromPortIndex: 1,
                toNodeId: "s3",
                toPortIndex: 0,
              },
              {
                id: "w_s3_z3",
                fromNodeId: "s3",
                fromPortIndex: 1,
                toNodeId: "z3",
                toPortIndex: 0,
              },
              {
                id: "w_add_a2",
                fromNodeId: "add",
                fromPortIndex: 2,
                toNodeId: "out",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
      {
        name: "Multiplication: 2 × 2 = 4",
        setup: () => {
          return {
            nodes: [
              {
                id: "mul",
                type: "cell",
                symbol: "Mul",
                x: 250,
                y: 250,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              // Multiplier 2: S1 -> S2 -> Z2
              {
                id: "s1",
                type: "cell",
                symbol: "S",
                x: 250,
                y: 170,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "s2",
                type: "cell",
                symbol: "S",
                x: 250,
                y: 100,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "z2",
                type: "cell",
                symbol: "Z",
                x: 250,
                y: 40,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              // Multiplicand 2: S3 -> S4 -> Z4
              {
                id: "s3",
                type: "cell",
                symbol: "S",
                x: 150,
                y: 340,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "s4",
                type: "cell",
                symbol: "S",
                x: 150,
                y: 410,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "z4",
                type: "cell",
                symbol: "Z",
                x: 150,
                y: 480,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              // Output
              {
                id: "out",
                type: "free",
                symbol: "Free",
                x: 350,
                y: 340,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_mul_p",
                fromNodeId: "mul",
                fromPortIndex: 0,
                toNodeId: "s1",
                toPortIndex: 0,
              },
              {
                id: "w_s1_s2",
                fromNodeId: "s1",
                fromPortIndex: 1,
                toNodeId: "s2",
                toPortIndex: 0,
              },
              {
                id: "w_s2_z2",
                fromNodeId: "s2",
                fromPortIndex: 1,
                toNodeId: "z2",
                toPortIndex: 0,
              },
              {
                id: "w_mul_a1",
                fromNodeId: "mul",
                fromPortIndex: 1,
                toNodeId: "s3",
                toPortIndex: 0,
              },
              {
                id: "w_s3_s4",
                fromNodeId: "s3",
                fromPortIndex: 1,
                toNodeId: "s4",
                toPortIndex: 0,
              },
              {
                id: "w_s4_z4",
                fromNodeId: "s4",
                fromPortIndex: 1,
                toNodeId: "z4",
                toPortIndex: 0,
              },
              {
                id: "w_mul_a2",
                fromNodeId: "mul",
                fromPortIndex: 2,
                toNodeId: "out",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
    ],
  },
  logic: {
    name: "Boolean Logic Circuits",
    description:
      "Evaluates boolean logic circuits in parallel. True and False constants (arity 0) interact with logic gates (Not, And, Or). Wires evaluate to final true/false values.",
    symbols: {
      True: {
        name: "True (Boolean Constant)",
        labelChar: "T",
        arity: 0,
        color: "#10b981",
        description: "Constant TRUE value.",
      },
      False: {
        name: "False (Boolean Constant)",
        labelChar: "F",
        arity: 0,
        color: "#ef4444",
        description: "Constant FALSE value.",
      },
      Not: {
        name: "Not (Inversion)",
        labelChar: "~",
        arity: 1,
        color: "#f59e0b",
        description: "Logical inversion gate.",
      },
      And: {
        name: "And (Conjunction)",
        labelChar: "&",
        arity: 2,
        color: "#3b82f6",
        description:
          "Conjunction gate. Port 1 is second input, Port 2 is output.",
      },
      Or: {
        name: "Or (Disjunction)",
        labelChar: "|",
        arity: 2,
        color: "#8b5cf6",
        description:
          "Disjunction gate. Port 1 is second input, Port 2 is output.",
      },
      D: {
        name: "D (Duplicator)",
        labelChar: "D",
        arity: 2,
        color: "#059669",
        description: "Sharing duplicator node.",
      },
      E: {
        name: "E (Eraser)",
        labelChar: "E",
        arity: 0,
        color: "#b91c1c",
        description: "Boolean eraser.",
      },
    },
    presets: [
      {
        name: "Evaluation: Not(False) = True",
        setup: () => {
          return {
            nodes: [
              {
                id: "not_gate",
                type: "cell",
                symbol: "Not",
                x: 250,
                y: 220,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              {
                id: "false_val",
                type: "cell",
                symbol: "False",
                x: 250,
                y: 120,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "out",
                type: "free",
                symbol: "Free",
                x: 250,
                y: 340,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              {
                id: "w_not_p",
                fromNodeId: "not_gate",
                fromPortIndex: 0,
                toNodeId: "false_val",
                toPortIndex: 0,
              },
              {
                id: "w_not_a1",
                fromNodeId: "not_gate",
                fromPortIndex: 1,
                toNodeId: "out",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
      {
        name: "Evaluation: True AND False = False",
        setup: () => {
          return {
            nodes: [
              {
                id: "and_gate",
                type: "cell",
                symbol: "And",
                x: 250,
                y: 220,
                vx: 0,
                vy: 0,
                angle: -Math.PI / 2,
              },
              {
                id: "true_val",
                type: "cell",
                symbol: "True",
                x: 200,
                y: 120,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "false_val",
                type: "cell",
                symbol: "False",
                x: 300,
                y: 120,
                vx: 0,
                vy: 0,
                angle: Math.PI / 2,
              },
              {
                id: "out",
                type: "free",
                symbol: "Free",
                x: 250,
                y: 340,
                vx: 0,
                vy: 0,
              },
            ],
            wires: [
              // And principal port connected to Input 1 (True)
              {
                id: "w_and_p",
                fromNodeId: "and_gate",
                fromPortIndex: 0,
                toNodeId: "true_val",
                toPortIndex: 0,
              },
              // And aux 1 connected to Input 2 (False)
              {
                id: "w_and_a1",
                fromNodeId: "and_gate",
                fromPortIndex: 1,
                toNodeId: "false_val",
                toPortIndex: 0,
              },
              // And aux 2 connected to Output
              {
                id: "w_and_a2",
                fromNodeId: "and_gate",
                fromPortIndex: 2,
                toNodeId: "out",
                toPortIndex: 0,
              },
            ],
          };
        },
      },
    ],
  },
};

// ==========================================
// 3. Helper Functions & Math Layouts
// ==========================================

export function getDistance(
  n1: { x: number; y: number },
  n2: { x: number; y: number }
) {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Returns the exact global coordinate of a port on a node.
 * Cells have oriented triangles, FreePorts are single points.
 */
export function getPortCoordinate(
  node: GraphNode,
  portIndex: number,
  arity: number
): { x: number; y: number } {
  if (node.type === "free") {
    return { x: node.x, y: node.y };
  }

  const theta = node.angle ?? -Math.PI / 2;
  const R_principal = 22;
  const R_back = 12;
  const spacing = 16;

  if (portIndex === 0) {
    // Principal port at the apex
    return {
      x: node.x + R_principal * Math.cos(theta),
      y: node.y + R_principal * Math.sin(theta),
    };
  } else {
    // Auxiliary ports lined up along the base
    const bx = node.x - R_back * Math.cos(theta);
    const by = node.y - R_back * Math.sin(theta);
    const ux = -Math.sin(theta);
    const uy = Math.cos(theta);

    const offset = (portIndex - (arity + 1) / 2) * spacing;
    return {
      x: bx + offset * ux,
      y: by + offset * uy,
    };
  }
}

/**
 * Finds which port (Node ID and port index) a given port is connected to.
 */
export function getConnectedPort(
  nodeId: string,
  portIndex: number,
  wires: Wire[]
): { nodeId: string; portIndex: number } | null {
  for (const wire of wires) {
    if (wire.fromNodeId === nodeId && wire.fromPortIndex === portIndex) {
      return { nodeId: wire.toNodeId, portIndex: wire.toPortIndex };
    }
    if (wire.toNodeId === nodeId && wire.toPortIndex === portIndex) {
      return { nodeId: wire.fromNodeId, portIndex: wire.fromPortIndex };
    }
  }
  return null;
}

// ==========================================
// 4. Pure Logical Rewriting Engine
// ==========================================

export function rewriteActivePair(
  nodeAId: string,
  nodeBId: string,
  nodes: GraphNode[],
  wires: Wire[],
  systemKey: string
): {
  newNodes: GraphNode[];
  newWires: Wire[];
  deletedNodeIds: string[];
  deletedWireIds: string[];
} {
  const nodeA = nodes.find((n) => n.id === nodeAId)!;
  const nodeB = nodes.find((n) => n.id === nodeBId)!;

  const system = SYSTEMS[systemKey]!;
  const symbolA = system.symbols[nodeA.symbol]!;
  const symbolB = system.symbols[nodeB.symbol]!;

  const n = symbolA.arity;
  const m = symbolB.arity;

  const midX = (nodeA.x + nodeB.x) / 2;
  const midY = (nodeA.y + nodeB.y) / 2;

  // Retrieve external targets connected to A's auxiliary ports
  const dest_A: ({ nodeId: string; portIndex: number } | null)[] = [null];
  for (let i = 1; i <= n; i++) {
    dest_A.push(getConnectedPort(nodeA.id, i, wires));
  }

  // Retrieve external targets connected to B's auxiliary ports
  const dest_B: ({ nodeId: string; portIndex: number } | null)[] = [null];
  for (let j = 1; j <= m; j++) {
    dest_B.push(getConnectedPort(nodeB.id, j, wires));
  }

  // Identify nodes/wires being deleted
  const deletedNodeIds = [nodeA.id, nodeB.id];
  const deletedWireIds: string[] = [];

  // Filter wires connected to A or B
  for (const wire of wires) {
    if (
      wire.fromNodeId === nodeA.id ||
      wire.toNodeId === nodeA.id ||
      wire.fromNodeId === nodeB.id ||
      wire.toNodeId === nodeB.id
    ) {
      deletedWireIds.push(wire.id);
    }
  }

  const newNodes: GraphNode[] = [];
  const newWires: Wire[] = [];

  // Random unique ID generator helper
  const uniqueId = () => Math.random().toString(36).substring(2, 9);

  // ----------------------------------------------------
  // SYSTEM-SPECIFIC CUSTOM RULES
  // ----------------------------------------------------
  if (systemKey === "arithmetic") {
    // Rule: Add + Z (Addition by zero: Z + X = X)
    if (
      (nodeA.symbol === "Add" && nodeB.symbol === "Z") ||
      (nodeA.symbol === "Z" && nodeB.symbol === "Add")
    ) {
      const d_add = nodeA.symbol === "Add" ? dest_A : dest_B; // d_add[1] is X, d_add[2] is Output Y

      const targetX = d_add[1];
      const targetY = d_add[2];

      if (targetX && targetY) {
        newWires.push({
          id: `w_fuse_${uniqueId()}`,
          fromNodeId: targetX.nodeId,
          fromPortIndex: targetX.portIndex,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: Add + S (Successor addition: S(U) + X = S(U + X))
    if (
      (nodeA.symbol === "Add" && nodeB.symbol === "S") ||
      (nodeA.symbol === "S" && nodeB.symbol === "Add")
    ) {
      const d_add = nodeA.symbol === "Add" ? dest_A : dest_B; // d_add[1] is X, d_add[2] is Y
      const d_s = nodeA.symbol === "S" ? dest_A : dest_B; // d_s[1] is predecessor U

      const targetX = d_add[1];
      const targetY = d_add[2];
      const targetU = d_s[1];

      const newAddId = `add_${uniqueId()}`;
      const newSId = `s_${uniqueId()}`;

      newNodes.push(
        {
          id: newAddId,
          type: "cell",
          symbol: "Add",
          x: midX - 10,
          y: midY,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 2,
        },
        {
          id: newSId,
          type: "cell",
          symbol: "S",
          x: midX + 10,
          y: midY,
          vx: 0,
          vy: 0,
          angle: Math.PI / 2,
        }
      );

      // Connect new S principal to original output Y
      if (targetY) {
        newWires.push({
          id: `w_s_out_${uniqueId()}`,
          fromNodeId: newSId,
          fromPortIndex: 0,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      // Connect new S aux 1 to new Add output (aux 2)
      newWires.push({
        id: `w_s_add_${uniqueId()}`,
        fromNodeId: newSId,
        fromPortIndex: 1,
        toNodeId: newAddId,
        toPortIndex: 2,
      });
      // Connect new Add principal to original predecessor U
      if (targetU) {
        newWires.push({
          id: `w_add_u_${uniqueId()}`,
          fromNodeId: newAddId,
          fromPortIndex: 0,
          toNodeId: targetU.nodeId,
          toPortIndex: targetU.portIndex,
        });
      }
      // Connect new Add aux 1 to original operand X
      if (targetX) {
        newWires.push({
          id: `w_add_x_${uniqueId()}`,
          fromNodeId: newAddId,
          fromPortIndex: 1,
          toNodeId: targetX.nodeId,
          toPortIndex: targetX.portIndex,
        });
      }

      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: Mul + Z (Multiplication by zero: Z * X = Z (outputs 0, erases X))
    if (
      (nodeA.symbol === "Mul" && nodeB.symbol === "Z") ||
      (nodeA.symbol === "Z" && nodeB.symbol === "Mul")
    ) {
      const d_mul = nodeA.symbol === "Mul" ? dest_A : dest_B; // d_mul[1] is X, d_mul[2] is Y
      const targetX = d_mul[1];
      const targetY = d_mul[2];

      const newEId = `e_${uniqueId()}`;
      const newZId = `z_${uniqueId()}`;

      // Create Eraser connected to X, Zero connected to Y
      if (targetX) {
        newNodes.push({
          id: newEId,
          type: "cell",
          symbol: "E",
          x: midX - 15,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_e_x_${uniqueId()}`,
          fromNodeId: newEId,
          fromPortIndex: 0,
          toNodeId: targetX.nodeId,
          toPortIndex: targetX.portIndex,
        });
      }
      if (targetY) {
        newNodes.push({
          id: newZId,
          type: "cell",
          symbol: "Z",
          x: midX + 15,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_z_y_${uniqueId()}`,
          fromNodeId: newZId,
          fromPortIndex: 0,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }

      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: Mul + S (Multiplication by successor: S(U) * X = (U * X) + X (using duplicator D))
    if (
      (nodeA.symbol === "Mul" && nodeB.symbol === "S") ||
      (nodeA.symbol === "S" && nodeB.symbol === "Mul")
    ) {
      const d_mul = nodeA.symbol === "Mul" ? dest_A : dest_B; // d_mul[1] is X, d_mul[2] is output Y
      const d_s = nodeA.symbol === "S" ? dest_A : dest_B; // d_s[1] is predecessor U

      const targetX = d_mul[1];
      const targetY = d_mul[2];
      const targetU = d_s[1];

      const newDId = `d_${uniqueId()}`;
      const newMulId = `mul_${uniqueId()}`;
      const newAddId = `add_${uniqueId()}`;

      newNodes.push(
        {
          id: newDId,
          type: "cell",
          symbol: "D",
          x: midX - 30,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        },
        {
          id: newMulId,
          type: "cell",
          symbol: "Mul",
          x: midX,
          y: midY - 20,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 2,
        },
        {
          id: newAddId,
          type: "cell",
          symbol: "Add",
          x: midX + 30,
          y: midY,
          vx: 0,
          vy: 0,
          angle: -Math.PI / 2,
        }
      );

      // Connect Duplicator principal to original operand X
      if (targetX) {
        newWires.push({
          id: `w_d_x_${uniqueId()}`,
          fromNodeId: newDId,
          fromPortIndex: 0,
          toNodeId: targetX.nodeId,
          toPortIndex: targetX.portIndex,
        });
      }
      // Connect new Mul principal to predecessor U
      if (targetU) {
        newWires.push({
          id: `w_mul_u_${uniqueId()}`,
          fromNodeId: newMulId,
          fromPortIndex: 0,
          toNodeId: targetU.nodeId,
          toPortIndex: targetU.portIndex,
        });
      }
      // Connect new Mul input (aux 1) to duplicator branch 1 (aux 1)
      newWires.push({
        id: `w_mul_d1_${uniqueId()}`,
        fromNodeId: newMulId,
        fromPortIndex: 1,
        toNodeId: newDId,
        toPortIndex: 1,
      });
      // Connect Add principal to new Mul output (aux 2)
      newWires.push({
        id: `w_add_mul_${uniqueId()}`,
        fromNodeId: newAddId,
        fromPortIndex: 0,
        toNodeId: newMulId,
        toPortIndex: 2,
      });
      // Connect Add aux 1 to duplicator branch 2 (aux 2)
      newWires.push({
        id: `w_add_d2_${uniqueId()}`,
        fromNodeId: newAddId,
        fromPortIndex: 1,
        toNodeId: newDId,
        toPortIndex: 2,
      });
      // Connect Add output (aux 2) to original output Y
      if (targetY) {
        newWires.push({
          id: `w_add_y_${uniqueId()}`,
          fromNodeId: newAddId,
          fromPortIndex: 2,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }

      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }
  } else if (systemKey === "logic") {
    // Rule: Not + True (evaluates to False)
    if (
      (nodeA.symbol === "Not" && nodeB.symbol === "True") ||
      (nodeA.symbol === "True" && nodeB.symbol === "Not")
    ) {
      const d_not = nodeA.symbol === "Not" ? dest_A : dest_B;
      const targetY = d_not[1];
      const newFId = `false_${uniqueId()}`;
      if (targetY) {
        newNodes.push({
          id: newFId,
          type: "cell",
          symbol: "False",
          x: midX,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_f_y_${uniqueId()}`,
          fromNodeId: newFId,
          fromPortIndex: 0,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: Not + False (evaluates to True)
    if (
      (nodeA.symbol === "Not" && nodeB.symbol === "False") ||
      (nodeA.symbol === "False" && nodeB.symbol === "Not")
    ) {
      const d_not = nodeA.symbol === "Not" ? dest_A : dest_B;
      const targetY = d_not[1];
      const newTId = `true_${uniqueId()}`;
      if (targetY) {
        newNodes.push({
          id: newTId,
          type: "cell",
          symbol: "True",
          x: midX,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_t_y_${uniqueId()}`,
          fromNodeId: newTId,
          fromPortIndex: 0,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: And + True (True && X = X)
    if (
      (nodeA.symbol === "And" && nodeB.symbol === "True") ||
      (nodeA.symbol === "True" && nodeB.symbol === "And")
    ) {
      const d_and = nodeA.symbol === "And" ? dest_A : dest_B; // d_and[1] is X, d_and[2] is output Y
      const targetX = d_and[1];
      const targetY = d_and[2];
      if (targetX && targetY) {
        newWires.push({
          id: `w_and_fuse_${uniqueId()}`,
          fromNodeId: targetX.nodeId,
          fromPortIndex: targetX.portIndex,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: And + False (False && X = False)
    if (
      (nodeA.symbol === "And" && nodeB.symbol === "False") ||
      (nodeA.symbol === "False" && nodeB.symbol === "And")
    ) {
      const d_and = nodeA.symbol === "And" ? dest_A : dest_B;
      const targetX = d_and[1];
      const targetY = d_and[2];

      const newEId = `e_${uniqueId()}`;
      const newFId = `f_${uniqueId()}`;

      if (targetX) {
        newNodes.push({
          id: newEId,
          type: "cell",
          symbol: "E",
          x: midX - 15,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_e_x_${uniqueId()}`,
          fromNodeId: newEId,
          fromPortIndex: 0,
          toNodeId: targetX.nodeId,
          toPortIndex: targetX.portIndex,
        });
      }
      if (targetY) {
        newNodes.push({
          id: newFId,
          type: "cell",
          symbol: "False",
          x: midX + 15,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_f_y_${uniqueId()}`,
          fromNodeId: newFId,
          fromPortIndex: 0,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: Or + True (True || X = True)
    if (
      (nodeA.symbol === "Or" && nodeB.symbol === "True") ||
      (nodeA.symbol === "True" && nodeB.symbol === "Or")
    ) {
      const d_or = nodeA.symbol === "Or" ? dest_A : dest_B;
      const targetX = d_or[1];
      const targetY = d_or[2];

      const newEId = `e_${uniqueId()}`;
      const newTId = `t_${uniqueId()}`;

      if (targetX) {
        newNodes.push({
          id: newEId,
          type: "cell",
          symbol: "E",
          x: midX - 15,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_e_x_${uniqueId()}`,
          fromNodeId: newEId,
          fromPortIndex: 0,
          toNodeId: targetX.nodeId,
          toPortIndex: targetX.portIndex,
        });
      }
      if (targetY) {
        newNodes.push({
          id: newTId,
          type: "cell",
          symbol: "True",
          x: midX + 15,
          y: midY,
          vx: 0,
          vy: 0,
          angle: 0,
        });
        newWires.push({
          id: `w_t_y_${uniqueId()}`,
          fromNodeId: newTId,
          fromPortIndex: 0,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }

    // Rule: Or + False (False || X = X)
    if (
      (nodeA.symbol === "Or" && nodeB.symbol === "False") ||
      (nodeA.symbol === "False" && nodeB.symbol === "Or")
    ) {
      const d_or = nodeA.symbol === "Or" ? dest_A : dest_B;
      const targetX = d_or[1];
      const targetY = d_or[2];
      if (targetX && targetY) {
        newWires.push({
          id: `w_or_fuse_${uniqueId()}`,
          fromNodeId: targetX.nodeId,
          fromPortIndex: targetX.portIndex,
          toNodeId: targetY.nodeId,
          toPortIndex: targetY.portIndex,
        });
      }
      return { newNodes, newWires, deletedNodeIds, deletedWireIds };
    }
  }

  // ----------------------------------------------------
  // GENERAL ALGEBRAIC RULES (ANNIHILATION & COMMUTATION)
  // ----------------------------------------------------
  if (nodeA.symbol === nodeB.symbol) {
    // --------------------------------------------------
    // Generic Annihilation Rule
    // --------------------------------------------------
    // We construct an adjacency list of path connections to resolve any complex chain fusions.
    const adj = new Map<string, string[]>();
    const addEdge = (u: string, v: string) => {
      if (!adj.has(u)) adj.set(u, []);
      if (!adj.has(v)) adj.set(v, []);
      adj.get(u)!.push(v);
      adj.get(v)!.push(u);
    };

    const portKey = (nodeId: string, idx: number) => `${nodeId}:${idx}`;

    // Add all current wires, EXCEPT the active principal wire
    for (const wire of wires) {
      const k1 = portKey(wire.fromNodeId, wire.fromPortIndex);
      const k2 = portKey(wire.toNodeId, wire.toPortIndex);
      const isPrincipalA =
        (wire.fromNodeId === nodeA.id && wire.fromPortIndex === 0) ||
        (wire.toNodeId === nodeA.id && wire.toPortIndex === 0);
      const isPrincipalB =
        (wire.fromNodeId === nodeB.id && wire.fromPortIndex === 0) ||
        (wire.toNodeId === nodeB.id && wire.toPortIndex === 0);
      if (isPrincipalA && isPrincipalB) {
        continue;
      }
      addEdge(k1, k2);
    }

    // Add the rule's fusions: connect A.i to B.i for each auxiliary i
    for (let i = 1; i <= n; i++) {
      const kA = portKey(nodeA.id, i);
      const kB = portKey(nodeB.id, i);
      addEdge(kA, kB);
    }

    // Find paths of fusion between external ports
    const visited = new Set<string>();
    const externalConnections: [string, string][] = [];

    const isExternal = (key: string) => {
      const parts = key.split(":");
      const nid = parts[0]!;
      return nid !== nodeA.id && nid !== nodeB.id;
    };

    for (const start of adj.keys()) {
      if (!visited.has(start) && isExternal(start)) {
        // Run DFS/BFS to find the endpoint of the path
        const path: string[] = [];
        const queue: string[] = [start];
        visited.add(start);

        let current: string | undefined;
        while ((current = queue.shift()) !== undefined) {
          path.push(current);
          const neighbors = adj.get(current) || [];
          for (const next of neighbors) {
            if (!visited.has(next)) {
              visited.add(next);
              queue.push(next);
            }
          }
        }

        // The path must start and end at external ports.
        // Every port in our fusion graph has degree <= 2, so components are paths or cycles.
        const end = path[path.length - 1]!;
        if (start !== end && isExternal(end)) {
          externalConnections.push([start, end]);
        }
      }
    }

    // Construct the new fused wires
    for (const [p1, p2] of externalConnections) {
      const parts1 = p1.split(":");
      const parts2 = p2.split(":");
      newWires.push({
        id: `w_fuse_${uniqueId()}`,
        fromNodeId: parts1[0]!,
        fromPortIndex: parseInt(parts1[1]!, 10),
        toNodeId: parts2[0]!,
        toPortIndex: parseInt(parts2[1]!, 10),
      });
    }
  } else {
    // --------------------------------------------------
    // Generic Commutation Rule
    // --------------------------------------------------
    // Create m cells of type S1
    const newCellsA: GraphNode[] = [];
    for (let j = 1; j <= m; j++) {
      const cid = `${nodeA.symbol}_new_${uniqueId()}`;
      newCellsA.push({
        id: cid,
        type: "cell",
        symbol: nodeA.symbol,
        x: midX + 35 * Math.cos(nodeB.angle || 0) + (j - (m + 1) / 2) * 15,
        y: midY + 35 * Math.sin(nodeB.angle || 0) + (j - (m + 1) / 2) * 15,
        vx: 0,
        vy: 0,
        angle: (nodeB.angle || 0) + Math.PI,
      });
    }

    // Create n cells of type S2
    const newCellsB: GraphNode[] = [];
    for (let i = 1; i <= n; i++) {
      const cid = `${nodeB.symbol}_new_${uniqueId()}`;
      newCellsB.push({
        id: cid,
        type: "cell",
        symbol: nodeB.symbol,
        x: midX + 35 * Math.cos(nodeA.angle || 0) + (i - (n + 1) / 2) * 15,
        y: midY + 35 * Math.sin(nodeA.angle || 0) + (i - (n + 1) / 2) * 15,
        vx: 0,
        vy: 0,
        angle: (nodeA.angle || 0) + Math.PI,
      });
    }

    newNodes.push(...newCellsA, ...newCellsB);

    // Connect principal ports of new cells to original external connections
    // A_j.0 connects to dest_B[j]
    for (let j = 1; j <= m; j++) {
      const cellA_j = newCellsA[j - 1]!;
      const target = dest_B[j];
      if (target) {
        // If connected directly to an auxiliary of A (self-loop commutation case)
        if (target.nodeId === nodeA.id) {
          const idx = target.portIndex;
          const cellB_idx = newCellsB[idx - 1]!;
          newWires.push({
            id: `w_comm_self_${uniqueId()}`,
            fromNodeId: cellA_j.id,
            fromPortIndex: 0,
            toNodeId: cellB_idx.id,
            toPortIndex: 0,
          });
        } else {
          newWires.push({
            id: `w_comm_a_${uniqueId()}`,
            fromNodeId: cellA_j.id,
            fromPortIndex: 0,
            toNodeId: target.nodeId,
            toPortIndex: target.portIndex,
          });
        }
      }
    }

    // B_i.0 connects to dest_A[i]
    for (let i = 1; i <= n; i++) {
      const cellB_i = newCellsB[i - 1]!;
      const target = dest_A[i];
      if (target) {
        if (target.nodeId === nodeB.id) {
          // Handled in the loop above
          continue;
        } else {
          newWires.push({
            id: `w_comm_b_${uniqueId()}`,
            fromNodeId: cellB_i.id,
            fromPortIndex: 0,
            toNodeId: target.nodeId,
            toPortIndex: target.portIndex,
          });
        }
      }
    }

    // Cross connect auxiliary ports: A_j.i connects to B_i.j
    for (let i = 1; i <= n; i++) {
      const cellB_i = newCellsB[i - 1]!;
      for (let j = 1; j <= m; j++) {
        const cellA_j = newCellsA[j - 1]!;
        newWires.push({
          id: `w_comm_cross_${uniqueId()}`,
          fromNodeId: cellA_j.id,
          fromPortIndex: i,
          toNodeId: cellB_i.id,
          toPortIndex: j,
        });
      }
    }
  }

  return { newNodes, newWires, deletedNodeIds, deletedWireIds };
}

// ==========================================
// 5. Interactive Playground App Controller
// ==========================================

export class InteractionPlayground {
  private container: HTMLElement;
  private svg: SVGSVGElement;
  private transformGroup: SVGGElement;
  private wiresGroup: SVGGElement;
  private cellsGroup: SVGGElement;
  private portsGroup: SVGGElement;
  private interactionGlowsGroup: SVGGElement;
  private dragWireGroup: SVGGElement;

  // App States
  public nodes: GraphNode[] = [];
  public wires: Wire[] = [];
  public systemKey: string = "combinators";
  public editorMode:
    | "select"
    | "add-cell"
    | "add-wire"
    | "add-free"
    | "delete" = "select";
  public selectedSymbol: string = "gamma"; // Currently selected cell library symbol

  // Drag and View State
  private isPanning: boolean = false;
  private panX: number = 0;
  private panY: number = 0;
  private zoom: number = 1.0;
  private startDragX: number = 0;
  private startDragY: number = 0;

  // Editing interactives
  private activeDragNode: GraphNode | null = null;
  private activeWireSource: { nodeId: string; portIndex: number } | null = null;
  private currentMousePos = { x: 0, y: 0 };

  // Simulation parameters
  public isRunning: boolean = false;
  private lastStepTime: number = 0;
  public simSpeed: number = 2.0; // steps/sec
  public stepCount: number = 0;
  private initialPresetState: { nodes: GraphNode[]; wires: Wire[] } | null =
    null;

  // Animations
  private animations: RewriteAnimation[] = [];
  private runPhysics: boolean = true;

  constructor() {
    this.container = document.querySelector(".app-container") as HTMLElement;
    this.svg = document.getElementById(
      "svg-viewport"
    ) as unknown as SVGSVGElement;
    this.transformGroup = document.getElementById(
      "transform-group"
    ) as unknown as SVGGElement;
    this.wiresGroup = document.getElementById(
      "wires-group"
    ) as unknown as SVGGElement;
    this.cellsGroup = document.getElementById(
      "cells-group"
    ) as unknown as SVGGElement;
    this.portsGroup = document.getElementById(
      "ports-group"
    ) as unknown as SVGGElement;
    this.interactionGlowsGroup = document.getElementById(
      "interaction-glows-group"
    ) as unknown as SVGGElement;
    this.dragWireGroup = document.getElementById(
      "drag-wire-group"
    ) as unknown as SVGGElement;

    this.initEvents();
    this.changeSystem("combinators");
    this.startLoop();
  }

  // Bind all HTML inputs & select elements
  private initEvents() {
    // 1. System Select
    const systemSelect = document.getElementById(
      "system-select"
    ) as HTMLSelectElement;
    systemSelect.addEventListener("change", (e) => {
      this.changeSystem((e.target as HTMLSelectElement).value);
    });

    // 2. Load Preset Button
    const btnLoadPreset = document.getElementById(
      "btn-load-preset"
    ) as HTMLButtonElement;
    btnLoadPreset.addEventListener("click", () => {
      const presetSelect = document.getElementById(
        "preset-select"
      ) as HTMLSelectElement;
      this.loadPreset(presetSelect.value);
    });

    // 3. Toolbar Mode Buttons
    const modes: (
      | "select"
      | "add-cell"
      | "add-wire"
      | "add-free"
      | "delete"
    )[] = ["select", "add-cell", "add-wire", "add-free", "delete"];
    modes.forEach((mode) => {
      const btn = document.getElementById(
        `btn-mode-${mode}`
      ) as HTMLButtonElement;
      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".tool-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.setEditorMode(mode);
      });
    });

    // 4. Play / Pause Button
    const btnPlayPause = document.getElementById(
      "btn-play-pause"
    ) as HTMLButtonElement;
    btnPlayPause.addEventListener("click", () => {
      this.toggleSim();
    });

    // 5. Step Button
    const btnStep = document.getElementById("btn-step") as HTMLButtonElement;
    btnStep.addEventListener("click", () => {
      this.simStep();
    });

    // 6. Reset Button
    const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;
    btnReset.addEventListener("click", () => {
      this.resetNet();
    });

    // 7. Clear Button
    const btnClear = document.getElementById("btn-clear") as HTMLButtonElement;
    btnClear.addEventListener("click", () => {
      this.clearNet();
    });

    // 8. Toggle Physics
    const btnPhysics = document.getElementById(
      "btn-toggle-physics"
    ) as HTMLButtonElement;
    btnPhysics.addEventListener("click", () => {
      this.runPhysics = !this.runPhysics;
      btnPhysics.classList.toggle("active", this.runPhysics);
      this.showToast(
        this.runPhysics
          ? "Physics auto-layout enabled"
          : "Physics auto-layout paused"
      );
    });

    // 9. Center Button
    const btnCenter = document.getElementById(
      "btn-auto-center"
    ) as HTMLButtonElement;
    btnCenter.addEventListener("click", () => {
      this.centerNet();
    });

    // 10. Speed Slider
    const speedSlider = document.getElementById(
      "speed-slider"
    ) as HTMLInputElement;
    const speedVal = document.getElementById("speed-val") as HTMLElement;
    speedSlider.addEventListener("input", (e) => {
      this.simSpeed = parseFloat((e.target as HTMLInputElement).value);
      speedVal.innerText = `${this.simSpeed} steps/s`;
    });

    // 11. SVG Drag Panning & Zooming
    this.svg.addEventListener("mousedown", (e) => this.onSvgMouseDown(e));
    this.svg.addEventListener("mousemove", (e) => this.onSvgMouseMove(e));
    this.svg.addEventListener("mouseup", () => this.onSvgMouseUp());
    this.svg.addEventListener("wheel", (e) => this.onSvgWheel(e));
  }

  // System Changing Handler
  private changeSystem(systemKey: string) {
    this.systemKey = systemKey;
    const system = SYSTEMS[systemKey]!;

    // Update Sidebar Description Text
    const title = document.getElementById("system-info-title") as HTMLElement;
    const desc = document.getElementById("system-info-desc") as HTMLElement;
    title.innerText = system.name;
    desc.innerText = system.description;

    // Load presets in select dropdown
    const presetSelect = document.getElementById(
      "preset-select"
    ) as HTMLSelectElement;
    presetSelect.innerHTML = "";
    system.presets.forEach((preset, index) => {
      const opt = document.createElement("option");
      opt.value = index.toString();
      opt.innerText = preset.name;
      presetSelect.appendChild(opt);
    });

    // Rebuild Cell Library Buttons
    const cellLib = document.getElementById("cell-library") as HTMLElement;
    cellLib.innerHTML = "";
    const symbolKeys = Object.keys(system.symbols);
    this.selectedSymbol = symbolKeys[0] || "gamma";

    symbolKeys.forEach((key) => {
      const sym = system.symbols[key]!;
      const card = document.createElement("div");
      card.className = `lib-card ${key === this.selectedSymbol ? "active" : ""}`;
      card.dataset.symbol = key;

      const pathMarkup =
        sym.arity > 0
          ? `<polygon points="16,3 30,28 2,28" fill="${sym.color}18" stroke="${sym.color}" stroke-width="2" />`
          : `<circle cx="16" cy="16" r="12" fill="${sym.color}18" stroke="${sym.color}" stroke-width="2" />`;

      card.innerHTML = `
        <svg class="lib-svg" viewBox="0 0 32 32">
          ${pathMarkup}
          <text x="16" y="16" class="cell-label-text" style="font-size:10px">${sym.labelChar}</text>
        </svg>
        <span class="lib-name">${sym.labelChar}</span>
        <span class="lib-arity">Arity ${sym.arity}</span>
      `;

      card.addEventListener("click", () => {
        document.querySelectorAll(".lib-card").forEach((c) => bRemoveActive(c));
        card.classList.add("active");
        this.selectedSymbol = key;
        this.setEditorMode("add-cell");
        const btnAddCell = document.getElementById(
          "btn-mode-add-cell"
        ) as HTMLButtonElement;
        document
          .querySelectorAll(".tool-btn")
          .forEach((b) => b.classList.remove("active"));
        btnAddCell.classList.add("active");
      });

      cellLib.appendChild(card);
    });

    function bRemoveActive(c: Element) {
      c.classList.remove("active");
    }

    // Load first preset
    if (system.presets.length > 0) {
      this.loadPreset("0");
    } else {
      this.clearNet();
    }
  }

  // Load selected preset net
  private loadPreset(indexStr: string) {
    const system = SYSTEMS[this.systemKey]!;
    const idx = parseInt(indexStr, 10);
    const preset = system.presets[idx];
    if (preset) {
      const state = preset.setup();
      this.nodes = JSON.parse(JSON.stringify(state.nodes)) as GraphNode[];
      this.wires = JSON.parse(JSON.stringify(state.wires)) as Wire[];
      this.initialPresetState = JSON.parse(JSON.stringify(state)) as {
        nodes: GraphNode[];
        wires: Wire[];
      };
      this.stepCount = 0;
      this.isRunning = false;
      this.updatePlayBtnText();
      this.centerNet();
      this.showToast(`Loaded preset: ${preset.name}`);
    }
  }

  private setEditorMode(
    mode: "select" | "add-cell" | "add-wire" | "add-free" | "delete"
  ) {
    this.editorMode = mode;
    this.activeWireSource = null;
    this.drawDragWire();
  }

  private showToast(msg: string) {
    const toast = document.getElementById("editor-toast") as HTMLElement;
    toast.innerText = msg;
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 2500);
  }

  private clearNet() {
    this.nodes = [];
    this.wires = [];
    this.stepCount = 0;
    this.isRunning = false;
    this.updatePlayBtnText();
    this.animations = [];
    this.showToast("Canvas cleared");
  }

  private resetNet() {
    if (this.initialPresetState) {
      this.nodes = JSON.parse(
        JSON.stringify(this.initialPresetState.nodes)
      ) as GraphNode[];
      this.wires = JSON.parse(
        JSON.stringify(this.initialPresetState.wires)
      ) as Wire[];
      this.stepCount = 0;
      this.isRunning = false;
      this.updatePlayBtnText();
      this.animations = [];
      this.showToast("Net reset to initial state");
    } else {
      this.clearNet();
    }
  }

  private toggleSim() {
    this.isRunning = !this.isRunning;
    this.updatePlayBtnText();
    if (this.isRunning) {
      this.lastStepTime = performance.now();
      this.showToast("Simulation running");
    } else {
      this.showToast("Simulation paused");
    }
  }

  private updatePlayBtnText() {
    const btn = document.getElementById("btn-play-pause") as HTMLButtonElement;
    if (this.isRunning) {
      btn.innerHTML = `<span class="play-icon">❚❚</span> Pause`;
      btn.classList.add("btn-danger");
    } else {
      btn.innerHTML = `<span class="play-icon">▶</span> Play`;
      btn.classList.remove("btn-danger");
    }
  }

  // ==========================================
  // 6. Interactive Drawing Mouse Events
  // ==========================================

  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Map screen mouse positions to SVG transformed coordinates
    return {
      x: (mx - this.panX) / this.zoom,
      y: (my - this.panY) / this.zoom,
    };
  }

  private onSvgMouseDown(e: MouseEvent) {
    const target = e.target as SVGElement;
    const coords = this.getCanvasCoords(e);
    this.currentMousePos = coords;

    // Check if clicked on a node or port
    const nodeIdAttr = target.getAttribute("data-node-id");
    const portIdxAttr = target.getAttribute("data-port-index");

    if (nodeIdAttr) {
      const clickedNode = this.nodes.find((n) => n.id === nodeIdAttr);

      if (this.editorMode === "delete") {
        // Delete Node and its wires
        this.nodes = this.nodes.filter((n) => n.id !== nodeIdAttr);
        this.wires = this.wires.filter(
          (w) => w.fromNodeId !== nodeIdAttr && w.toNodeId !== nodeIdAttr
        );
        return;
      }

      if (this.editorMode === "select" && clickedNode) {
        this.activeDragNode = clickedNode;
        clickedNode.isDragging = true;
        return;
      }
    }

    if (portIdxAttr) {
      const portNodeId = target.getAttribute("data-port-node-id")!;
      const portIdx = parseInt(portIdxAttr, 10);

      if (this.editorMode === "add-wire") {
        // Verify port is not connected
        const conn = getConnectedPort(portNodeId, portIdx, this.wires);
        if (conn) {
          // If port already has wire, delete that wire (allows rewiring)
          this.wires = this.wires.filter(
            (w) =>
              !(
                (w.fromNodeId === portNodeId && w.fromPortIndex === portIdx) ||
                (w.toNodeId === portNodeId && w.toPortIndex === portIdx)
              )
          );
        }
        this.activeWireSource = { nodeId: portNodeId, portIndex: portIdx };
        return;
      }
    }

    // Checking if click on a wire to delete
    const wireIdAttr = target.getAttribute("data-wire-id");
    if (wireIdAttr && this.editorMode === "delete") {
      this.wires = this.wires.filter((w) => w.id !== wireIdAttr);
      return;
    }

    // If click on background empty area
    if (this.editorMode === "add-cell") {
      // Spawn new cell
      const cellId = `cell_${Math.random().toString(36).substring(2, 9)}`;
      this.nodes.push({
        id: cellId,
        type: "cell",
        symbol: this.selectedSymbol,
        x: coords.x,
        y: coords.y,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
      });
      return;
    }

    if (this.editorMode === "add-free") {
      // Spawn free port node
      const freeId = `free_${Math.random().toString(36).substring(2, 9)}`;
      this.nodes.push({
        id: freeId,
        type: "free",
        symbol: "Free",
        x: coords.x,
        y: coords.y,
        vx: 0,
        vy: 0,
      });
      return;
    }

    // Default pan dragging
    if (this.editorMode === "select" && !this.activeDragNode) {
      this.isPanning = true;
      this.startDragX = e.clientX - this.panX;
      this.startDragY = e.clientY - this.panY;
    }
  }

  private onSvgMouseMove(e: MouseEvent) {
    const coords = this.getCanvasCoords(e);
    this.currentMousePos = coords;

    if (this.activeDragNode) {
      this.activeDragNode.x = coords.x;
      this.activeDragNode.y = coords.y;
      this.activeDragNode.vx = 0;
      this.activeDragNode.vy = 0;
    } else if (this.activeWireSource) {
      this.drawDragWire();
    } else if (this.isPanning) {
      this.panX = e.clientX - this.startDragX;
      this.panY = e.clientY - this.startDragY;
      this.updateViewportTransform();
    }
  }

  private onSvgMouseUp() {
    if (this.activeDragNode) {
      this.activeDragNode.isDragging = false;
      this.activeDragNode = null;
    }

    if (this.activeWireSource) {
      // Find the port target under current mouse position
      const targetElement = document.elementFromPoint(
        this.currentMousePos.x * this.zoom +
          this.panX +
          this.svg.getBoundingClientRect().left,
        this.currentMousePos.y * this.zoom +
          this.panY +
          this.svg.getBoundingClientRect().top
      );

      const targetPortIdxAttr = targetElement?.getAttribute("data-port-index");
      const targetPortNodeIdAttr =
        targetElement?.getAttribute("data-port-node-id");

      if (targetPortIdxAttr && targetPortNodeIdAttr) {
        const targetPortIdx = parseInt(targetPortIdxAttr, 10);
        const sourcePort = this.activeWireSource;

        // Prevent wire connecting to self-port
        if (
          sourcePort.nodeId !== targetPortNodeIdAttr ||
          sourcePort.portIndex !== targetPortIdx
        ) {
          // Check that target port is not already connected
          const existingConn = getConnectedPort(
            targetPortNodeIdAttr,
            targetPortIdx,
            this.wires
          );
          if (!existingConn) {
            this.wires.push({
              id: `w_${Math.random().toString(36).substring(2, 9)}`,
              fromNodeId: sourcePort.nodeId,
              fromPortIndex: sourcePort.portIndex,
              toNodeId: targetPortNodeIdAttr,
              toPortIndex: targetPortIdx,
            });
            this.showToast("Wire connected!");
          } else {
            this.showToast("Target port is already connected");
          }
        }
      }

      this.activeWireSource = null;
      this.drawDragWire();
    }

    this.isPanning = false;
  }

  private onSvgWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 1.1;
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Get cursor position in canvas coords before zoom
    const cx = (mx - this.panX) / this.zoom;
    const cy = (my - this.panY) / this.zoom;

    if (e.deltaY < 0) {
      this.zoom *= zoomFactor;
    } else {
      this.zoom /= zoomFactor;
    }

    this.zoom = Math.max(0.15, Math.min(this.zoom, 8.0));

    // Refactor pan to keep cursor focused at same spot
    this.panX = mx - cx * this.zoom;
    this.panY = my - cy * this.zoom;

    this.updateViewportTransform();
  }

  private updateViewportTransform() {
    this.transformGroup.setAttribute(
      "transform",
      `translate(${this.panX}, ${this.panY}) scale(${this.zoom})`
    );
  }

  // Draw temporary dragging wire
  private drawDragWire() {
    this.dragWireGroup.innerHTML = "";
    if (this.activeWireSource) {
      const sourceNode = this.nodes.find(
        (n) => n.id === this.activeWireSource!.nodeId
      )!;
      const system = SYSTEMS[this.systemKey]!;
      const sym = system.symbols[sourceNode.symbol];
      const arity = sym?.arity ?? 0;

      const pCoord = getPortCoordinate(
        sourceNode,
        this.activeWireSource.portIndex,
        arity
      );

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("class", "drag-wire-temp");
      path.setAttribute(
        "d",
        `M ${pCoord.x} ${pCoord.y} L ${this.currentMousePos.x} ${this.currentMousePos.y}`
      );
      this.dragWireGroup.appendChild(path);
    }
  }

  // ==========================================
  // 7. Simulation & Reduction Invoker
  // ==========================================

  public simStep() {
    if (this.animations.length > 0) {
      // Complete current animation quickly before starting a new step
      this.animations = [];
    }

    // Step 1: Detect active wires (wires between principal ports 0 <--> 0 of two cells)
    const activeWire = this.wires.find((w) => {
      if (w.fromPortIndex === 0 && w.toPortIndex === 0) {
        const nodeA = this.nodes.find((n) => n.id === w.fromNodeId);
        const nodeB = this.nodes.find((n) => n.id === w.toNodeId);
        return nodeA?.type === "cell" && nodeB?.type === "cell";
      }
      return false;
    });

    if (!activeWire) {
      this.isRunning = false;
      this.updatePlayBtnText();
      this.showToast("Net is normalized!");
      return;
    }

    const nodeA = this.nodes.find((n) => n.id === activeWire.fromNodeId)!;
    const nodeB = this.nodes.find((n) => n.id === activeWire.toNodeId)!;

    // Step 2: Push a new rewrite animation
    const midX = (nodeA.x + nodeB.x) / 2;
    const midY = (nodeA.y + nodeB.y) / 2;
    const system = SYSTEMS[this.systemKey]!;
    const symA = system.symbols[nodeA.symbol]!;
    const symB = system.symbols[nodeB.symbol]!;

    const animId = `anim_${Math.random().toString(36).substring(2, 9)}`;
    const newAnim: RewriteAnimation = {
      id: animId,
      startTime: performance.now(),
      duration: 600, // 600ms animation
      nodeA: {
        x: nodeA.x,
        y: nodeA.y,
        symbol: nodeA.symbol,
        color: symA.color,
        arity: symA.arity,
        angle: nodeA.angle || 0,
      },
      nodeB: {
        x: nodeB.x,
        y: nodeB.y,
        symbol: nodeB.symbol,
        color: symB.color,
        arity: symB.arity,
        angle: nodeB.angle || 0,
      },
      midX,
      midY,
      phase: "merge",
    };

    this.animations.push(newAnim);

    // Lock nodes during rewriting animation
    nodeA.animating = true;
    nodeB.animating = true;

    // Step 3: Perform logical rewriting and replace graph elements
    const { newNodes, newWires, deletedNodeIds, deletedWireIds } =
      rewriteActivePair(
        nodeA.id,
        nodeB.id,
        this.nodes,
        this.wires,
        this.systemKey
      );

    // Filter out deleted elements
    this.nodes = this.nodes.filter((n) => !deletedNodeIds.includes(n.id));
    this.wires = this.wires.filter((w) => !deletedWireIds.includes(w.id));

    // Spawn new nodes at intermediate positions, slide out as animation progresses
    newNodes.forEach((node) => {
      node.animating = true; // Lock position until animation completes
      this.nodes.push(node);
    });

    // Add new wires
    newWires.forEach((wire) => {
      this.wires.push(wire);
    });

    this.stepCount++;

    // Burst particles at contacts
    this.burstParticles(midX, midY, symA.color, symB.color);
  }

  private burstParticles(x: number, y: number, color1: string, color2: string) {
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      particle.setAttribute("cx", x.toString());
      particle.setAttribute("cy", y.toString());
      particle.setAttribute("r", (Math.random() * 4 + 2).toString());
      particle.setAttribute("fill", i % 2 === 0 ? color1 : color2);
      particle.setAttribute("class", "particle");

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 80 + 40;
      const dx = Math.cos(angle) * velocity;
      const dy = Math.sin(angle) * velocity;

      particle.style.setProperty("--dx", `${dx}px`);
      particle.style.setProperty("--dy", `${dy}px`);

      this.interactionGlowsGroup.appendChild(particle);
      setTimeout(() => particle.remove(), 500);
    }
  }

  // ==========================================
  // 8. 2D Force-Directed Layout Physics Engine
  // ==========================================

  private applyPhysics() {
    if (!this.runPhysics) return;

    const repulsion_k = 6500;
    const spring_k = 0.085;
    const rest_length = 45;
    const gravity = 0.01;

    // Apply repulsion between all node pairs
    for (let i = 0; i < this.nodes.length; i++) {
      const n1 = this.nodes[i]!;
      if (n1.isDragging || n1.animating) continue;

      for (let j = i + 1; j < this.nodes.length; j++) {
        const n2 = this.nodes[j]!;
        const dist = getDistance(n1, n2) || 1.0;
        if (dist < 180) {
          const force = repulsion_k / (dist * dist);
          const dx = (n1.x - n2.x) / dist;
          const dy = (n1.y - n2.y) / dist;

          n1.vx += dx * force;
          n1.vy += dy * force;
          if (!n2.isDragging && !n2.animating) {
            n2.vx -= dx * force;
            n2.vy -= dy * force;
          }
        }
      }
    }

    // Apply spring tensions along wires pulling node centers
    for (const wire of this.wires) {
      const n1 = this.nodes.find((n) => n.id === wire.fromNodeId);
      const n2 = this.nodes.find((n) => n.id === wire.toNodeId);

      if (n1 && n2) {
        const dist = getDistance(n1, n2) || 1.0;
        const force = spring_k * (dist - rest_length);
        const dx = (n2.x - n1.x) / dist;
        const dy = (n2.y - n1.y) / dist;

        if (!n1.isDragging && !n1.animating) {
          n1.vx += dx * force;
          n1.vy += dy * force;
        }
        if (!n2.isDragging && !n2.animating) {
          n2.vx -= dx * force;
          n2.vy -= dy * force;
        }
      }
    }

    // Gravity pull towards center (250, 250)
    const centerX = 250;
    const centerY = 250;
    for (const node of this.nodes) {
      if (node.isDragging || node.animating) continue;
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      node.vx += dx * gravity;
      node.vy += dy * gravity;
    }

    // Update positions via Verlet-like dampening integration
    const damping = 0.72;
    for (const node of this.nodes) {
      if (node.isDragging || node.animating) continue;
      node.x += node.vx;
      node.y += node.vy;
      node.vx *= damping;
      node.vy *= damping;
    }

    // Dynamic rotation auto-orientation of cells towards their principal ports targets
    for (const node of this.nodes) {
      if (node.type === "cell") {
        const pConn = getConnectedPort(node.id, 0, this.wires);
        if (pConn) {
          const targetNode = this.nodes.find((n) => n.id === pConn.nodeId);
          if (targetNode) {
            node.angle = Math.atan2(
              targetNode.y - node.y,
              targetNode.x - node.x
            );
          }
        } else {
          // Point upwards if unconnected principal
          node.angle = -Math.PI / 2;
        }
      }
    }
  }

  private centerNet() {
    if (this.nodes.length === 0) {
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1.0;
      this.updateViewportTransform();
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of this.nodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }

    const netWidth = maxX - minX;
    const netHeight = maxY - minY;
    const netCenterX = minX + netWidth / 2;
    const netCenterY = minY + netHeight / 2;

    const svgRect = this.svg.getBoundingClientRect();
    const svgW = svgRect.width;
    const svgH = svgRect.height;

    // Apply padding
    const padding = 100;
    const zoomX = (svgW - padding * 2) / Math.max(netWidth, 1);
    const zoomY = (svgH - padding * 2) / Math.max(netHeight, 1);
    this.zoom = Math.max(0.4, Math.min(zoomX, zoomY, 1.5));

    this.panX = svgW / 2 - netCenterX * this.zoom;
    this.panY = svgH / 2 - netCenterY * this.zoom;

    this.updateViewportTransform();
  }

  // ==========================================
  // 9. High-Fidelity Rendering & Animations
  // ==========================================

  private startLoop() {
    const loop = (time: number) => {
      // Handle play-loop scheduler
      if (this.isRunning && this.animations.length === 0) {
        const interval = 1000 / this.simSpeed;
        if (time - this.lastStepTime >= interval) {
          this.simStep();
          this.lastStepTime = time;
        }
      }

      this.applyPhysics();
      this.updateAnimations(time);
      this.renderSVG();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private updateAnimations(time: number) {
    const completedAnimIds: string[] = [];

    for (const anim of this.animations) {
      const elapsed = time - anim.startTime;
      const progress = Math.min(1.0, elapsed / anim.duration);

      if (progress < 0.4) {
        anim.phase = "merge";
      } else if (progress >= 0.4 && progress < 0.55) {
        anim.phase = "spark";
      } else if (progress >= 0.55 && progress < 1.0) {
        anim.phase = "expand";
      } else {
        anim.phase = "done";
        completedAnimIds.push(anim.id);
      }
    }

    // Process completed animations, unlocking positions
    if (completedAnimIds.length > 0) {
      this.animations = this.animations.filter(
        (a) => !completedAnimIds.includes(a.id)
      );
      this.nodes.forEach((node) => {
        node.animating = false;
      });
    }
  }

  private renderSVG() {
    // 1. Update Net stats display
    const cellsVal = document.getElementById("stat-cells")!;
    const wiresVal = document.getElementById("stat-wires")!;
    const freeVal = document.getElementById("stat-free-ports")!;
    const activeVal = document.getElementById("stat-active-pairs")!;

    const cellsCount = this.nodes.filter((n) => n.type === "cell").length;
    const freeCount = this.nodes.filter((n) => n.type === "free").length;
    cellsVal.innerText = cellsCount.toString();
    wiresVal.innerText = this.wires.length.toString();
    freeVal.innerText = freeCount.toString();

    // Identify active wires for glow highlights
    let activeCount = 0;
    this.wires.forEach((wire) => {
      const isRedex =
        wire.fromPortIndex === 0 &&
        wire.toPortIndex === 0 &&
        this.nodes.find((n) => n.id === wire.fromNodeId)?.type === "cell" &&
        this.nodes.find((n) => n.id === wire.toNodeId)?.type === "cell";
      wire.isRedex = isRedex;
      if (isRedex) activeCount++;
    });
    activeVal.innerText = (activeCount / 2).toString(); // (from-to and to-from count, each redex wire is represented once)

    // Clear groupings
    this.wiresGroup.innerHTML = "";
    this.cellsGroup.innerHTML = "";
    this.portsGroup.innerHTML = "";

    const system = SYSTEMS[this.systemKey]!;

    // 2. Render Wires as Cubic Bezier Curves
    this.wires.forEach((wire) => {
      const n1 = this.nodes.find((n) => n.id === wire.fromNodeId);
      const n2 = this.nodes.find((n) => n.id === wire.toNodeId);

      if (n1 && n2) {
        const arity1 = system.symbols[n1.symbol]?.arity ?? 0;
        const arity2 = system.symbols[n2.symbol]?.arity ?? 0;

        const p1 = getPortCoordinate(n1, wire.fromPortIndex, arity1);
        const p2 = getPortCoordinate(n2, wire.toPortIndex, arity2);

        // Calculate control point vectors for curves
        let d1 = { x: 0, y: 0 };
        let d2 = { x: 0, y: 0 };

        if (n1.type === "cell") {
          const a1 = n1.angle ?? -Math.PI / 2;
          if (wire.fromPortIndex === 0) {
            d1 = { x: Math.cos(a1), y: Math.sin(a1) }; // principal exits outward
          } else {
            d1 = { x: -Math.cos(a1), y: -Math.sin(a1) }; // auxiliary exits backward
          }
        }
        if (n2.type === "cell") {
          const a2 = n2.angle ?? -Math.PI / 2;
          if (wire.toPortIndex === 0) {
            d2 = { x: Math.cos(a2), y: Math.sin(a2) };
          } else {
            d2 = { x: -Math.cos(a2), y: -Math.sin(a2) };
          }
        }

        const dist = getDistance(p1, p2);
        const curvatureScale = Math.min(45, dist / 2.5);

        const cp1x = p1.x + d1.x * curvatureScale;
        const cp1y = p1.y + d1.y * curvatureScale;
        const cp2x = p2.x + d2.x * curvatureScale;
        const cp2y = p2.y + d2.y * curvatureScale;

        const path = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "path"
        );
        path.setAttribute("class", `wire-path ${wire.isRedex ? "active" : ""}`);
        path.setAttribute(
          "d",
          `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`
        );
        path.setAttribute("data-wire-id", wire.id);

        this.wiresGroup.appendChild(path);
      }
    });

    // 3. Render Cells and FreePorts
    this.nodes.forEach((node) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `cell-g ${node.isDragging ? "dragging" : ""}`);

      if (node.type === "free") {
        // FreePort Node
        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        circle.setAttribute("cx", node.x.toString());
        circle.setAttribute("cy", node.y.toString());
        circle.setAttribute("r", "7");
        circle.setAttribute("class", "free-port-node");
        circle.setAttribute("data-node-id", node.id);

        // Add interactive port attributes
        circle.setAttribute("data-port-node-id", node.id);
        circle.setAttribute("data-port-index", "0");

        g.appendChild(circle);

        // Label Free port
        const label = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        label.setAttribute("x", node.x.toString());
        label.setAttribute("y", (node.y - 12).toString());
        label.setAttribute("font-family", "sans-serif");
        label.setAttribute("font-size", "9px");
        label.setAttribute("fill", "#94a3b8");
        label.setAttribute("text-anchor", "middle");
        label.textContent = "free";
        g.appendChild(label);
      } else {
        // Cell Node
        const sym = system.symbols[node.symbol]!;
        const theta = node.angle ?? -Math.PI / 2;

        if (sym.arity > 0) {
          // Draw Oriented Triangle
          const R_back = 12;
          const spacing = 16;
          const bx = node.x - R_back * Math.cos(theta);
          const by = node.y - R_back * Math.sin(theta);
          const ux = -Math.sin(theta);
          const uy = Math.cos(theta);

          const apexX = node.x + 22 * Math.cos(theta);
          const apexY = node.y + 22 * Math.sin(theta);

          const leftCornerX = bx + ((-spacing * sym.arity) / 2 - 4) * ux;
          const leftCornerY = by + ((-spacing * sym.arity) / 2 - 4) * uy;

          const rightCornerX = bx + ((spacing * sym.arity) / 2 + 4) * ux;
          const rightCornerY = by + ((spacing * sym.arity) / 2 + 4) * uy;

          const triangle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon"
          );
          triangle.setAttribute(
            "points",
            `${apexX},${apexY} ${leftCornerX},${leftCornerY} ${rightCornerX},${rightCornerY}`
          );
          triangle.setAttribute("class", "cell-triangle");
          triangle.setAttribute("fill", sym.color);
          triangle.setAttribute("stroke", sym.color);
          triangle.setAttribute("data-node-id", node.id);

          g.appendChild(triangle);
        } else {
          // Draw Circle for Constants (Arity 0)
          const circle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
          );
          circle.setAttribute("cx", node.x.toString());
          circle.setAttribute("cy", node.y.toString());
          circle.setAttribute("r", "15");
          circle.setAttribute("class", "cell-triangle");
          circle.setAttribute("fill", sym.color);
          circle.setAttribute("stroke", sym.color);
          circle.setAttribute("data-node-id", node.id);

          g.appendChild(circle);
        }

        // Draw Cell Label text inside triangle/circle
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text"
        );
        // Offset text slightly towards base for visual centering
        const offsetDist = sym.arity > 0 ? -2 : 0;
        text.setAttribute(
          "x",
          (node.x + offsetDist * Math.cos(theta)).toString()
        );
        text.setAttribute(
          "y",
          (node.y + offsetDist * Math.sin(theta)).toString()
        );
        text.setAttribute("class", "cell-label-text");
        text.textContent = sym.labelChar;
        g.appendChild(text);

        // Render cell individual ports dots
        for (let i = 0; i <= sym.arity; i++) {
          const coord = getPortCoordinate(node, i, sym.arity);
          const dot = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
          );
          dot.setAttribute("cx", coord.x.toString());
          dot.setAttribute("cy", coord.y.toString());
          dot.setAttribute("r", i === 0 ? "4.5" : "3.5");
          dot.setAttribute(
            "class",
            `port-dot ${i === 0 ? "principal" : "auxiliary"}`
          );
          dot.setAttribute("data-port-node-id", node.id);
          dot.setAttribute("data-port-index", i.toString());

          // Title hint on hover
          const title = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "title"
          );
          title.textContent =
            i === 0 ? "Principal Port" : `Auxiliary Port ${i}`;
          dot.appendChild(title);

          this.portsGroup.appendChild(dot);
        }
      }

      this.cellsGroup.appendChild(g);
    });

    // 4. Render Rewrite Animations Overlay
    this.renderRewriteAnimations();
  }

  private renderRewriteAnimations() {
    this.interactionGlowsGroup.innerHTML = "";
    const now = performance.now();

    for (const anim of this.animations) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1.0, elapsed / anim.duration);

      if (progress < 0.45) {
        // Phase 1: MERGING CELLS
        const t = progress / 0.45; // interpolation 0 -> 1

        const rX1 = anim.nodeA.x + (anim.midX - anim.nodeA.x) * t;
        const rY1 = anim.nodeA.y + (anim.midY - anim.nodeA.y) * t;
        const rX2 = anim.nodeB.x + (anim.midX - anim.nodeB.x) * t;
        const rY2 = anim.nodeB.y + (anim.midY - anim.nodeB.y) * t;

        // Draw node A fading into center
        const drawFadingCell = (
          x: number,
          y: number,
          color: string,
          symbol: string,
          arity: number,
          angle: number
        ) => {
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute("opacity", (1.0 - t * 0.7).toString());

          if (arity > 0) {
            const apexX = x + 22 * Math.cos(angle);
            const apexY = y + 22 * Math.sin(angle);
            const bx = x - 12 * Math.cos(angle);
            const by = y - 12 * Math.sin(angle);
            const ux = -Math.sin(angle);
            const uy = Math.cos(angle);

            const leftCornerX = bx + ((-16 * arity) / 2 - 4) * ux;
            const leftCornerY = by + ((-16 * arity) / 2 - 4) * uy;
            const rightCornerX = bx + ((16 * arity) / 2 + 4) * ux;
            const rightCornerY = by + ((16 * arity) / 2 + 4) * uy;

            const tri = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "polygon"
            );
            tri.setAttribute(
              "points",
              `${apexX},${apexY} ${leftCornerX},${leftCornerY} ${rightCornerX},${rightCornerY}`
            );
            tri.setAttribute("fill", color);
            tri.setAttribute("stroke", color);
            tri.setAttribute("stroke-width", "2");
            tri.setAttribute("opacity", "0.25");
            g.appendChild(tri);
          } else {
            const circ = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle"
            );
            circ.setAttribute("cx", x.toString());
            circ.setAttribute("cy", y.toString());
            circ.setAttribute("r", "15");
            circ.setAttribute("fill", color);
            circ.setAttribute("stroke", color);
            circ.setAttribute("stroke-width", "2");
            circ.setAttribute("opacity", "0.25");
            g.appendChild(circ);
          }

          const txt = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
          );
          txt.setAttribute("x", x.toString());
          txt.setAttribute("y", y.toString());
          txt.setAttribute("class", "cell-label-text");
          txt.textContent = symbol;
          g.appendChild(txt);

          this.interactionGlowsGroup.appendChild(g);
        };

        drawFadingCell(
          rX1,
          rY1,
          anim.nodeA.color,
          anim.nodeA.symbol,
          anim.nodeA.arity,
          anim.nodeA.angle
        );
        drawFadingCell(
          rX2,
          rY2,
          anim.nodeB.color,
          anim.nodeB.symbol,
          anim.nodeB.arity,
          anim.nodeB.angle
        );
      } else if (progress >= 0.45 && progress < 0.6) {
        // Phase 2: CONTACT EXPLOSION FLASH
        const t = (progress - 0.45) / 0.15; // 0 -> 1

        const flash = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle"
        );
        flash.setAttribute("cx", anim.midX.toString());
        flash.setAttribute("cy", anim.midY.toString());
        flash.setAttribute("r", (t * 50).toString());
        flash.setAttribute("fill", "none");
        flash.setAttribute("stroke", "#ffedd5");
        flash.setAttribute("stroke-width", "4");
        flash.setAttribute("opacity", (1.0 - t).toString());
        flash.setAttribute("filter", "url(#glow)");

        this.interactionGlowsGroup.appendChild(flash);
      }
    }
  }
}

interface CustomGlobalWindow extends Window {
  playground?: InteractionPlayground;
}

// Instantiate App once window is loaded
window.addEventListener("DOMContentLoaded", () => {
  (window as CustomGlobalWindow).playground = new InteractionPlayground();
});
