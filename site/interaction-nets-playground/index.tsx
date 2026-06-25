import ForceGraph from "force-graph";

// Types
type AgentType = "Con" | "Dup" | "Era";

interface Port {
  id: string;
  type: "principal" | "aux1" | "aux2";
  connectedTo: string | null; // ID of the connected port
}

interface Agent {
  id: string;
  type: AgentType;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  principal: Port;
  aux1?: Port;
  aux2?: Port;
  animState?: "flash" | "scale" | "shrink" | null;
}

interface Wire {
  id: string;
  source: string; // Agent ID
  target: string; // Agent ID
  sourcePort: string; // Port ID
  targetPort: string; // Port ID
}

// App State
let agents: Agent[] = [];
let wires: Wire[] = [];
let agentCounter = 0;

// Data Model Functions
function createAgent(type: AgentType, x = 0, y = 0): Agent {
  const id = `a${agentCounter++}`;
  const agent: Agent = {
    id,
    type,
    x,
    y,
    principal: { id: `${id}_p`, type: "principal", connectedTo: null },
  };

  if (type === "Con" || type === "Dup") {
    agent.aux1 = { id: `${id}_a1`, type: "aux1", connectedTo: null };
    agent.aux2 = { id: `${id}_a2`, type: "aux2", connectedTo: null };
  }

  agents.push(agent);
  updateGraph();
  return agent;
}

function findPort(portId: string): { agent: Agent; port: Port } | null {
  for (const agent of agents) {
    if (agent.principal.id === portId) return { agent, port: agent.principal };
    if (agent.aux1?.id === portId) return { agent, port: agent.aux1 };
    if (agent.aux2?.id === portId) return { agent, port: agent.aux2 };
  }
  return null;
}

function connectPorts(portId1: string, portId2: string) {
  if (portId1 === portId2) return; // Cannot connect to self
  const p1 = findPort(portId1);
  const p2 = findPort(portId2);

  if (!p1 || !p2) return;
  if (p1.port.connectedTo || p2.port.connectedTo) {
    console.warn("One or both ports are already connected.");
    return;
  }

  // Check if trying to connect a node to itself
  if (p1.agent.id === p2.agent.id) {
    console.warn("Cannot connect a node to itself.");
    return;
  }

  p1.port.connectedTo = portId2;
  p2.port.connectedTo = portId1;

  wires.push({
    id: `w_${portId1}_${portId2}`,
    source: p1.agent.id,
    target: p2.agent.id,
    sourcePort: portId1,
    targetPort: portId2,
  });

  updateGraph();
}

function removeAgent(agentId: string) {
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return;

  // disconnect ports
  const ports = [agent.principal, agent.aux1, agent.aux2].filter(
    (p) => p !== undefined
  );
  for (const port of ports) {
    if (port.connectedTo) {
      const connectedPort = findPort(port.connectedTo);
      if (connectedPort) {
        connectedPort.port.connectedTo = null;
      }
    }
  }

  // remove wires
  wires = wires.filter((w) => w.source !== agentId && w.target !== agentId);
  agents = agents.filter((a) => a.id !== agentId);
}

function updateGraph() {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- force-graph is untyped
  Graph.graphData({ nodes: agents, links: wires });
}

// DOM Elements
const graphContainer = document.getElementById("graph-container")!;
const addConBtn = document.getElementById("add-con")!;
const addDupBtn = document.getElementById("add-dup")!;
const addEraBtn = document.getElementById("add-era")!;
const clearBtn = document.getElementById("clear")!;
const stepBtn = document.getElementById("step-btn")!;
const playBtn = document.getElementById("play-btn")!;
const statusDisplay = document.getElementById("status-display")!;

function drawAgent(
  node: Agent,
  ctx: CanvasRenderingContext2D,
  globalScale: number
) {
  const size = 12;
  const fontSize = 10 / globalScale;
  ctx.font = `${fontSize}px Sans-Serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.save();
  ctx.translate(node.x!, node.y!);

  // Orientation based on velocity could be cool, but let's just draw them upright for now
  // or maybe rotate them towards their principal port if connected.
  // For simplicity, we just draw standard shapes.

  // Highlight selected node
  if (selectedNodeId === node.id) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.5, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
    ctx.fill();
  }

  // Handle animation states
  if (node.animState === "flash") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.8, 0, 2 * Math.PI, false);
    ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
    ctx.fill();
  } else if (node.animState === "scale") {
    ctx.scale(1.5, 1.5);
  } else if (node.animState === "shrink") {
    ctx.scale(0.5, 0.5);
  }

  if (node.type === "Con" || node.type === "Dup") {
    // Draw triangle
    ctx.beginPath();
    ctx.moveTo(0, -size); // Principal port (top)
    ctx.lineTo(size, size); // Aux2 (bottom right)
    ctx.lineTo(-size, size); // Aux1 (bottom left)
    ctx.closePath();

    ctx.fillStyle = node.type === "Con" ? "#88ccff" : "#88ffaa";
    ctx.fill();
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = "#333";
    ctx.stroke();

    // Draw port markers
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(0, -size, 2 / globalScale, 0, 2 * Math.PI);
    ctx.fill(); // Principal
    ctx.beginPath();
    ctx.arc(-size, size, 2 / globalScale, 0, 2 * Math.PI);
    ctx.fill(); // Aux1
    ctx.beginPath();
    ctx.arc(size, size, 2 / globalScale, 0, 2 * Math.PI);
    ctx.fill(); // Aux2

    ctx.fillText(node.type === "Con" ? "γ" : "δ", 0, 2);
  } else if (node.type === "Era") {
    // Draw small circle
    ctx.beginPath();
    ctx.arc(0, 0, size / 1.5, 0, 2 * Math.PI, false);
    ctx.fillStyle = "#ffaaaa";
    ctx.fill();
    ctx.lineWidth = 1.5 / globalScale;
    ctx.strokeStyle = "#333";
    ctx.stroke();

    // Principal port at top
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(0, -size / 1.5, 2 / globalScale, 0, 2 * Math.PI);
    ctx.fill(); // Principal

    ctx.fillText("ε", 0, 0);
  }

  ctx.restore();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- force-graph signature
function linkColor(_link: any) {
  return "#666";
}

let selectedPort: string | null = null;
let selectedNodeId: string | null = null;

// Initialize ForceGraph
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- force-graph is untyped
const Graph: any = (ForceGraph as any)()(graphContainer);

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any -- force-graph is untyped */
Graph.graphData({ nodes: agents, links: wires })
  .nodeId("id")
  .nodeCanvasObject(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) =>
      drawAgent(node as Agent, ctx, globalScale)
  )
  .linkColor(linkColor)
  .linkWidth(2)
  .onNodeClick((node: any) => {
    // For simplicity in this UI, clicking a node selects its first available port
    // Priority: Principal -> Aux1 -> Aux2
    const agent = node as Agent;
    let portToSelect: Port | null = null;
    if (!agent.principal.connectedTo) portToSelect = agent.principal;
    else if (agent.aux1 && !agent.aux1.connectedTo) portToSelect = agent.aux1;
    else if (agent.aux2 && !agent.aux2.connectedTo) portToSelect = agent.aux2;

    if (!portToSelect) {
      statusDisplay.innerText = `Agent ${agent.id} has no open ports.`;
      return;
    }

    if (!selectedPort) {
      selectedPort = portToSelect.id;
      selectedNodeId = agent.id;
      statusDisplay.innerText = `Selected port ${portToSelect.type} on agent ${agent.type}. Click another to connect.`;
    } else {
      if (selectedNodeId === agent.id) {
        statusDisplay.innerText = `Cannot connect a node to itself. Selection cleared.`;
        selectedPort = null;
        selectedNodeId = null;
        return;
      }

      connectPorts(selectedPort, portToSelect.id);
      statusDisplay.innerText = `Connected ports!`;
      selectedPort = null;
      selectedNodeId = null;
    }
  });

function findActivePair(): [Agent, Agent] | null {
  for (const agent of agents) {
    if (agent.principal.connectedTo) {
      const connectedPortInfo = findPort(agent.principal.connectedTo);
      if (connectedPortInfo && connectedPortInfo.port.type === "principal") {
        // Active pair found! (principal to principal)
        // To avoid finding the same pair twice (A-B and B-A), we can enforce an order or just return the first found
        if (agent.id < connectedPortInfo.agent.id) {
          return [agent, connectedPortInfo.agent];
        }
      }
    }
  }
  return null;
}

// Function to smoothly remove an agent
function disconnectAndRemoveAgent(agentId: string) {
  removeAgent(agentId);
}

// Helper to sleep
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Rewriting Rules
async function stepRewrite(): Promise<boolean> {
  const activePair = findActivePair();
  if (!activePair) {
    statusDisplay.innerText = "No active pairs to rewrite.";
    return false;
  }

  const [a1, a2] = activePair;
  statusDisplay.innerText = `Rewriting active pair: ${a1.type} - ${a2.type}`;

  // Pause graph physics temporarily
  Graph.pauseAnimation();

  const t1 = a1.type;
  const t2 = a2.type;

  // The rules of interaction nets (Lafont's combinators)

  if (t1 === t2 && (t1 === "Con" || t1 === "Dup")) {
    // Annihilation Animation
    a1.animState = "flash";
    a2.animState = "flash";
    updateGraph();
    Graph.resumeAnimation();
    await sleep(500);
    Graph.pauseAnimation();

    // Annihilation: a1(x, y) >< a2(u, v) => x ~ u, y ~ v
    // Connect a1.aux1 to a2.aux1, and a1.aux2 to a2.aux2
    const a1_aux1_connectedTo = a1.aux1?.connectedTo;
    const a1_aux2_connectedTo = a1.aux2?.connectedTo;
    const a2_aux1_connectedTo = a2.aux1?.connectedTo;
    const a2_aux2_connectedTo = a2.aux2?.connectedTo;

    disconnectAndRemoveAgent(a1.id);
    disconnectAndRemoveAgent(a2.id);

    if (a1_aux1_connectedTo && a2_aux1_connectedTo)
      connectPorts(a1_aux1_connectedTo, a2_aux1_connectedTo);
    if (a1_aux2_connectedTo && a2_aux2_connectedTo)
      connectPorts(a1_aux2_connectedTo, a2_aux2_connectedTo);
  } else if ((t1 === "Con" && t2 === "Dup") || (t1 === "Dup" && t2 === "Con")) {
    // Commutation Animation
    a1.animState = "scale";
    a2.animState = "scale";
    updateGraph();
    Graph.resumeAnimation();
    await sleep(500);
    Graph.pauseAnimation();

    // Commutation: Con >< Dup => creates 2 Cons and 2 Dups
    // Con(x, y) >< Dup(u, v) => x - Dup(x1, x2), y - Dup(y1, y2), u - Con(u1, u2), v - Con(v1, v2)
    // with cross connections: x1~u1, x2~v1, y1~u2, y2~v2

    const con = t1 === "Con" ? a1 : a2;
    const dup = t1 === "Dup" ? a1 : a2;

    const con_aux1_ct = con.aux1?.connectedTo;
    const con_aux2_ct = con.aux2?.connectedTo;
    const dup_aux1_ct = dup.aux1?.connectedTo;
    const dup_aux2_ct = dup.aux2?.connectedTo;

    const x = con.x || 0;
    const y = con.y || 0;

    disconnectAndRemoveAgent(a1.id);
    disconnectAndRemoveAgent(a2.id);

    const dup1 = createAgent("Dup", x - 10, y - 10);
    const dup2 = createAgent("Dup", x + 10, y - 10);
    const con1 = createAgent("Con", x - 10, y + 10);
    const con2 = createAgent("Con", x + 10, y + 10);

    if (con_aux1_ct) connectPorts(dup1.principal.id, con_aux1_ct);
    if (con_aux2_ct) connectPorts(dup2.principal.id, con_aux2_ct);
    if (dup_aux1_ct) connectPorts(con1.principal.id, dup_aux1_ct);
    if (dup_aux2_ct) connectPorts(con2.principal.id, dup_aux2_ct);

    connectPorts(dup1.aux1!.id, con1.aux1!.id);
    connectPorts(dup1.aux2!.id, con2.aux1!.id);
    connectPorts(dup2.aux1!.id, con1.aux2!.id);
    connectPorts(dup2.aux2!.id, con2.aux2!.id);
  } else if ((t1 === "Con" || t1 === "Dup") && t2 === "Era") {
    // Erasure Animation
    a1.animState = "shrink";
    a2.animState = "shrink";
    updateGraph();
    Graph.resumeAnimation();
    await sleep(500);
    Graph.pauseAnimation();

    // Erasure: Con/Dup(x, y) >< Era => x ~ Era, y ~ Era
    const a = a1;
    const a_aux1_ct = a.aux1?.connectedTo;
    const a_aux2_ct = a.aux2?.connectedTo;

    const x = a.x || 0;
    const y = a.y || 0;

    disconnectAndRemoveAgent(a1.id);
    disconnectAndRemoveAgent(a2.id);

    const era1 = createAgent("Era", x - 10, y);
    const era2 = createAgent("Era", x + 10, y);

    if (a_aux1_ct) connectPorts(era1.principal.id, a_aux1_ct);
    if (a_aux2_ct) connectPorts(era2.principal.id, a_aux2_ct);
  } else if ((t2 === "Con" || t2 === "Dup") && t1 === "Era") {
    // Erasure Animation
    a1.animState = "shrink";
    a2.animState = "shrink";
    updateGraph();
    Graph.resumeAnimation();
    await sleep(500);
    Graph.pauseAnimation();

    const a = a2;
    const a_aux1_ct = a.aux1?.connectedTo;
    const a_aux2_ct = a.aux2?.connectedTo;

    const x = a.x || 0;
    const y = a.y || 0;

    disconnectAndRemoveAgent(a1.id);
    disconnectAndRemoveAgent(a2.id);

    const era1 = createAgent("Era", x - 10, y);
    const era2 = createAgent("Era", x + 10, y);

    if (a_aux1_ct) connectPorts(era1.principal.id, a_aux1_ct);
    if (a_aux2_ct) connectPorts(era2.principal.id, a_aux2_ct);
  } else if (t1 === "Era" && t2 === "Era") {
    // Erasure Animation
    a1.animState = "shrink";
    a2.animState = "shrink";
    updateGraph();
    Graph.resumeAnimation();
    await sleep(500);
    Graph.pauseAnimation();

    // Erasure vs Erasure: Era >< Era => empty
    disconnectAndRemoveAgent(a1.id);
    disconnectAndRemoveAgent(a2.id);
  }

  updateGraph();
  Graph.resumeAnimation();
  return true;
}

stepBtn.addEventListener("click", () => {
  stepRewrite().catch(console.error);
});

let isPlaying = false;
// eslint-disable-next-line @typescript-eslint/no-misused-promises -- Expected for async event listeners
playBtn.addEventListener("click", async () => {
  if (isPlaying) {
    isPlaying = false;
    playBtn.innerText = "Play Autorewrite";
    statusDisplay.innerText = "Autorewrite paused.";
  } else {
    isPlaying = true;
    playBtn.innerText = "Pause Autorewrite";

    while (isPlaying) {
      const rewrote = await stepRewrite();
      if (!rewrote) {
        isPlaying = false;
        playBtn.innerText = "Play Autorewrite";
        statusDisplay.innerText = "Normalization complete (No active pairs).";
        break;
      }
      await sleep(100); // small delay between steps
    }
  }
});

addConBtn.addEventListener("click", () => {
  createAgent("Con");
  statusDisplay.innerText = "Added Con";
});
addDupBtn.addEventListener("click", () => {
  createAgent("Dup");
  statusDisplay.innerText = "Added Dup";
});
addEraBtn.addEventListener("click", () => {
  createAgent("Era");
  statusDisplay.innerText = "Added Era";
});
clearBtn.addEventListener("click", () => {
  agents = [];
  wires = [];
  agentCounter = 0;
  selectedPort = null;
  selectedNodeId = null;
  updateGraph();
  statusDisplay.innerText = "Graph cleared";
});
