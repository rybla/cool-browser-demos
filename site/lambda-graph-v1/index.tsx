import ForceGraph from "force-graph";

/* ==========================================================================
   Type Definitions
   ========================================================================== */

// AST Nodes
type AST =
  | { id: string; type: "var"; name: string }
  | { id: string; type: "lambda"; var: string; body: AST }
  | { id: string; type: "app"; left: AST; right: AST };

// Parser tokens
type Token =
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "LAMBDA" }
  | { type: "DOT" }
  | { type: "VAR"; name: string };

// Graph Nodes & Links for force-graph
interface GraphNode {
  id: string;
  type: "lambda" | "app" | "var";
  label: string;
  varName?: string;

  // Coordinates (supplied by force-graph or set by us)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;

  // Custom states for animations and highlights
  isRedex?: boolean;
  isArgument?: boolean;
  opacity?: number;
}

interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: "body" | "left" | "right";

  // Custom states for animations and highlights
  isRedex?: boolean;
  isBoundVarLink?: boolean;
  opacity?: number;
}

// AST Path for locating the redex
type Path = ("left" | "right" | "body")[];

// Predefined classic programs
const PRESETS: Record<string, string> = {
  identity: "(lambda x . x)",
  mockingbird: "(lambda x . (x x))",
  beta_demo: "((lambda x . (x x)) (lambda y . y))",
  k_comb: "(lambda x . (lambda y . x))",
  s_comb: "(lambda x . (lambda y . (lambda z . ((x z) (y z)))))",
  omega: "((lambda x . (x x)) (lambda x . (x x)))",
  church_two: "(lambda f . (lambda x . (f (f x))))",
  succ_one:
    "((lambda n . (lambda f . (lambda x . (f ((n f) x))))) (lambda f . (lambda x . (f x))))",
};

/* ==========================================================================
   Global State
   ========================================================================== */
let currentAST: AST | null = null;
let initialAST: AST | null = null;
let historyTrace: AST[] = [];
let nextNodeIdCounter = 1;
let isAnimating = false;
let isAutoPlayActive = false;
let autoPlayTimer: Timer | null = null;

// Graph drawing metrics
const NODE_R_LAMBDA = 10;
const NODE_R_APP = 8;
const NODE_R_VAR = 7;

// Ghost Clone Animation State
interface GhostNode {
  label: string;
  type: "lambda" | "app" | "var";
  // Interpolation points
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  // Current coordinates
  x: number;
  y: number;
}

interface GhostLink {
  sourceIdx: number;
  targetIdx: number;
  type: "body" | "left" | "right";
}

interface GhostAnimation {
  ghostNodes: GhostNode[];
  ghostLinks: GhostLink[];
  progress: number; // 0 to 1
  duration: number; // ms
  startTime: number;
}

let activeGhostAnimation: GhostAnimation | null = null;

// Multi-link curvature cache
let linkPairCounts: Record<string, number> = {};
let linkIndices: Record<string, number> = {};

/* ==========================================================================
   Helper Functions
   ========================================================================== */
function freshId(): string {
  return `n_${nextNodeIdCounter++}`;
}

// Strip outer enclosing parentheses if redundant for display
function cleanDisplayString(ast: AST): string {
  const str = astToString(ast);
  if (str.startsWith("(") && str.endsWith(")")) {
    // Check if matching
    let depth = 0;
    let match = true;
    for (let i = 0; i < str.length - 1; i++) {
      if (str[i] === "(") depth++;
      else if (str[i] === ")") depth--;
      if (depth === 0 && i > 0) {
        match = false;
        break;
      }
    }
    if (match && depth === 1) {
      return str.slice(1, -1);
    }
  }
  return str;
}

/* ==========================================================================
   Lexer & Parser
   ========================================================================== */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i]!;
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }
    if (char === "." || char === "•") {
      tokens.push({ type: "DOT" });
      i++;
      continue;
    }
    if (char === "λ" || char === "\\") {
      tokens.push({ type: "LAMBDA" });
      i++;
      continue;
    }
    if (
      input.slice(i, i + 6) === "lambda" &&
      !/[a-zA-Z0-9_]/.test(input[i + 6] || "")
    ) {
      tokens.push({ type: "LAMBDA" });
      i += 6;
      continue;
    }

    // Scan variable name
    const match = input.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (match) {
      tokens.push({ type: "VAR", name: match[0] });
      i += match[0].length;
      continue;
    }
    throw new Error(`Unexpected character: '${char}' at index ${i}`);
  }
  return tokens;
}

function parseAtom(
  tokens: Token[],
  index: number
): { term: AST; nextIndex: number } {
  if (index >= tokens.length) {
    throw new Error("Unexpected end of input");
  }
  const token = tokens[index]!;
  if (token.type === "VAR") {
    return {
      term: { id: freshId(), type: "var", name: token.name },
      nextIndex: index + 1,
    };
  }
  if (token.type === "LPAREN") {
    const { term, nextIndex } = parseExpression(tokens, index + 1);
    if (nextIndex >= tokens.length || tokens[nextIndex]!.type !== "RPAREN") {
      throw new Error("Expected ')' to close parenthesis");
    }
    return { term, nextIndex: nextIndex + 1 };
  }
  throw new Error(`Unexpected token at start of expression: '${token.type}'`);
}

function parseExpression(
  tokens: Token[],
  index: number
): { term: AST; nextIndex: number } {
  if (index >= tokens.length) {
    throw new Error("Unexpected end of input");
  }
  const token = tokens[index]!;
  if (token.type === "LAMBDA") {
    const varToken = tokens[index + 1];
    if (!varToken || varToken.type !== "VAR") {
      throw new Error("Expected variable name immediately after lambda");
    }
    const dotToken = tokens[index + 2];
    if (!dotToken || dotToken.type !== "DOT") {
      throw new Error("Expected '.' after lambda parameter");
    }
    const { term: body, nextIndex } = parseExpression(tokens, index + 3);
    return {
      term: { id: freshId(), type: "lambda", var: varToken.name, body },
      nextIndex,
    };
  }

  // Parse applications: sequence of atoms, left associative
  let { term: currentTerm, nextIndex } = parseAtom(tokens, index);
  while (nextIndex < tokens.length) {
    const nextToken = tokens[nextIndex]!;
    if (nextToken.type === "VAR" || nextToken.type === "LPAREN") {
      const { term: nextAtom, nextIndex: afterAtom } = parseAtom(
        tokens,
        nextIndex
      );
      currentTerm = {
        id: freshId(),
        type: "app",
        left: currentTerm,
        right: nextAtom,
      };
      nextIndex = afterAtom;
    } else {
      break;
    }
  }
  return { term: currentTerm, nextIndex };
}

function parseInput(input: string): AST {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    throw new Error("Empty input expression");
  }
  const { term, nextIndex } = parseExpression(tokens, 0);
  if (nextIndex < tokens.length) {
    throw new Error("Unexpected tokens after valid expression");
  }
  return term;
}

/* ==========================================================================
   AST Operations
   ========================================================================== */
function freeVars(ast: AST): Set<string> {
  const fvs = new Set<string>();
  function visit(node: AST, bound: Set<string>) {
    if (node.type === "var") {
      if (!bound.has(node.name)) {
        fvs.add(node.name);
      }
    } else if (node.type === "lambda") {
      const newBound = new Set(bound);
      newBound.add(node.var);
      visit(node.body, newBound);
    } else if (node.type === "app") {
      visit(node.left, bound);
      visit(node.right, bound);
    }
  }
  visit(ast, new Set());
  return fvs;
}

function cloneAST(ast: AST): AST {
  if (ast.type === "var") {
    return { id: freshId(), type: "var", name: ast.name };
  }
  if (ast.type === "lambda") {
    return {
      id: freshId(),
      type: "lambda",
      var: ast.var,
      body: cloneAST(ast.body),
    };
  }
  if (ast.type === "app") {
    return {
      id: freshId(),
      type: "app",
      left: cloneAST(ast.left),
      right: cloneAST(ast.right),
    };
  }
  throw new Error("Invalid AST");
}

let varCounter = 1;
function renameVar(name: string): string {
  const prefix = name.replace(/_\d+$/, "");
  return `${prefix}_${varCounter++}`;
}

function renameVariableInAST(ast: AST, oldName: string, newName: string): AST {
  if (ast.type === "var") {
    if (ast.name === oldName) {
      return { id: ast.id, type: "var", name: newName };
    }
    return ast;
  }
  if (ast.type === "lambda") {
    if (ast.var === oldName) {
      return ast;
    }
    return {
      id: ast.id,
      type: "lambda",
      var: ast.var,
      body: renameVariableInAST(ast.body, oldName, newName),
    };
  }
  if (ast.type === "app") {
    return {
      id: ast.id,
      type: "app",
      left: renameVariableInAST(ast.left, oldName, newName),
      right: renameVariableInAST(ast.right, oldName, newName),
    };
  }
  throw new Error("Invalid AST");
}

// Substitution: body[varName := arg] with capture avoidance
function substitute(body: AST, varName: string, arg: AST): AST {
  if (body.type === "var") {
    if (body.name === varName) {
      return cloneAST(arg);
    } else {
      return body;
    }
  }
  if (body.type === "lambda") {
    if (body.var === varName) {
      return body; // Shadowed
    }

    // Capture avoidance check
    const argFvs = freeVars(arg);
    if (argFvs.has(body.var)) {
      const fresh = renameVar(body.var);
      const renamedBody = renameVariableInAST(body.body, body.var, fresh);
      return {
        id: body.id,
        type: "lambda",
        var: fresh,
        body: substitute(renamedBody, varName, arg),
      };
    } else {
      return {
        id: body.id,
        type: "lambda",
        var: body.var,
        body: substitute(body.body, varName, arg),
      };
    }
  }
  if (body.type === "app") {
    return {
      id: body.id,
      type: "app",
      left: substitute(body.left, varName, arg),
      right: substitute(body.right, varName, arg),
    };
  }
  throw new Error("Invalid AST");
}

function findRedexPath(
  ast: AST,
  strategy: "normal" | "applicative"
): Path | null {
  if (strategy === "normal") {
    if (ast.type === "app" && ast.left.type === "lambda") {
      return [];
    }
    if (ast.type === "app") {
      const leftPath = findRedexPath(ast.left, strategy);
      if (leftPath) return ["left", ...leftPath];
      const rightPath = findRedexPath(ast.right, strategy);
      if (rightPath) return ["right", ...rightPath];
    }
    if (ast.type === "lambda") {
      const bodyPath = findRedexPath(ast.body, strategy);
      if (bodyPath) return ["body", ...bodyPath];
    }
  } else {
    // Applicative Order (innermost first)
    if (ast.type === "app") {
      const leftPath = findRedexPath(ast.left, strategy);
      if (leftPath) return ["left", ...leftPath];
      const rightPath = findRedexPath(ast.right, strategy);
      if (rightPath) return ["right", ...rightPath];

      if (ast.left.type === "lambda") {
        return [];
      }
    }
    if (ast.type === "lambda") {
      const bodyPath = findRedexPath(ast.body, strategy);
      if (bodyPath) return ["body", ...bodyPath];
    }
  }
  return null;
}

function reduceAtPath(ast: AST, path: Path): AST {
  if (path.length === 0) {
    if (ast.type === "app" && ast.left.type === "lambda") {
      return substitute(ast.left.body, ast.left.var, ast.right);
    }
    throw new Error("Selected path is not a valid redex");
  }
  const [head, ...tail] = path;
  if (head === "left" && ast.type === "app") {
    return { ...ast, left: reduceAtPath(ast.left, tail) };
  }
  if (head === "right" && ast.type === "app") {
    return { ...ast, right: reduceAtPath(ast.right, tail) };
  }
  if (head === "body" && ast.type === "lambda") {
    return { ...ast, body: reduceAtPath(ast.body, tail) };
  }
  throw new Error("Invalid path for reduction");
}

function astToString(ast: AST): string {
  if (ast.type === "var") {
    return ast.name;
  }
  if (ast.type === "lambda") {
    return `(lambda ${ast.var} . ${astToString(ast.body)})`;
  }
  if (ast.type === "app") {
    return `(${astToString(ast.left)} ${astToString(ast.right)})`;
  }
  return "";
}

// Find AST node at specific path
function getASTNodeAtPath(ast: AST, path: Path): AST {
  let curr = ast;
  for (const step of path) {
    if (step === "left" && curr.type === "app") curr = curr.left;
    else if (step === "right" && curr.type === "app") curr = curr.right;
    else if (step === "body" && curr.type === "lambda") curr = curr.body;
  }
  return curr;
}

/* ==========================================================================
   Graph Construction
   ========================================================================== */
function buildGraphFromAST(ast: AST): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const freeVarsMap = new Map<string, string>();
  let linkCounter = 1;

  function traverse(
    node: AST,
    env: Record<string, string>,
    parentId: string | null,
    relation: "body" | "left" | "right" | null
  ) {
    const nodeId = node.id;

    if (node.type === "lambda") {
      nodes.push({
        id: nodeId,
        type: "lambda",
        label: `λ${node.var}`,
        varName: node.var,
      });

      if (parentId && relation) {
        links.push({
          id: `link_${linkCounter++}`,
          source: parentId,
          target: nodeId,
          type: relation,
        });
      }

      // Bind variable in scope
      const newEnv = { ...env, [node.var]: nodeId };
      traverse(node.body, newEnv, nodeId, "body");
    } else if (node.type === "app") {
      nodes.push({
        id: nodeId,
        type: "app",
        label: "@",
      });

      if (parentId && relation) {
        links.push({
          id: `link_${linkCounter++}`,
          source: parentId,
          target: nodeId,
          type: relation,
        });
      }

      traverse(node.left, env, nodeId, "left");
      traverse(node.right, env, nodeId, "right");
    } else if (node.type === "var") {
      const binderId = env[node.name];
      if (binderId) {
        // Bound variable: Link parent directly back to the binding lambda
        if (parentId && relation) {
          links.push({
            id: `link_${linkCounter++}`,
            source: parentId,
            target: binderId,
            type: relation,
            isBoundVarLink: true,
          });
        }
      } else {
        // Free variable: Link to a shared unique free variable node
        let freeId = freeVarsMap.get(node.name);
        if (!freeId) {
          freeId = `free_${node.name}`;
          freeVarsMap.set(node.name, freeId);
          nodes.push({
            id: freeId,
            type: "var",
            label: node.name,
            varName: node.name,
          });
        }
        if (parentId && relation) {
          links.push({
            id: `link_${linkCounter++}`,
            source: parentId,
            target: freeId,
            type: relation,
          });
        }
      }
    }
  }

  traverse(ast, {}, null, null);

  // Pre-calculate curvatures for multi-link rendering
  computeLinkCurvatures(links);

  return { nodes, links };
}

function computeLinkCurvatures(links: GraphLink[]) {
  linkPairCounts = {};
  linkIndices = {};

  for (const link of links) {
    const s = typeof link.source === "string" ? link.source : link.source.id;
    const t = typeof link.target === "string" ? link.target : link.target.id;
    const key = s < t ? `${s}_${t}` : `${t}_${s}`;
    linkPairCounts[key] = (linkPairCounts[key] || 0) + 1;
  }

  const currentIndices: Record<string, number> = {};
  for (const link of links) {
    const s = typeof link.source === "string" ? link.source : link.source.id;
    const t = typeof link.target === "string" ? link.target : link.target.id;
    const key = s < t ? `${s}_${t}` : `${t}_${s}`;

    const idx = currentIndices[key] || 0;
    linkIndices[link.id] = idx;
    currentIndices[key] = idx + 1;
  }
}

function getLinkCurvature(link: GraphLink): number {
  const s = typeof link.source === "string" ? link.source : link.source.id;
  const t = typeof link.target === "string" ? link.target : link.target.id;

  // Special self loop curvature
  if (s === t) {
    return 0.7;
  }

  const key = s < t ? `${s}_${t}` : `${t}_${s}`;
  const total = linkPairCounts[key] || 1;

  // Base curvature for bound variable links to sweep beautifully around intermediate AST nodes
  const baseCurvature = link.isBoundVarLink ? 0.35 : 0;

  if (total <= 1) {
    return baseCurvature; // Apply base curvature if only one link between pair
  }

  const idx = linkIndices[link.id] || 0;
  // Distribute curvatures symmetrically, e.g. -0.2, 0.2, -0.4, 0.4
  const step = 0.25;
  const offset = idx - (total - 1) / 2;
  return baseCurvature + offset * step;
}

// Helper to find all nodes in a sub-AST recursively
function collectNodeIds(ast: AST): Set<string> {
  const ids = new Set<string>();
  function visit(node: AST) {
    ids.add(node.id);
    if (node.type === "lambda") {
      visit(node.body);
    } else if (node.type === "app") {
      visit(node.left);
      visit(node.right);
    }
  }
  visit(ast);
  return ids;
}

/* ==========================================================================
   Ghost Clones Animation Helper
   ========================================================================== */
function setupGhostAnimation(
  argAST: AST,
  argNodesInGraph: GraphNode[],
  targetPositions: { x: number; y: number }[],
  duration: number
) {
  // To build the local ghost subgraph, we do a quick local mapping
  const ghostNodes: GhostNode[] = [];
  const ghostLinks: GhostLink[] = [];
  const nodeMap = new Map<string, number>(); // originalId -> index in ghostNodes

  // Traverse argument AST to build nodes list
  function buildNodes(node: AST) {
    // Find matching real node coordinates in the graph
    const realNode = argNodesInGraph.find((rn) => rn.id === node.id);
    const startX = realNode?.x || 0;
    const startY = realNode?.y || 0;

    const idx = ghostNodes.length;
    nodeMap.set(node.id, idx);
    ghostNodes.push({
      label:
        node.type === "lambda"
          ? `λ${node.var}`
          : node.type === "app"
            ? "@"
            : node.name,
      type: node.type,
      startX,
      startY,
      endX: 0, // Filled in later
      endY: 0,
      x: startX,
      y: startY,
    });

    if (node.type === "lambda") {
      buildNodes(node.body);
    } else if (node.type === "app") {
      buildNodes(node.left);
      buildNodes(node.right);
    }
  }
  buildNodes(argAST);

  // Build local links list
  function buildLinks(node: AST) {
    const srcIdx = nodeMap.get(node.id)!;
    if (node.type === "lambda") {
      const targetIdx = nodeMap.get(node.body.id);
      if (targetIdx !== undefined) {
        ghostLinks.push({ sourceIdx: srcIdx, targetIdx, type: "body" });
      }
      buildLinks(node.body);
    } else if (node.type === "app") {
      const leftIdx = nodeMap.get(node.left.id);
      if (leftIdx !== undefined) {
        ghostLinks.push({
          sourceIdx: srcIdx,
          targetIdx: leftIdx,
          type: "left",
        });
      }
      const rightIdx = nodeMap.get(node.right.id);
      if (rightIdx !== undefined) {
        ghostLinks.push({
          sourceIdx: srcIdx,
          targetIdx: rightIdx,
          type: "right",
        });
      }
      buildLinks(node.left);
      buildLinks(node.right);
    }
  }
  buildLinks(argAST);

  // We have multiple variable occurrences (destinations).
  // If there are N targets, we spawn N full copies of the ghost subgraph!
  const finalGhostNodes: GhostNode[] = [];
  const finalGhostLinks: GhostLink[] = [];

  for (const target of targetPositions) {
    const baseIdx = finalGhostNodes.length;

    // Find offset between root ghost node and destination
    const rootGhost = ghostNodes[0]!;
    const offsetX = target.x - rootGhost.startX;
    const offsetY = target.y - rootGhost.startY;

    // Clone ghost nodes and set their destinations
    for (const gn of ghostNodes) {
      finalGhostNodes.push({
        ...gn,
        endX: gn.startX + offsetX,
        endY: gn.startY + offsetY,
      });
    }

    // Clone ghost links
    for (const gl of ghostLinks) {
      finalGhostLinks.push({
        sourceIdx: baseIdx + gl.sourceIdx,
        targetIdx: baseIdx + gl.targetIdx,
        type: gl.type,
      });
    }
  }

  activeGhostAnimation = {
    ghostNodes: finalGhostNodes,
    ghostLinks: finalGhostLinks,
    progress: 0,
    duration,
    startTime: Date.now(),
  };
}

/* ==========================================================================
   UI Controller & Renderer
   ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const presetSelect = document.getElementById(
    "preset-select"
  ) as HTMLSelectElement;
  const termInput = document.getElementById(
    "term-input"
  ) as HTMLTextAreaElement;
  const parseStatus = document.getElementById(
    "parse-status"
  ) as HTMLSpanElement;
  const strategySelect = document.getElementById(
    "strategy-select"
  ) as HTMLSelectElement;
  const speedSlider = document.getElementById(
    "speed-slider"
  ) as HTMLInputElement;
  const speedDisplay = document.getElementById(
    "speed-display"
  ) as HTMLSpanElement;
  const stepBtn = document.getElementById("step-btn") as HTMLButtonElement;
  const normalizeBtn = document.getElementById(
    "normalize-btn"
  ) as HTMLButtonElement;
  const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;
  const traceContainer = document.getElementById(
    "trace-container"
  ) as HTMLDivElement;
  const infoCard = document.getElementById("info-card") as HTMLDivElement;
  const infoDesc = document.getElementById("info-desc") as HTMLParagraphElement;
  const closeInfo = document.getElementById("close-info") as HTMLButtonElement;

  const zoomInBtn = document.getElementById("zoom-in-btn") as HTMLButtonElement;
  const zoomOutBtn = document.getElementById(
    "zoom-out-btn"
  ) as HTMLButtonElement;
  const zoomFitBtn = document.getElementById(
    "zoom-fit-btn"
  ) as HTMLButtonElement;
  const physicsBtn = document.getElementById(
    "physics-btn"
  ) as HTMLButtonElement;

  // Initialize Playback Speed
  let speedMultiplier = parseFloat(speedSlider.value);
  speedSlider.addEventListener("input", () => {
    speedMultiplier = parseFloat(speedSlider.value);
    speedDisplay.innerText = `${speedMultiplier.toFixed(1)}x`;
  });

  // Zoom Overlay Operations
  zoomInBtn.addEventListener("click", () => {
    const zoom = graph.zoom();
    graph.zoom(zoom * 1.3, 300);
  });
  zoomOutBtn.addEventListener("click", () => {
    const zoom = graph.zoom();
    graph.zoom(zoom / 1.3, 300);
  });
  zoomFitBtn.addEventListener("click", () => {
    graph.zoomToFit(400);
  });

  let isPhysicsFrozen = false;
  physicsBtn.addEventListener("click", () => {
    isPhysicsFrozen = !isPhysicsFrozen;
    if (isPhysicsFrozen) {
      graph.cooldownTicks(0);
      physicsBtn.innerText = "Resume";
      physicsBtn.style.color = "var(--accent-teal)";
    } else {
      graph.cooldownTicks(Infinity);
      graph.d3ReheatSimulation();
      physicsBtn.innerText = "Freeze";
      physicsBtn.style.color = "";
    }
  });

  // Setup force-graph
  const graphContainer = document.getElementById("graph-container")!;
  const graph = (
    ForceGraph as unknown as () => (container: HTMLElement) => ForceGraph
  )()(graphContainer);
  graph
    .nodeId("id")
    .nodeVal((nodeObj: unknown) => {
      const node = nodeObj as GraphNode;
      if (node.type === "lambda") return NODE_R_LAMBDA;
      if (node.type === "app") return NODE_R_APP;
      return NODE_R_VAR;
    })
    .linkSource("source")
    .linkTarget("target")
    .linkCurvature((linkObj: unknown) => getLinkCurvature(linkObj as GraphLink))
    .linkColor((linkObj: unknown) => {
      const link = linkObj as GraphLink;
      if (link.isRedex) return "rgba(244, 63, 94, 0.85)"; // Glowing crimson for active redex
      if (link.isBoundVarLink) return "rgba(236, 72, 153, 0.75)"; // Glowing magenta for binders
      if (link.type === "body") return "rgba(139, 92, 246, 0.65)"; // Purple for bodies
      if (link.type === "left" || link.type === "right")
        return "rgba(20, 184, 166, 0.65)"; // Teal for app branches
      return "rgba(156, 163, 175, 0.4)"; // Gray fallback
    })
    .linkWidth((linkObj: unknown) => {
      const link = linkObj as GraphLink;
      if (link.isRedex) return 3.5;
      if (link.isBoundVarLink) return 2.2;
      return 1.8;
    })
    .linkDirectionalArrowLength((linkObj: unknown) => {
      const link = linkObj as GraphLink;
      if (link.isRedex) return 8;
      return 5.5;
    })
    .linkDirectionalArrowRelPos(0.95)

    // Interaction Handlers
    .onNodeDrag((nodeObj: unknown, translate: { x: number; y: number }) => {
      const node = nodeObj as GraphNode;
      // Pin node during drag
      node.fx = translate.x;
      node.fy = translate.y;
    })
    .onNodeDragEnd((nodeObj: unknown) => {
      const node = nodeObj as GraphNode;
      if (!isPhysicsFrozen) {
        node.fx = undefined;
        node.fy = undefined;
      }
    })
    .nodeCanvasObject(
      (
        nodeObj: unknown,
        ctx: CanvasRenderingContext2D,
        globalScale: number
      ) => {
        const node = nodeObj as GraphNode;
        const r =
          node.type === "lambda"
            ? NODE_R_LAMBDA
            : node.type === "app"
              ? NODE_R_APP
              : NODE_R_VAR;

        if (node.x === undefined || node.y === undefined) return;

        ctx.save();

        // Determine styling variables
        let nodeGlowColor: string;
        let nodeFillGrad: CanvasGradient;

        if (node.type === "lambda") {
          nodeFillGrad = ctx.createRadialGradient(
            node.x,
            node.y,
            r * 0.1,
            node.x,
            node.y,
            r
          );
          nodeFillGrad.addColorStop(0, "#a78bfa");
          nodeFillGrad.addColorStop(1, "#7c3aed");
          if (node.isRedex) {
            nodeGlowColor = "#ef4444";
          } else {
            nodeGlowColor = "rgba(124, 58, 237, 0.4)";
          }
        } else if (node.type === "app") {
          nodeFillGrad = ctx.createRadialGradient(
            node.x,
            node.y,
            r * 0.1,
            node.x,
            node.y,
            r
          );
          nodeFillGrad.addColorStop(0, "#2dd4bf");
          nodeFillGrad.addColorStop(1, "#0d9488");
          if (node.isRedex) {
            nodeGlowColor = "#ef4444";
          } else {
            nodeGlowColor = "rgba(13, 148, 136, 0.4)";
          }
        } else {
          nodeFillGrad = ctx.createRadialGradient(
            node.x,
            node.y,
            r * 0.1,
            node.x,
            node.y,
            r
          );
          nodeFillGrad.addColorStop(0, "#fbbf24");
          nodeFillGrad.addColorStop(1, "#d97706");
          if (node.isArgument) {
            nodeGlowColor = "#8b5cf6";
          } else {
            nodeGlowColor = "rgba(217, 119, 6, 0.4)";
          }
        }

        const currentOpacity = node.opacity !== undefined ? node.opacity : 1;
        ctx.globalAlpha = currentOpacity;

        // Draw custom glowing shadow halo
        ctx.shadowColor = nodeGlowColor;
        ctx.shadowBlur = node.isRedex ? 15 / globalScale : 8 / globalScale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw main body shape
        ctx.fillStyle = nodeFillGrad;
        ctx.beginPath();
        if (node.type === "app") {
          // App is rounded square
          const x = node.x - r;
          const y = node.y - r;
          const size = r * 2;
          const rad = 5;
          ctx.moveTo(x + rad, y);
          ctx.arcTo(x + size, y, x + size, y + size, rad);
          ctx.arcTo(x + size, y + size, x, y + size, rad);
          ctx.arcTo(x, y + size, x, y, rad);
          ctx.arcTo(x, y, x + size, y, rad);
        } else {
          // Lambda and Var are circles
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
        }
        ctx.fill();

        // Deactivate shadows for text rendering
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Draw border stroke
        ctx.strokeStyle = node.isRedex ? "#f43f5e" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = node.isRedex ? 3 / globalScale : 1.5 / globalScale;
        ctx.stroke();

        // Render Text Label
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${r * 0.9}px "Outfit"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const labelText = node.label;
        ctx.fillText(
          labelText,
          node.x,
          node.y + (node.type === "lambda" ? -1 : 0.5)
        );

        ctx.restore();
      }
    )
    .linkCanvasObjectMode(() => "after")
    .linkCanvasObject(
      (
        linkObj: unknown,
        ctx: CanvasRenderingContext2D,
        globalScale: number
      ) => {
        const link = linkObj as GraphLink;
        // Draw label near starting point to show left/right/body labels
        const s = link.source;
        const t = link.target;
        if (typeof s === "string" || typeof t === "string") return;
        if (
          s.x === undefined ||
          s.y === undefined ||
          t.x === undefined ||
          t.y === undefined
        )
          return;

        const currentOpacity = link.opacity !== undefined ? link.opacity : 0.7;
        ctx.save();
        ctx.globalAlpha = currentOpacity;

        // Assign link color
        let strokeColor = "rgba(107, 114, 128, 0.4)";
        if (link.isRedex) {
          strokeColor = "rgba(239, 68, 68, 0.75)";
        } else if (link.isBoundVarLink) {
          strokeColor = "rgba(236, 72, 153, 0.75)";
        } else if (link.type === "body") {
          strokeColor = "rgba(139, 92, 246, 0.5)";
        } else if (link.type === "left" || link.type === "right") {
          strokeColor = "rgba(20, 184, 166, 0.5)";
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = link.isRedex ? 3.5 / globalScale : 1.8 / globalScale;

        // We let force-graph draw the actual link line, but we can style or add labels
        // Draw Left/Right helper badges near the start of the links
        if (
          link.type === "left" ||
          link.type === "right" ||
          link.type === "body"
        ) {
          const text =
            link.type === "left" ? "L" : link.type === "right" ? "R" : "body";

          // Find midpoint of curve (approximate)
          let midX = (s.x + t.x) / 2;
          let midY = (s.y + t.y) / 2;

          const curvature = getLinkCurvature(link);
          if (curvature !== 0) {
            // Calculate offset perpendicular to straight line
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
              // Curvature offset calculation
              const perpX = -dy / dist;
              const perpY = dx / dist;
              const offset = dist * curvature * 0.25;
              midX += perpX * offset;
              midY += perpY * offset;
            }
          }

          // Draw slightly closer to source node for clarity
          const textX = s.x + (midX - s.x) * 0.5;
          const textY = s.y + (midY - s.y) * 0.5;

          ctx.fillStyle = link.isRedex ? "#ef4444" : "#9ca3af";
          ctx.font = `italic ${8 / globalScale}px "JetBrains Mono"`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Background badge
          ctx.fillStyle = "rgba(10, 13, 22, 0.75)";
          ctx.beginPath();
          ctx.arc(textX, textY, 6 / globalScale, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = link.isRedex ? "#fca5a5" : "#e5e7eb";
          ctx.fillText(text[0]!.toUpperCase(), textX, textY + 0.2);
        }

        ctx.restore();
      }
    )

    // Ghost Clones Post-Drawing callback
    .onRenderFramePost((ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!activeGhostAnimation) return;

      const anim = activeGhostAnimation;
      const elapsed = Date.now() - anim.startTime;
      anim.progress = Math.min(1, elapsed / anim.duration);

      // Smooth step easing function
      const t = anim.progress;
      const ease = t * t * (3 - 2 * t);

      ctx.save();

      // Draw Ghost links
      for (const link of anim.ghostLinks) {
        const s = anim.ghostNodes[link.sourceIdx]!;
        const t = anim.ghostNodes[link.targetIdx]!;

        // Calculate current moving coordinates of endpoints
        const currSx = s.startX + (s.endX - s.startX) * ease;
        const currSy = s.startY + (s.endY - s.startY) * ease;
        const currTx = t.startX + (t.endX - t.startX) * ease;
        const currTy = t.startY + (t.endY - t.startY) * ease;

        ctx.beginPath();
        ctx.moveTo(currSx, currSy);
        ctx.lineTo(currTx, currTy);
        ctx.strokeStyle = "rgba(236, 72, 153, 0.4)";
        ctx.lineWidth = 2 / globalScale;
        ctx.setLineDash([4 / globalScale, 4 / globalScale]);
        ctx.stroke();
      }

      // Draw Ghost nodes
      for (const gn of anim.ghostNodes) {
        const currX = gn.startX + (gn.endX - gn.startX) * ease;
        const currY = gn.startY + (gn.endY - gn.startY) * ease;

        const r =
          gn.type === "lambda"
            ? NODE_R_LAMBDA
            : gn.type === "app"
              ? NODE_R_APP
              : NODE_R_VAR;

        ctx.beginPath();
        ctx.arc(currX, currY, r, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(139, 92, 246, 0.3)";
        ctx.fill();

        ctx.strokeStyle = "#ec4899";
        ctx.lineWidth = 1.8 / globalScale;
        ctx.setLineDash([2 / globalScale, 2 / globalScale]);
        ctx.stroke();

        // Label text
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.font = `bold ${r * 0.85}px "Outfit"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(gn.label, currX, currY);
      }

      ctx.restore();

      // Trigger redraw until finished
      if (anim.progress < 1) {
        graph.d3ReheatSimulation();
      } else {
        // Done with animation! Trigger the final structural update
        activeGhostAnimation = null;
        finalizeStepReduction();
      }
    });

  // Adjust canvas dimension responsively
  function resizeCanvas() {
    const w = graphContainer.clientWidth;
    const h = graphContainer.clientHeight;
    graph.width(w).height(h);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  /* ==========================================================================
     Trace History Management
     ========================================================================== */
  function updateTraceUI() {
    traceContainer.innerHTML = "";
    if (historyTrace.length === 0) {
      traceContainer.innerHTML = `<div class="trace-empty">No trace active</div>`;
      return;
    }

    historyTrace.forEach((ast, idx) => {
      const isCurrent = idx === historyTrace.length - 1;
      const item = document.createElement("div");
      item.classList.add("trace-item");
      if (isCurrent) item.classList.add("active");

      const stepNo = idx + 1;
      item.innerText = `${stepNo}. ${cleanDisplayString(ast)}`;

      item.addEventListener("click", () => {
        if (isAnimating) return;
        // Restore to this specific historical state
        currentAST = cloneAST(ast);
        historyTrace = historyTrace.slice(0, idx + 1);
        updateTraceUI();
        renderCurrentAST(false);
      });

      traceContainer.appendChild(item);
    });

    // Auto scroll trace to bottom
    traceContainer.scrollTop = traceContainer.scrollHeight;
  }

  /* ==========================================================================
     Term Loading & Rendering Controller
     ========================================================================== */
  function loadAndRenderTerm(input: string) {
    if (isAnimating) return;
    try {
      const ast = parseInput(input);
      initialAST = cloneAST(ast);
      currentAST = cloneAST(ast);
      historyTrace = [cloneAST(ast)];

      parseStatus.innerText = "Parsed";
      parseStatus.className = "status-badge state-success";

      termInput.style.borderColor = "";
      updateTraceUI();
      renderCurrentAST(true);
    } catch (err) {
      parseStatus.innerText = "Error";
      parseStatus.className = "status-badge state-error";
      termInput.style.borderColor = "var(--accent-crimson)";
      console.error(err);
    }
  }

  function renderCurrentAST(isFreshLoad: boolean) {
    if (!currentAST) return;

    const { nodes, links } = buildGraphFromAST(currentAST);

    // Coordinate inheritance for visual continuity
    const oldData = graph.graphData() as unknown as {
      nodes: GraphNode[];
      links: GraphLink[];
    };
    const oldNodesMap = new Map<string, GraphNode>();
    oldData.nodes.forEach((n) => oldNodesMap.set(n.id, n));

    nodes.forEach((n) => {
      const match = oldNodesMap.get(n.id);
      if (match) {
        n.x = match.x;
        n.y = match.y;
        n.vx = match.vx;
        n.vy = match.vy;
      } else {
        // Spawn brand-new nodes near their parents or center
        n.x = 0 + (Math.random() - 0.5) * 40;
        n.y = 0 + (Math.random() - 0.5) * 40;
      }
    });

    graph.graphData({ nodes, links });

    if (isFreshLoad) {
      // Zoom and center beautifully
      setTimeout(() => {
        graph.zoomToFit(600, 80);
      }, 150);
    }

    // Toggle Step/Normalize button states based on whether redex exists
    const strat = strategySelect.value as "normal" | "applicative";
    const nextRedex = findRedexPath(currentAST, strat);
    if (!nextRedex) {
      stepBtn.disabled = true;
      normalizeBtn.disabled = true;
      parseStatus.innerText = "Normal Form";
      parseStatus.className = "status-badge state-success";
    } else {
      stepBtn.disabled = false;
      normalizeBtn.disabled = false;
      parseStatus.innerText = "Active";
      parseStatus.className = "status-badge state-active";
    }
  }

  /* ==========================================================================
     Animation and Reduction Step Sequences
     ========================================================================== */
  let activeRedexPath: Path | null = null;
  let nextASTState: AST | null = null;

  function triggerStepReduction() {
    if (isAnimating || !currentAST) return;

    const strategy = strategySelect.value as "normal" | "applicative";
    const path = findRedexPath(currentAST, strategy);
    if (!path) {
      isAutoPlayActive = false;
      normalizeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="6 4 20 12 6 20 6 4" fill="currentColor"></polygon>
        </svg> Normalize`;
      return;
    }

    isAnimating = true;
    activeRedexPath = path;

    // Sidebar controls freeze during transitions
    stepBtn.disabled = true;
    normalizeBtn.disabled = true;
    resetBtn.disabled = true;
    presetSelect.disabled = true;
    termInput.disabled = true;

    // Locate active redex structures
    const redexApp = getASTNodeAtPath(currentAST, path);
    if (redexApp.type !== "app" || redexApp.left.type !== "lambda") {
      isAnimating = false;
      return;
    }

    const redexLambda = redexApp.left;
    const argumentTerm = redexApp.right;

    // Identify argument subgraph and occurrences in body
    const argNodeIds = collectNodeIds(argumentTerm);
    const { nodes, links } = graph.graphData() as {
      nodes: GraphNode[];
      links: GraphLink[];
    };

    // Highlight Redex in graph
    nodes.forEach((n) => {
      n.isRedex = n.id === redexApp.id || n.id === redexLambda.id;
      n.isArgument = argNodeIds.has(n.id);
    });

    links.forEach((l) => {
      const s = typeof l.source === "string" ? l.source : l.source.id;
      const t = typeof l.target === "string" ? l.target : l.target.id;

      // Redex connections: parent App -> left Lambda, parent App -> right Argument
      l.isRedex =
        s === redexApp.id && (t === redexLambda.id || t === argumentTerm.id);

      // Bound variable back-references pointing back to the active Lambda
      l.isBoundVarLink = t === redexLambda.id && s !== redexApp.id;
    });

    graph.graphData({ nodes, links });

    // Show Description Overlay
    infoDesc.innerHTML = `
      Reducing application node <strong>@</strong> (${redexApp.id}).<br/>
      Bound variable <strong>${redexLambda.var}</strong> is bound by <strong>λ${redexLambda.var}</strong>.<br/>
      Substituting argument subgraph into bound variable locations...
    `;
    infoCard.classList.remove("hidden");

    // Precalculate positions of bound variable occurrences (targets for ghost sliding)
    const targetVarLinks = links.filter((l) => l.isBoundVarLink);
    const targetPositions: { x: number; y: number }[] = [];

    targetVarLinks.forEach((vl) => {
      const srcNode = nodes.find(
        (n) =>
          n.id === (typeof vl.source === "string" ? vl.source : vl.source.id)
      );
      if (srcNode && srcNode.x !== undefined && srcNode.y !== undefined) {
        targetPositions.push({ x: srcNode.x, y: srcNode.y });
      }
    });

    // Precalculate target coordinates of the real argument nodes for copy
    const argNodesInGraph = nodes.filter((n) => argNodeIds.has(n.id));

    // Calculate reduction speed
    const baseDuration = targetPositions.length > 0 ? 1200 : 400; // instant fade if 0 bound references
    const duration = baseDuration / speedMultiplier;

    // Prepare ghost animation copy
    if (targetPositions.length > 0 && argNodesInGraph.length > 0) {
      setupGhostAnimation(
        argumentTerm,
        argNodesInGraph,
        targetPositions,
        duration
      );
    } else {
      // 0 references: Fade-out animation sequence
      setTimeout(() => {
        finalizeStepReduction();
      }, duration);
    }
  }

  function finalizeStepReduction() {
    if (!currentAST || !activeRedexPath) return;

    try {
      nextASTState = reduceAtPath(currentAST, activeRedexPath);
      currentAST = nextASTState;
      historyTrace.push(cloneAST(nextASTState));

      updateTraceUI();
      renderCurrentAST(false);

      termInput.value = cleanDisplayString(currentAST);
    } catch (err) {
      console.error("Reduction error:", err);
    }

    // Hide active info card
    infoCard.classList.add("hidden");

    // Restore sidebar interaction controls
    isAnimating = false;
    resetBtn.disabled = false;
    presetSelect.disabled = false;
    termInput.disabled = false;

    // Check if we continue AutoPlay Normalization
    if (isAutoPlayActive) {
      const strat = strategySelect.value as "normal" | "applicative";
      if (findRedexPath(currentAST, strat)) {
        autoPlayTimer = setTimeout(() => {
          triggerStepReduction();
        }, 1100 / speedMultiplier);
      } else {
        // Settle playback state once normalized
        isAutoPlayActive = false;
        normalizeBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="6 4 20 12 6 20 6 4" fill="currentColor"></polygon>
          </svg> Normalize`;
      }
    }
  }

  // Interactivity Actions
  stepBtn.addEventListener("click", () => {
    triggerStepReduction();
  });

  normalizeBtn.addEventListener("click", () => {
    if (isAnimating) return;

    if (isAutoPlayActive) {
      // Pause simulation
      isAutoPlayActive = false;
      if (autoPlayTimer) clearTimeout(autoPlayTimer);
      normalizeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="6 4 20 12 6 20 6 4" fill="currentColor"></polygon>
        </svg> Normalize`;
    } else {
      // Start auto play simulation
      isAutoPlayActive = true;
      normalizeBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="6" y="4" width="4" height="16" fill="currentColor"></rect>
          <rect x="14" y="4" width="4" height="16" fill="currentColor"></rect>
        </svg> Pause`;
      triggerStepReduction();
    }
  });

  resetBtn.addEventListener("click", () => {
    if (isAnimating) return;
    isAutoPlayActive = false;
    if (autoPlayTimer) clearTimeout(autoPlayTimer);
    normalizeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
        <polygon points="6 4 20 12 6 20 6 4" fill="currentColor"></polygon>
      </svg> Normalize`;

    if (initialAST) {
      currentAST = cloneAST(initialAST);
      historyTrace = [cloneAST(initialAST)];
      updateTraceUI();
      renderCurrentAST(false);
      termInput.value = cleanDisplayString(currentAST);
    }
  });

  // Example Loader Selection
  presetSelect.addEventListener("change", () => {
    const key = presetSelect.value;
    const termStr = PRESETS[key];
    if (termStr) {
      termInput.value = termStr;
      loadAndRenderTerm(termStr);
    }
  });

  // Real-time Text Input changes
  let typingTimeout: Timer | null = null;
  termInput.addEventListener("input", () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      const val = termInput.value.trim();
      if (val) {
        loadAndRenderTerm(val);
      } else {
        parseStatus.innerText = "Empty";
        parseStatus.className = "status-badge state-idle";
        termInput.style.borderColor = "";
      }
    }, 450);
  });

  // Info Overlay Closer
  closeInfo.addEventListener("click", () => {
    infoCard.classList.add("hidden");
  });

  // Auto load first demo program as initial state
  presetSelect.value = "beta_demo";
  termInput.value = PRESETS["beta_demo"]!;
  loadAndRenderTerm(PRESETS["beta_demo"]!);
});
