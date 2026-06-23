// Pyroclast: Advanced Falling Sand Physics Sandbox
// Implements 2D cellular automata with stone chunk gravity, bioluminescent lighting, and sub-pixel animations.

// Simulation Constants
const WIDTH = 200;
const HEIGHT = 150;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const CELL_SIZE = 4; // CANVAS_WIDTH / WIDTH

// Lightmap Constants (2x Downscaled for high-performance propagation)
const LIGHT_W = 100;
const LIGHT_H = 75;
const LIGHT_CELL_SIZE = 8;

// Element Types
enum ElementType {
  EMPTY = 0,
  SAND = 1,
  WATER = 2,
  STONE = 3,
  MOSS = 4,
  LAVA = 5,
  STEAM = 6,
}

// Flat Array Grid Buffers
const types = new Uint8Array(WIDTH * HEIGHT);
const colorsR = new Uint8Array(WIDTH * HEIGHT);
const colorsG = new Uint8Array(WIDTH * HEIGHT);
const colorsB = new Uint8Array(WIDTH * HEIGHT);
const life = new Float32Array(WIDTH * HEIGHT);
const lastUpdate = new Uint32Array(WIDTH * HEIGHT);

// Sub-pixel Animation Offsets
const visualX = new Float32Array(WIDTH * HEIGHT);
const visualY = new Float32Array(WIDTH * HEIGHT);

// Lightmap Buffers
const lightR = new Float32Array(LIGHT_W * LIGHT_H);
const lightG = new Float32Array(LIGHT_W * LIGHT_H);
const lightB = new Float32Array(LIGHT_W * LIGHT_H);
const lightOpacity = new Float32Array(LIGHT_W * LIGHT_H);

// Simulation Settings
let isPaused = false;
let simSpeed = 1; // 1 = 1x, 2 = 2x, 4 = 4x speed
let gravityForce = 1.0;
let mossGrowthRate = 0.5; // Probability to grow
let brushSize = 5;
let brushStyle = "round"; // "round" or "spray"
let currentMaterial = ElementType.SAND;
let currentTool = "draw"; // "draw" or "erase"

let toggleFlashlight = true;
let toggleSunlight = true;
let lightIntensityVal = 1.0;
let renderMode = "normal"; // "normal", "lighting-only", "ao-only", "flat"

let mouseX = -1000;
let mouseY = -1000;
let isMouseDown = false;

let frameCount = 0;
let lastTime = performance.now();
let fpsCount = 0;
let currentFps = 60;
let renderMs = 0.0;

// Initialize Grid positions
function initGrid() {
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    types[i] = ElementType.EMPTY;
    colorsR[i] = 15;
    colorsG[i] = 23;
    colorsB[i] = 42;
    life[i] = 0;
    lastUpdate[i] = 0;
    visualX[i] = i % WIDTH;
    visualY[i] = Math.floor(i / WIDTH);
  }
}

// Get raw RGB color and texture for elements
function setElementColor(i: number, type: ElementType) {
  const rand = Math.random();
  switch (type) {
    case ElementType.SAND:
      // Sand: Golden variations
      colorsR[i] = 210 + Math.floor(rand * 45);
      colorsG[i] = 160 + Math.floor(rand * 50);
      colorsB[i] = 30 + Math.floor(rand * 30);
      break;
    case ElementType.WATER:
      // Water: Blue-cyan variations
      colorsR[i] = 14 + Math.floor(rand * 20);
      colorsG[i] = 110 + Math.floor(rand * 55);
      colorsB[i] = 210 + Math.floor(rand * 45);
      break;
    case ElementType.STONE: {
      // Stone: Charcoal-grey variations
      const grey = 80 + Math.floor(rand * 40);
      colorsR[i] = grey;
      colorsG[i] = grey + Math.floor(rand * 8 - 4);
      colorsB[i] = grey + Math.floor(rand * 12 - 6);
      break;
    }
    case ElementType.MOSS:
      // Moss: Bioluminescent emerald greens
      colorsR[i] = 10 + Math.floor(rand * 25);
      colorsG[i] = 160 + Math.floor(rand * 60);
      colorsB[i] = 60 + Math.floor(rand * 30);
      break;
    case ElementType.LAVA:
      // Lava: Pulsing hot orange/red
      colorsR[i] = 220 + Math.floor(rand * 35);
      colorsG[i] = 50 + Math.floor(rand * 70);
      colorsB[i] = 10 + Math.floor(rand * 15);
      break;
    case ElementType.STEAM: {
      // Steam: Pale cloud white
      const steamVal = 200 + Math.floor(rand * 45);
      colorsR[i] = steamVal;
      colorsG[i] = steamVal;
      colorsB[i] = steamVal + 10;
      break;
    }
    default:
      // Empty: dark background slate
      colorsR[i] = 15;
      colorsG[i] = 23;
      colorsB[i] = 42;
      break;
  }
}

// Set a cell type and state safely
function setCell(x: number, y: number, type: ElementType, customLife = 0) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const idx = y * WIDTH + x;
  types[idx] = type;
  life[idx] =
    customLife === 0 && type === ElementType.STEAM
      ? 100 + Math.random() * 150
      : customLife;
  setElementColor(idx, type);
  lastUpdate[idx] = frameCount;
  // Keep visual position same if it was empty, otherwise reset to current grid coordinate
  visualX[idx] = x;
  visualY[idx] = y;
}

// Swap two cells along with their visual offset coordinates to keep animations smooth
function swapCells(idx1: number, idx2: number) {
  const type1 = types[idx1] ?? ElementType.EMPTY;
  const r1 = colorsR[idx1] ?? 0;
  const g1 = colorsG[idx1] ?? 0;
  const b1 = colorsB[idx1] ?? 0;
  const l1 = life[idx1] ?? 0;
  const u1 = lastUpdate[idx1] ?? 0;
  const vx1 = visualX[idx1] ?? 0;
  const vy1 = visualY[idx1] ?? 0;

  types[idx1] = types[idx2] ?? ElementType.EMPTY;
  colorsR[idx1] = colorsR[idx2] ?? 0;
  colorsG[idx1] = colorsG[idx2] ?? 0;
  colorsB[idx1] = colorsB[idx2] ?? 0;
  life[idx1] = life[idx2] ?? 0;
  lastUpdate[idx1] = lastUpdate[idx2] ?? 0;
  visualX[idx1] = visualX[idx2] ?? 0;
  visualY[idx1] = visualY[idx2] ?? 0;

  types[idx2] = type1;
  colorsR[idx2] = r1;
  colorsG[idx2] = g1;
  colorsB[idx2] = b1;
  life[idx2] = l1;
  lastUpdate[idx2] = u1;
  visualX[idx2] = vx1;
  visualY[idx2] = vy1;
}

// Displace an element from target cell to nearby empty or fluid cells
function displaceCell(srcIdx: number, destX: number, destY: number) {
  const destIdx = destY * WIDTH + destX;
  if (types[destIdx] === ElementType.EMPTY) {
    swapCells(srcIdx, destIdx);
    return true;
  }

  // Find a nearby empty or lighter cell to displace to
  const directions = [
    [0, -1],
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
    [0, 1],
  ] as const;

  for (const [dx, dy] of directions) {
    const nx = destX + dx;
    const ny = destY + dy;
    if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
      const nIdx = ny * WIDTH + nx;
      // If neighbors is empty or steam (less dense) or water (less dense than stone/sand/lava)
      if (
        types[nIdx] === ElementType.EMPTY ||
        (types[srcIdx] !== ElementType.STEAM &&
          types[nIdx] === ElementType.STEAM) ||
        ((types[srcIdx] === ElementType.STONE ||
          types[srcIdx] === ElementType.SAND) &&
          types[nIdx] === ElementType.WATER)
      ) {
        swapCells(destIdx, nIdx);
        swapCells(srcIdx, destIdx);
        return true;
      }
    }
  }
  return false;
}

// Connected Component Analysis for Stone Chunk Gravity
const visitedStone = new Uint8Array(WIDTH * HEIGHT);
const chunkMap = new Int32Array(WIDTH * HEIGHT);
const chunkSupported = new Uint8Array(2000); // Max chunks per frame
let chunkCount = 0;

interface Point {
  x: number;
  y: number;
}

function solveStoneChunkGravity() {
  visitedStone.fill(0);
  chunkMap.fill(-1);
  chunkCount = 0;

  // 1. Group connected stone cells using BFS
  const queue: Point[] = [];
  const chunks: number[][] = []; // Indices of stone cells in each chunk

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const i = y * WIDTH + x;
      if (types[i] === ElementType.STONE && visitedStone[i] === 0) {
        const chunkId = chunkCount++;
        if (chunkId >= chunkSupported.length) break;

        visitedStone[i] = 1;
        chunkMap[i] = chunkId;

        const currentChunk: number[] = [i];
        queue.push({ x, y });

        while (queue.length > 0) {
          const curr = queue.shift()!;

          // Check 4 directions
          const dirs = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ] as const;
          for (const [dx, dy] of dirs) {
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
              const ni = ny * WIDTH + nx;
              if (types[ni] === ElementType.STONE && visitedStone[ni] === 0) {
                visitedStone[ni] = 1;
                chunkMap[ni] = chunkId;
                currentChunk.push(ni);
                queue.push({ x: nx, y: ny });
              }
            }
          }
        }
        chunks.push(currentChunk);
      }
    }
  }

  if (chunkCount === 0) return;

  // 2. Initialize support status for each chunk
  // A chunk is directly supported if any of its cells rests on the bottom boundary
  // or on another non-stone solid element (like Moss).
  chunkSupported.fill(0, 0, chunkCount);

  for (let c = 0; c < chunkCount; c++) {
    const chunkCells = chunks[c] ?? [];
    let supported = false;
    for (const cellIdx of chunkCells) {
      const cy = Math.floor(cellIdx / WIDTH);
      const cx = cellIdx % WIDTH;

      // Bottom border support
      if (cy + 1 >= HEIGHT) {
        supported = true;
        break;
      }

      // Check element directly below
      const belowIdx = (cy + 1) * WIDTH + cx;
      const belowType = types[belowIdx];

      // If it rests on supported Moss, it is supported
      if (belowType === ElementType.MOSS) {
        supported = true;
        break;
      }
    }
    if (supported) {
      chunkSupported[c] = 1;
    }
  }

  // 3. Propagate support through stacked stone chunks
  // If chunk A has a cell resting on chunk B, and chunk B is supported, chunk A becomes supported.
  let supportChanged = true;
  let iterations = 0;
  while (supportChanged && iterations < 15) {
    supportChanged = false;
    for (let c = 0; c < chunkCount; c++) {
      if ((chunkSupported[c] ?? 0) === 1) continue;

      const chunkCells = chunks[c] ?? [];
      for (const cellIdx of chunkCells) {
        const cy = Math.floor(cellIdx / WIDTH);
        const cx = cellIdx % WIDTH;
        const belowIdx = (cy + 1) * WIDTH + cx;

        if (cy + 1 < HEIGHT && types[belowIdx] === ElementType.STONE) {
          const belowChunkId = chunkMap[belowIdx] ?? -1;
          if (
            belowChunkId !== -1 &&
            belowChunkId !== c &&
            (chunkSupported[belowChunkId] ?? 0) === 1
          ) {
            chunkSupported[c] = 1;
            supportChanged = true;
            break;
          }
        }
      }
    }
    iterations++;
  }

  // 4. Fall unsupported chunks down
  // Process unsupported chunks from bottom to top (highest y first) to fall correctly
  const unsupportedChunks: { id: number; cells: number[] }[] = [];
  for (let c = 0; c < chunkCount; c++) {
    const chunkCells = chunks[c];
    if (chunkCells && chunkSupported[c] === 0) {
      // Sort cells by Y descending so bottom cells fall first
      const sortedCells = [...chunkCells].sort((a, b) => b - a);
      unsupportedChunks.push({ id: c, cells: sortedCells });
    }
  }

  // Sort chunks so chunks situated lower in the screen fall first
  unsupportedChunks.sort((a, b) => {
    const aVal = a.cells[0] ?? 0;
    const bVal = b.cells[0] ?? 0;
    return bVal - aVal;
  });

  // Gravity scale determines how fast it falls (usually 1 block per step)
  if (Math.random() < gravityForce) {
    for (const chunk of unsupportedChunks) {
      // Displace elements at the chunk destinations
      const displacedElements: {
        type: ElementType;
        r: number;
        g: number;
        b: number;
        l: number;
        u: number;
        vx: number;
        vy: number;
      }[] = [];
      const destinationIndices: number[] = [];
      const sourceIndicesSet = new Set(chunk.cells);

      // Determine what elements will be run over and collect them
      for (const cellIdx of chunk.cells) {
        const cy = Math.floor(cellIdx / WIDTH);
        const cx = cellIdx % WIDTH;
        const destIdx = (cy + 1) * WIDTH + cx;

        destinationIndices.push(destIdx);

        // If the cell below is not part of this same falling chunk, collect its content for displacement
        if (!sourceIndicesSet.has(destIdx)) {
          displacedElements.push({
            type: types[destIdx] ?? ElementType.EMPTY,
            r: colorsR[destIdx] ?? 0,
            g: colorsG[destIdx] ?? 0,
            b: colorsB[destIdx] ?? 0,
            l: life[destIdx] ?? 0,
            u: lastUpdate[destIdx] ?? 0,
            vx: visualX[destIdx] ?? cx,
            vy: visualY[destIdx] ?? cy,
          });
        }
      }

      // Clear original cells of this chunk
      for (const cellIdx of chunk.cells) {
        types[cellIdx] = ElementType.EMPTY;
        colorsR[cellIdx] = 15;
        colorsG[cellIdx] = 23;
        colorsB[cellIdx] = 42;
        life[cellIdx] = 0;
        visualX[cellIdx] = cellIdx % WIDTH;
        visualY[cellIdx] = Math.floor(cellIdx / WIDTH);
      }

      // Write chunk cells in their new positions
      for (const cellIdx of chunk.cells) {
        const cy = Math.floor(cellIdx / WIDTH);
        const cx = cellIdx % WIDTH;
        const destIdx = (cy + 1) * WIDTH + cx;

        types[destIdx] = ElementType.STONE;
        setElementColor(destIdx, ElementType.STONE);
        lastUpdate[destIdx] = frameCount;

        // Sub-pixel position starts at previous cell position (x, y)
        visualX[destIdx] = cx;
        visualY[destIdx] = cy;
      }

      // Displace collected elements to vacated cells of the chunk
      // Vacated cells are the original cell indices that did not get filled by a stone cell from above
      const vacatedIndices: number[] = [];
      for (const cellIdx of chunk.cells) {
        if (types[cellIdx] === ElementType.EMPTY) {
          vacatedIndices.push(cellIdx);
        }
      }

      // Write the displaced elements into vacated slots
      let displacedPtr = 0;
      for (const vacIdx of vacatedIndices) {
        if (displacedPtr >= displacedElements.length) break;
        const elem = displacedElements[displacedPtr++];
        if (!elem) continue;

        types[vacIdx] = elem.type;
        colorsR[vacIdx] = elem.r;
        colorsG[vacIdx] = elem.g;
        colorsB[vacIdx] = elem.b;
        life[vacIdx] = elem.l;
        lastUpdate[vacIdx] = frameCount;

        // Preserve their animation offsets
        visualX[vacIdx] = elem.vx;
        visualY[vacIdx] = elem.vy;
      }

      // If we have remaining displaced items (due to mismatch, which shouldn't happen), place them around
      while (displacedPtr < displacedElements.length) {
        const elem = displacedElements[displacedPtr++];
        if (!elem) continue;
        // Find a random empty spot near the bottom of the chunk to squeeze them in
        const bottomCell = chunk.cells[0] ?? 0;
        const bx = bottomCell % WIDTH;
        const by = Math.floor(bottomCell / WIDTH);

        let placed = false;
        for (let dy = -2; dy <= 2 && !placed; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = bx + dx;
            const ny = by + dy;
            if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
              const ni = ny * WIDTH + nx;
              if (types[ni] === ElementType.EMPTY) {
                types[ni] = elem.type;
                colorsR[ni] = elem.r;
                colorsG[ni] = elem.g;
                colorsB[ni] = elem.b;
                life[ni] = elem.l;
                visualX[ni] = elem.vx;
                visualY[ni] = elem.vy;
                placed = true;
                break;
              }
            }
          }
        }
      }
    }
  }
}

// Single step execution of physics rules
function updatePhysics() {
  frameCount++;

  // 1. Solve Stone Chunk gravity first
  solveStoneChunkGravity();

  // 2. Loop through all non-stone cells and run cellular rules
  // Scan from bottom to top for gravity elements
  for (let y = HEIGHT - 1; y >= 0; y--) {
    // Alternate horizontal scan direction to avoid bias
    const leftToRight = Math.random() < 0.5;
    const startX = leftToRight ? 0 : WIDTH - 1;
    const endX = leftToRight ? WIDTH : -1;
    const stepX = leftToRight ? 1 : -1;

    for (let x = startX; x !== endX; x += stepX) {
      const idx = y * WIDTH + x;
      const type = types[idx];

      // Skip empty, stone (handled by chunk solver), and already updated cells
      if (
        type === ElementType.EMPTY ||
        type === ElementType.STONE ||
        lastUpdate[idx] === frameCount
      ) {
        continue;
      }

      // Process materials
      switch (type) {
        case ElementType.SAND:
          handleSand(x, y, idx);
          break;
        case ElementType.WATER:
          handleWater(x, y, idx);
          break;
        case ElementType.MOSS:
          handleMoss(x, y, idx);
          break;
        case ElementType.LAVA:
          handleLava(x, y, idx);
          break;
        case ElementType.STEAM:
          handleSteam(x, y, idx);
          break;
      }
    }
  }
}

// Physics details for Sand
function handleSand(x: number, y: number, idx: number) {
  if (Math.random() > gravityForce) return;

  const belowY = y + 1;
  if (belowY < HEIGHT) {
    const belowIdx = belowY * WIDTH + x;
    const belowType = types[belowIdx];

    // Sand falls in empty, water, steam
    if (belowType === ElementType.EMPTY) {
      swapCells(idx, belowIdx);
      return;
    } else if (
      belowType === ElementType.WATER ||
      belowType === ElementType.STEAM
    ) {
      // Sand is heavier, so displace it
      displaceCell(idx, x, belowY);
      return;
    }

    // Check diagonals
    const diagLeftX = x - 1;
    const diagRightX = x + 1;
    const tryLeft = Math.random() < 0.5;

    if (tryLeft && diagLeftX >= 0) {
      const dlIdx = belowY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      } else if (
        types[dlIdx] === ElementType.WATER ||
        types[dlIdx] === ElementType.STEAM
      ) {
        displaceCell(idx, diagLeftX, belowY);
        return;
      }
    }
    if (diagRightX < WIDTH) {
      const drIdx = belowY * WIDTH + diagRightX;
      if (types[drIdx] === ElementType.EMPTY) {
        swapCells(idx, drIdx);
        return;
      } else if (
        types[drIdx] === ElementType.WATER ||
        types[drIdx] === ElementType.STEAM
      ) {
        displaceCell(idx, diagRightX, belowY);
        return;
      }
    }

    // If not tried left first, try left now
    if (!tryLeft && diagLeftX >= 0) {
      const dlIdx = belowY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      } else if (
        types[dlIdx] === ElementType.WATER ||
        types[dlIdx] === ElementType.STEAM
      ) {
        displaceCell(idx, diagLeftX, belowY);
        return;
      }
    }
  }
}

// Physics details for Water
function handleWater(x: number, y: number, idx: number) {
  if (Math.random() > gravityForce) return;

  const belowY = y + 1;

  // 1. Move straight down
  if (belowY < HEIGHT) {
    const belowIdx = belowY * WIDTH + x;
    if (types[belowIdx] === ElementType.EMPTY) {
      swapCells(idx, belowIdx);
      return;
    } else if (types[belowIdx] === ElementType.STEAM) {
      swapCells(idx, belowIdx); // Water sinks through steam
      return;
    }
  }

  // 2. Move diagonally down
  const diagLeftX = x - 1;
  const diagRightX = x + 1;
  const tryLeft = Math.random() < 0.5;

  if (belowY < HEIGHT) {
    if (tryLeft && diagLeftX >= 0) {
      const dlIdx = belowY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      }
    }
    if (diagRightX < WIDTH) {
      const drIdx = belowY * WIDTH + diagRightX;
      if (types[drIdx] === ElementType.EMPTY) {
        swapCells(idx, drIdx);
        return;
      }
    }
    if (!tryLeft && diagLeftX >= 0) {
      const dlIdx = belowY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      }
    }
  }

  // 3. Spreads horizontally (slides sideways)
  // Low-viscosity: check horizontally up to 3 units left or right
  const sideLeft = x - 1;
  const sideRight = x + 1;

  if (
    tryLeft &&
    sideLeft >= 0 &&
    types[y * WIDTH + sideLeft] === ElementType.EMPTY
  ) {
    swapCells(idx, y * WIDTH + sideLeft);
    return;
  }
  if (sideRight < WIDTH && types[y * WIDTH + sideRight] === ElementType.EMPTY) {
    swapCells(idx, y * WIDTH + sideRight);
    return;
  }
  if (
    !tryLeft &&
    sideLeft >= 0 &&
    types[y * WIDTH + sideLeft] === ElementType.EMPTY
  ) {
    swapCells(idx, y * WIDTH + sideLeft);
    return;
  }
}

// Physics details for Moss
function handleMoss(x: number, y: number, idx: number) {
  // Moss is stationary, but grows
  if (Math.random() > mossGrowthRate * 0.05) return;

  // 1. Spreads along adjacent surfaces. Needs water to grow quickly,
  // but can slowly grow on stone or other moss surfaces.
  const neighbors = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ] as const;

  // Find adjacent water to consume, and check if we are adjacent to a solid support (Stone, Moss)
  let hasSupport = false;
  let waterTargetIdx = -1;
  const emptyTargets: Point[] = [];

  for (const [dx, dy] of neighbors) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
      const nIdx = ny * WIDTH + nx;
      const nType = types[nIdx];

      if (
        nType === ElementType.STONE ||
        nType === ElementType.MOSS ||
        nType === ElementType.SAND
      ) {
        hasSupport = true;
      } else if (nType === ElementType.WATER) {
        waterTargetIdx = nIdx;
      } else if (nType === ElementType.EMPTY) {
        emptyTargets.push({ x: nx, y: ny });
      }
    }
  }

  // Moss must be attached to a solid structure
  if (!hasSupport) {
    // If floating unsupported, moss has a small chance to turn to dust (die/fall)
    if (Math.random() < 0.1) {
      // Fall down like powder if there's space below
      const belowY = y + 1;
      if (belowY < HEIGHT && types[belowY * WIDTH + x] === ElementType.EMPTY) {
        swapCells(idx, belowY * WIDTH + x);
      }
    }
    return;
  }

  // Grow with water
  if (waterTargetIdx !== -1) {
    // Absorb water and convert water cell directly to moss!
    types[waterTargetIdx] = ElementType.MOSS;
    setElementColor(waterTargetIdx, ElementType.MOSS);
    lastUpdate[waterTargetIdx] = frameCount;
    visualX[waterTargetIdx] = waterTargetIdx % WIDTH;
    visualY[waterTargetIdx] = Math.floor(waterTargetIdx / WIDTH);
    return;
  }

  // Slow natural spreading into empty spaces adjacent to surfaces
  if (emptyTargets.length > 0) {
    const target =
      emptyTargets[Math.floor(Math.random() * emptyTargets.length)];

    if (target) {
      // Check if the target empty cell itself is adjacent to stone/moss
      let targetSupported = false;
      for (const [dx, dy] of neighbors) {
        const tx = target.x + dx;
        const ty = target.y + dy;
        if (tx >= 0 && tx < WIDTH && ty >= 0 && ty < HEIGHT) {
          const tType = types[ty * WIDTH + tx];
          if (
            tType === ElementType.STONE ||
            tType === ElementType.MOSS ||
            tType === ElementType.SAND
          ) {
            targetSupported = true;
            break;
          }
        }
      }

      if (targetSupported) {
        setCell(target.x, target.y, ElementType.MOSS);
      }
    }
  }
}

// Physics details for Lava
function handleLava(x: number, y: number, idx: number) {
  // 1. Interactions: Lava reacts with water, stone, moss, sand
  const checkDirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;

  for (const [dx, dy] of checkDirs) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
      const nIdx = ny * WIDTH + nx;
      const nType = types[nIdx];

      if (nType === ElementType.WATER) {
        // Water meets Lava: Water vaporizes to Steam, Lava cools to Obsidian (Stone)
        setCell(x, y, ElementType.STONE);
        setCell(nx, ny, ElementType.STEAM);
        return; // Stopped being lava
      } else if (nType === ElementType.MOSS) {
        // Lava burns moss: converts moss into Lava! Wildfire propagation
        setCell(nx, ny, ElementType.LAVA);
      } else if (nType === ElementType.SAND) {
        // Heat melts sand into lava
        if (Math.random() < 0.15) {
          setCell(nx, ny, ElementType.LAVA);
        }
      } else if (nType === ElementType.STONE) {
        // Slow melting of stone
        if (Math.random() < 0.001) {
          setCell(nx, ny, ElementType.LAVA);
        }
      }
    }
  }

  if (Math.random() > gravityForce) return;

  // 2. Viscous Fluid Movement: falls and spreads slower than water
  const belowY = y + 1;
  if (belowY < HEIGHT) {
    const belowIdx = belowY * WIDTH + x;
    if (types[belowIdx] === ElementType.EMPTY) {
      swapCells(idx, belowIdx);
      return;
    } else if (types[belowIdx] === ElementType.STEAM) {
      swapCells(idx, belowIdx); // Lava sinks through steam
      return;
    }
  }

  // Diagonals
  const diagLeftX = x - 1;
  const diagRightX = x + 1;
  const tryLeft = Math.random() < 0.5;

  if (belowY < HEIGHT) {
    if (tryLeft && diagLeftX >= 0) {
      const dlIdx = belowY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      }
    }
    if (diagRightX < WIDTH) {
      const drIdx = belowY * WIDTH + diagRightX;
      if (types[drIdx] === ElementType.EMPTY) {
        swapCells(idx, drIdx);
        return;
      }
    }
    if (!tryLeft && diagLeftX >= 0) {
      const dlIdx = belowY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      }
    }
  }

  // Viscous sideways spreading (only 25% chance per frame)
  if (Math.random() < 0.25) {
    const sideLeft = x - 1;
    const sideRight = x + 1;
    if (
      tryLeft &&
      sideLeft >= 0 &&
      types[y * WIDTH + sideLeft] === ElementType.EMPTY
    ) {
      swapCells(idx, y * WIDTH + sideLeft);
      return;
    }
    if (
      sideRight < WIDTH &&
      types[y * WIDTH + sideRight] === ElementType.EMPTY
    ) {
      swapCells(idx, y * WIDTH + sideRight);
      return;
    }
    if (
      !tryLeft &&
      sideLeft >= 0 &&
      types[y * WIDTH + sideLeft] === ElementType.EMPTY
    ) {
      swapCells(idx, y * WIDTH + sideLeft);
      return;
    }
  }
}

// Physics details for Steam
function handleSteam(x: number, y: number, idx: number) {
  // Steam rises (gravity is reversed)
  const aboveY = y - 1;

  // Decrement lifetime
  const l = (life[idx] ?? 0) - 0.5;
  life[idx] = l;
  if (l <= 0) {
    types[idx] = ElementType.EMPTY;
    setElementColor(idx, ElementType.EMPTY);
    return;
  }

  // 1. Check condensation against Stone
  const checkCondensation =
    aboveY >= 0 && types[aboveY * WIDTH + x] === ElementType.STONE;
  if (checkCondensation && Math.random() < 0.015) {
    // Condense steam back to water
    types[idx] = ElementType.WATER;
    setElementColor(idx, ElementType.WATER);
    life[idx] = 0;
    return;
  }

  // 2. Rise up
  if (aboveY >= 0) {
    const aboveIdx = aboveY * WIDTH + x;
    const aboveType = types[aboveIdx];

    if (aboveType === ElementType.EMPTY) {
      swapCells(idx, aboveIdx);
      return;
    } else if (
      aboveType === ElementType.WATER ||
      aboveType === ElementType.LAVA
    ) {
      // Steam rises through fluids (buoyancy)
      swapCells(idx, aboveIdx);
      return;
    }
  }

  // 3. Move diagonally up
  const diagLeftX = x - 1;
  const diagRightX = x + 1;
  const tryLeft = Math.random() < 0.5;

  if (aboveY >= 0) {
    if (tryLeft && diagLeftX >= 0) {
      const dlIdx = aboveY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      }
    }
    if (diagRightX < WIDTH) {
      const drIdx = aboveY * WIDTH + diagRightX;
      if (types[drIdx] === ElementType.EMPTY) {
        swapCells(idx, drIdx);
        return;
      }
    }
    if (!tryLeft && diagLeftX >= 0) {
      const dlIdx = aboveY * WIDTH + diagLeftX;
      if (types[dlIdx] === ElementType.EMPTY) {
        swapCells(idx, dlIdx);
        return;
      }
    }
  }

  // 4. Move horizontally (diffusion)
  const sideLeft = x - 1;
  const sideRight = x + 1;
  if (
    tryLeft &&
    sideLeft >= 0 &&
    types[y * WIDTH + sideLeft] === ElementType.EMPTY
  ) {
    swapCells(idx, y * WIDTH + sideLeft);
    return;
  }
  if (sideRight < WIDTH && types[y * WIDTH + sideRight] === ElementType.EMPTY) {
    swapCells(idx, y * WIDTH + sideRight);
    return;
  }
  if (
    !tryLeft &&
    sideLeft >= 0 &&
    types[y * WIDTH + sideLeft] === ElementType.EMPTY
  ) {
    swapCells(idx, y * WIDTH + sideLeft);
    return;
  }
}

// Compute 2D bioluminescent light propagation
function updateLighting() {
  // 1. Calculate downscaled opacities
  for (let ly = 0; ly < LIGHT_H; ly++) {
    for (let lx = 0; lx < LIGHT_W; lx++) {
      const lIdx = ly * LIGHT_W + lx;

      // Map to 2x2 cells in physics grid
      const px1 = lx * 2;
      const py1 = ly * 2;

      let sumOpacity = 0.0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const gx = px1 + dx;
          const gy = py1 + dy;
          if (gx < WIDTH && gy < HEIGHT) {
            const gType = types[gy * WIDTH + gx];
            switch (gType) {
              case ElementType.STONE:
                sumOpacity += 0.96;
                break;
              case ElementType.SAND:
                sumOpacity += 0.65;
                break;
              case ElementType.LAVA:
                sumOpacity += 0.4;
                break;
              case ElementType.MOSS:
                sumOpacity += 0.35;
                break;
              case ElementType.WATER:
                sumOpacity += 0.12;
                break;
              case ElementType.STEAM:
                sumOpacity += 0.05;
                break;
              default:
                sumOpacity += 0.0;
                break;
            }
          }
        }
      }
      lightOpacity[lIdx] = sumOpacity / 4;
    }
  }

  // Base ambient cave light (slate blue-grey) - stronger by default and scaled by slider
  const baseR = 60 * lightIntensityVal;
  const baseG = 70 * lightIntensityVal;
  const baseB = 90 * lightIntensityVal;

  lightR.fill(baseR);
  lightG.fill(baseG);
  lightB.fill(baseB);

  // Sunlight from top
  if (toggleSunlight) {
    const sunIntensity = 200 * lightIntensityVal;
    for (let lx = 0; lx < LIGHT_W; lx++) {
      lightR[lx] = Math.max(lightR[lx] ?? 0, sunIntensity);
      lightG[lx] = Math.max(lightG[lx] ?? 0, sunIntensity * 0.95);
      lightB[lx] = Math.max(lightB[lx] ?? 0, sunIntensity * 0.9);
    }
  }

  // Light emission from Lava & Moss elements
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = y * WIDTH + x;
      const type = types[idx];

      if (type === ElementType.LAVA) {
        const lx = Math.floor(x / 2);
        const ly = Math.floor(y / 2);
        if (lx < LIGHT_W && ly < LIGHT_H) {
          const lIdx = ly * LIGHT_W + lx;
          // Glowing bright orange
          lightR[lIdx] = Math.max(lightR[lIdx] ?? 0, 255 * lightIntensityVal);
          lightG[lIdx] = Math.max(lightG[lIdx] ?? 0, 115 * lightIntensityVal);
          lightB[lIdx] = Math.max(lightB[lIdx] ?? 0, 15 * lightIntensityVal);
        }
      } else if (type === ElementType.MOSS) {
        const lx = Math.floor(x / 2);
        const ly = Math.floor(y / 2);
        if (lx < LIGHT_W && ly < LIGHT_H) {
          const lIdx = ly * LIGHT_W + lx;
          // Soft bioluminescent green
          lightR[lIdx] = Math.max(lightR[lIdx] ?? 0, 30 * lightIntensityVal);
          lightG[lIdx] = Math.max(lightG[lIdx] ?? 0, 225 * lightIntensityVal);
          lightB[lIdx] = Math.max(lightB[lIdx] ?? 0, 65 * lightIntensityVal);
        }
      }
    }
  }

  // Flashlight light
  if (
    toggleFlashlight &&
    mouseX >= 0 &&
    mouseX < CANVAS_WIDTH &&
    mouseY >= 0 &&
    mouseY < CANVAS_HEIGHT
  ) {
    const mlx = Math.floor(mouseX / LIGHT_CELL_SIZE);
    const mly = Math.floor(mouseY / LIGHT_CELL_SIZE);
    const radius = 12; // Radius in lightmap pixels
    const maxLight = 255 * lightIntensityVal;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const lx = mlx + dx;
        const ly = mly + dy;

        if (lx >= 0 && lx < LIGHT_W && ly >= 0 && ly < LIGHT_H) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < radius) {
            const falloff = 1 - dist / radius;
            const intensity = maxLight * falloff * falloff;
            const lIdx = ly * LIGHT_W + lx;

            lightR[lIdx] = Math.max(lightR[lIdx] ?? 0, intensity);
            lightG[lIdx] = Math.max(lightG[lIdx] ?? 0, intensity);
            lightB[lIdx] = Math.max(lightB[lIdx] ?? 0, intensity);
          }
        }
      }
    }
  }

  // 3. Double-sweep DP Light Propagation
  const decay = 0.94; // Light travel reach

  // Sweep 1: Top-Left to Bottom-Right
  for (let ly = 0; ly < LIGHT_H; ly++) {
    for (let lx = 0; lx < LIGHT_W; lx++) {
      const i = ly * LIGHT_W + lx;
      const op = lightOpacity[i] ?? 0;
      const att = (1 - op) * decay;

      if (lx > 0) {
        const left = i - 1;
        lightR[i] = Math.max(lightR[i] ?? 0, (lightR[left] ?? 0) * att);
        lightG[i] = Math.max(lightG[i] ?? 0, (lightG[left] ?? 0) * att);
        lightB[i] = Math.max(lightB[i] ?? 0, (lightB[left] ?? 0) * att);
      }
      if (ly > 0) {
        const up = i - LIGHT_W;
        lightR[i] = Math.max(lightR[i] ?? 0, (lightR[up] ?? 0) * att);
        lightG[i] = Math.max(lightG[i] ?? 0, (lightG[up] ?? 0) * att);
        lightB[i] = Math.max(lightB[i] ?? 0, (lightB[up] ?? 0) * att);
      }
    }
  }

  // Sweep 2: Bottom-Right to Top-Left
  for (let ly = LIGHT_H - 1; ly >= 0; ly--) {
    for (let lx = LIGHT_W - 1; lx >= 0; lx--) {
      const i = ly * LIGHT_W + lx;
      const op = lightOpacity[i] ?? 0;
      const att = (1 - op) * decay;

      if (lx < LIGHT_W - 1) {
        const right = i + 1;
        lightR[i] = Math.max(lightR[i] ?? 0, (lightR[right] ?? 0) * att);
        lightG[i] = Math.max(lightG[i] ?? 0, (lightG[right] ?? 0) * att);
        lightB[i] = Math.max(lightB[i] ?? 0, (lightB[right] ?? 0) * att);
      }
      if (ly < LIGHT_H - 1) {
        const down = i + LIGHT_W;
        lightR[i] = Math.max(lightR[i] ?? 0, (lightR[down] ?? 0) * att);
        lightG[i] = Math.max(lightG[i] ?? 0, (lightG[down] ?? 0) * att);
        lightB[i] = Math.max(lightB[i] ?? 0, (lightB[down] ?? 0) * att);
      }
    }
  }
}

// Spawns particles based on mouse action
function drawBrush() {
  if (!isMouseDown) return;

  const canvasX = mouseX;
  const canvasY = mouseY;

  if (
    canvasX < 0 ||
    canvasX >= CANVAS_WIDTH ||
    canvasY < 0 ||
    canvasY >= CANVAS_HEIGHT
  ) {
    return;
  }

  const px = Math.floor(canvasX / CELL_SIZE);
  const py = Math.floor(canvasY / CELL_SIZE);

  const radius = brushSize;
  const isErase = currentTool === "erase";

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const targetX = px + dx;
      const targetY = py + dy;

      if (targetX >= 0 && targetX < WIDTH && targetY >= 0 && targetY < HEIGHT) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
          const idx = targetY * WIDTH + targetX;

          if (isErase) {
            setCell(targetX, targetY, ElementType.EMPTY);
          } else {
            // Check brush style (spray vs round solid)
            if (brushStyle === "spray") {
              // Only spawn elements with some density/probability
              if (Math.random() < 0.15) {
                // Do not overwrite stone unless we want to, but standard behaves like painting on empty/fluid space
                if (
                  types[idx] === ElementType.EMPTY ||
                  types[idx] === ElementType.WATER ||
                  types[idx] === ElementType.STEAM
                ) {
                  setCell(targetX, targetY, currentMaterial);
                }
              }
            } else {
              // Round solid brush
              // Don't overwrite stone with water/sand/steam to make modeling easy
              if (
                currentMaterial === ElementType.STONE ||
                types[idx] !== ElementType.STONE
              ) {
                setCell(targetX, targetY, currentMaterial);
              }
            }
          }
        }
      }
    }
  }
}

// Render the grid to the canvas
function render(
  ctx: CanvasRenderingContext2D,
  lightCtx: CanvasRenderingContext2D,
  lightCanvas: HTMLCanvasElement
) {
  const renderStart = performance.now();

  // Clear main canvas
  ctx.fillStyle = "#020617";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // 1. Update sub-pixel positions for active particles
  const lerpSpeed = 0.24;
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const type = types[i];
    if (type !== ElementType.EMPTY) {
      const gx = i % WIDTH;
      const gy = Math.floor(i / WIDTH);

      // Interpolate visual positions closer to grid coordinates
      const vx = visualX[i] ?? gx;
      const vy = visualY[i] ?? gy;
      visualX[i] = vx + (gx - vx) * lerpSpeed;
      visualY[i] = vy + (gy - vy) * lerpSpeed;

      // Snap if close enough
      if (Math.abs((visualX[i] ?? gx) - gx) < 0.005) visualX[i] = gx;
      if (Math.abs((visualY[i] ?? gy) - gy) < 0.005) visualY[i] = gy;
    }
  }

  // 2. Render particle types in optimized batches (draw single Path2D path per element type)
  const drawAO = renderMode === "normal" || renderMode === "ao-only";

  const elementTypesToDraw = [
    ElementType.STONE,
    ElementType.SAND,
    ElementType.WATER,
    ElementType.MOSS,
    ElementType.LAVA,
    ElementType.STEAM,
  ];

  for (const drawType of elementTypesToDraw) {
    // To allow texture variation and ambient occlusion, we can group cells by a quantized shade level!
    // This is a great performance trick: instead of individual fillRect per cell, we can bucket them
    // into 5 shade levels (e.g. 100%, 90%, 80%, 70%, 60% brightness) and render 5 paths!
    // This keeps the screen textured, gives AO depth, and executes in just 5 path operations per element type.
    const shadeBuckets: { r: number; g: number; b: number; cells: Point[] }[] =
      [];

    // We create buckets based on color variations
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = y * WIDTH + x;
        if (types[i] === drawType) {
          let r = colorsR[i] ?? 0;
          let g = colorsG[i] ?? 0;
          let b = colorsB[i] ?? 0;

          // Apply Ambient Occlusion (darken corners)
          if (drawAO) {
            let neighborCount = 0;
            // Scan 8-neighbors
            for (let ny = -1; ny <= 1; ny++) {
              for (let nx = -1; nx <= 1; nx++) {
                if (nx === 0 && ny === 0) continue;
                const gx = x + nx;
                const gy = y + ny;
                if (gx >= 0 && gx < WIDTH && gy >= 0 && gy < HEIGHT) {
                  if (types[gy * WIDTH + gx] !== ElementType.EMPTY) {
                    neighborCount++;
                  }
                }
              }
            }
            const aoFactor = 1.0 - (neighborCount / 8) * 0.28;
            r = Math.floor(r * aoFactor);
            g = Math.floor(g * aoFactor);
            b = Math.floor(b * aoFactor);
          }

          const vx = visualX[i] ?? x;
          const vy = visualY[i] ?? y;

          // Find matching bucket or create new one
          // Quantize values to steps of 15 to minimize buckets
          const qr = Math.round(r / 15) * 15;
          const qg = Math.round(g / 15) * 15;
          const qb = Math.round(b / 15) * 15;

          let bucket = shadeBuckets.find(
            (b) => b.r === qr && b.g === qg && b.b === qb
          );
          if (!bucket) {
            bucket = { r: qr, g: qg, b: qb, cells: [] };
            shadeBuckets.push(bucket);
          }
          bucket.cells.push({ x: vx, y: vy });
        }
      }
    }

    // Draw all cells in each color bucket
    for (const bucket of shadeBuckets) {
      ctx.beginPath();
      for (const pt of bucket.cells) {
        ctx.rect(pt.x * CELL_SIZE, pt.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }

      // Steam opacity is low, Water opacity is semi-transparent
      let alpha = 1.0;
      if (drawType === ElementType.STEAM) {
        alpha = 0.38;
      } else if (drawType === ElementType.WATER) {
        alpha = 0.72;
      }

      ctx.fillStyle = `rgba(${bucket.r}, ${bucket.g}, ${bucket.b}, ${alpha})`;
      ctx.fill();
    }
  }

  // 3. Render offscreen lightmap image data
  if (renderMode === "normal" || renderMode === "lighting-only") {
    // Generate ImageData from lightmap buffer
    const imgData = lightCtx.createImageData(LIGHT_W, LIGHT_H);
    for (let i = 0; i < LIGHT_W * LIGHT_H; i++) {
      const idx = i * 4;
      imgData.data[idx] = Math.min(255, Math.floor(lightR[i] ?? 0));
      imgData.data[idx + 1] = Math.min(255, Math.floor(lightG[i] ?? 0));
      imgData.data[idx + 2] = Math.min(255, Math.floor(lightB[i] ?? 0));
      imgData.data[idx + 3] = 255; // Fully opaque lighting texture
    }
    lightCtx.putImageData(imgData, 0, 0);

    // Apply composite pass
    if (renderMode === "lighting-only") {
      // Draw lighting stretch directly
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(lightCanvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();
    } else {
      // Normal Lit mode: multiply lights with sand layout
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(lightCanvas, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.restore();

      // Emissive Add pass: Lava cores and Moss glow get drawn with screen/light composite to POP
      // Let's draw glowing overlay for emissive light sources so they shine through shadows
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath();

      let hasEmissive = false;
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const i = y * WIDTH + x;
          const type = types[i];
          if (type === ElementType.LAVA) {
            ctx.rect(
              (visualX[i] ?? x) * CELL_SIZE,
              (visualY[i] ?? y) * CELL_SIZE,
              CELL_SIZE,
              CELL_SIZE
            );
            hasEmissive = true;
          }
        }
      }
      if (hasEmissive) {
        ctx.fillStyle = "rgba(255, 60, 0, 0.4)";
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 4. Render brush preview outline around the mouse cursor
  if (
    mouseX >= 0 &&
    mouseX < CANVAS_WIDTH &&
    mouseY >= 0 &&
    mouseY < CANVAS_HEIGHT
  ) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, brushSize * CELL_SIZE, 0, Math.PI * 2);
    ctx.stroke();
  }

  renderMs = performance.now() - renderStart;
}

// Count active particles
function countParticles(): number {
  let count = 0;
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    if (types[i] !== ElementType.EMPTY) count++;
  }
  return count;
}

// World Presets Loading
function loadPreset(presetName: string) {
  initGrid();

  switch (presetName) {
    case "moss-cave":
      // Generate cavern with hanging arches and dripping water
      // Borders & Ceilings
      for (let x = 0; x < WIDTH; x++) {
        // Top stone ceiling
        const depth = 15 + Math.floor(Math.sin(x * 0.1) * 8);
        for (let y = 0; y < depth; y++) {
          setCell(x, y, ElementType.STONE);
          // Moss on bottom edge of ceiling
          if (y >= depth - 3) {
            setCell(x, y, ElementType.MOSS);
          }
        }

        // Ground stone floor
        const floorH = HEIGHT - (10 + Math.floor(Math.cos(x * 0.08) * 6));
        for (let y = floorH; y < HEIGHT; y++) {
          setCell(x, y, ElementType.STONE);
          if (y <= floorH + 2) {
            setCell(x, y, ElementType.MOSS);
          }
        }
      }

      // Hanging cave arches
      createStoneArch(35, 60, 20, 10);
      createStoneArch(100, 80, 25, 12);
      createStoneArch(160, 65, 18, 9);

      // Line arches with moss
      for (let i = 0; i < WIDTH * HEIGHT; i++) {
        if (types[i] === ElementType.STONE) {
          // If adjacent to empty, paint with moss
          const x = i % WIDTH;
          const y = Math.floor(i / WIDTH);
          let nextToEmpty = false;

          const dirs = [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
          ] as const;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
              if (types[ny * WIDTH + nx] === ElementType.EMPTY) {
                nextToEmpty = true;
                break;
              }
            }
          }
          if (nextToEmpty && Math.random() < 0.4) {
            types[i] = ElementType.MOSS;
            setElementColor(i, ElementType.MOSS);
          }
        }
      }

      // Dripping water sources in the ceiling
      for (let x = 20; x < WIDTH; x += 30) {
        setCell(x, 15, ElementType.WATER);
        setCell(x + 1, 15, ElementType.WATER);
      }

      // Add a small pool of water in the middle
      for (let x = 85; x < 115; x++) {
        for (let y = HEIGHT - 30; y < HEIGHT - 15; y++) {
          if (
            types[y * WIDTH + x] === ElementType.EMPTY ||
            types[y * WIDTH + x] === ElementType.MOSS
          ) {
            setCell(x, y, ElementType.WATER);
          }
        }
      }

      // Sprout some initial steam puffs
      for (let x = 90; x < 110; x += 3) {
        setCell(x, HEIGHT - 35, ElementType.STEAM);
      }
      break;

    case "water-cycle":
      // Stone chamber with water at the bottom, lava boiling below it, stone arches above
      // Outer border box
      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          if (x < 6 || x >= WIDTH - 6 || y < 6 || y >= HEIGHT - 6) {
            setCell(x, y, ElementType.STONE);
          }
        }
      }

      // Bottom thick lava basin
      for (let y = HEIGHT - 20; y < HEIGHT - 6; y++) {
        for (let x = 6; x < WIDTH - 6; x++) {
          setCell(x, y, ElementType.LAVA);
        }
      }

      // A thin stone barrier above lava (will break or serve as shelf)
      for (let x = 6; x < WIDTH - 6; x++) {
        setCell(x, HEIGHT - 21, ElementType.STONE);
        setCell(x, HEIGHT - 22, ElementType.STONE);
      }

      // Put a hole in the stone barrier so lava touches water directly in the center
      for (let x = 85; x < 115; x++) {
        setCell(x, HEIGHT - 21, ElementType.EMPTY);
        setCell(x, HEIGHT - 22, ElementType.EMPTY);
      }

      // Filled with water above the barrier
      for (let y = HEIGHT - 45; y < HEIGHT - 22; y++) {
        for (let x = 12; x < WIDTH - 12; x++) {
          setCell(x, y, ElementType.WATER);
        }
      }

      // Add stalactites (hanging stone points) from the ceiling for steam condensation
      for (let x = 20; x < WIDTH - 20; x += 15) {
        const hLength = 12 + Math.floor(Math.random() * 12);
        for (let y = 6; y < 6 + hLength; y++) {
          setCell(x, y, ElementType.STONE);
          setCell(x - 1, y - 2, ElementType.STONE);
          setCell(x + 1, y - 2, ElementType.STONE);
        }
      }
      break;

    case "lava-fissure":
      // High volcanic cone dripping lava, slowly melting suspended stone arches
      // Left and right volcano walls
      for (let y = 40; y < HEIGHT; y++) {
        const leftLimit = Math.floor((y - 40) * 1.0);
        const rightLimit = WIDTH - Math.floor((y - 40) * 1.0);

        for (let x = 0; x < leftLimit; x++) {
          setCell(x, y, ElementType.STONE);
        }
        for (let x = rightLimit; x < WIDTH; x++) {
          setCell(x, y, ElementType.STONE);
        }
      }

      // Suspended stone arches inside the rift
      createStoneArch(60, 75, 15, 8);
      createStoneArch(100, 95, 20, 10);
      createStoneArch(140, 75, 15, 8);

      // Put some moss details on outer edges
      for (let x = 0; x < 40; x++) {
        setCell(x, HEIGHT - 12, ElementType.MOSS);
      }
      for (let x = WIDTH - 40; x < WIDTH; x++) {
        setCell(x, HEIGHT - 12, ElementType.MOSS);
      }

      // Lava emitters at the top
      for (let y = 15; y < 35; y++) {
        for (let x = 90; x < 110; x++) {
          // Concentrated volcanic core
          if (Math.sqrt((x - 100) * (x - 100) + (y - 25) * (y - 25)) < 8) {
            setCell(x, y, ElementType.LAVA);
          }
        }
      }

      // Sprinkle water drips from the sides to create reaction Steam + Obsidian arches
      for (let y = 10; y < 20; y++) {
        setCell(15, y, ElementType.WATER);
        setCell(WIDTH - 15, y, ElementType.WATER);
      }

      // Add sand deposits on side ledges
      for (let y = 30; y < 38; y++) {
        for (let x = 5; x < 25; x++) {
          setCell(x, y, ElementType.SAND);
        }
        for (let x = WIDTH - 25; x < WIDTH - 5; x++) {
          setCell(x, y, ElementType.SAND);
        }
      }
      break;

    case "stone-collapse":
      // Stacked stone arches holding heavy sand and water
      // Bottom floor
      for (let x = 0; x < WIDTH; x++) {
        setCell(x, HEIGHT - 5, ElementType.STONE);
      }

      // Multiple floating horizontal bars / arches of unsupported stone
      // These will immediately fall if not supported!
      // To show chunk physics, we create a few suspended stone blocks.

      // Left floating box
      createStoneBlock(15, 40, 30, 8);
      // Fill it with sand
      for (let y = 25; y < 40; y++) {
        for (let x = 18; x < 42; x++) {
          setCell(x, y, ElementType.SAND);
        }
      }

      // Right floating box
      createStoneBlock(155, 40, 30, 8);
      // Fill it with water
      for (let y = 22; y < 40; y++) {
        for (let x = 158; x < 182; x++) {
          setCell(x, y, ElementType.WATER);
        }
      }

      // A massive central arch, supported at the sides, but with a weak joint in the middle
      createStoneArch(100, 110, 45, 12);

      // Place heavy stone block directly on top of the weak central arch
      createStoneBlock(85, 60, 30, 15);

      // Sand load on top of the central block
      for (let y = 35; y < 60; y++) {
        for (let x = 90; x < 110; x++) {
          setCell(x, y, ElementType.SAND);
        }
      }

      // A tiny lava source at the top, just to trigger steam explosions and heat
      setCell(100, 10, ElementType.LAVA);
      setCell(101, 10, ElementType.LAVA);
      break;
  }
}

// Helpers for preset structures
function createStoneArch(
  centerX: number,
  centerY: number,
  radius: number,
  thickness: number
) {
  for (let y = centerY - radius; y < centerY + thickness; y++) {
    for (
      let x = centerX - radius - thickness;
      x < centerX + radius + thickness;
      x++
    ) {
      const dist = Math.sqrt(
        (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY)
      );
      if (dist >= radius && dist < radius + thickness && y <= centerY) {
        setCell(x, y, ElementType.STONE);
      }
    }
  }
}

function createStoneBlock(
  startX: number,
  startY: number,
  w: number,
  h: number
) {
  for (let y = startY; y < startY + h; y++) {
    for (let x = startX; x < startX + w; x++) {
      setCell(x, y, ElementType.STONE);
    }
  }
}

// App Startup and Setup
window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  // Offscreen light canvas
  const lightCanvas = document.createElement("canvas");
  lightCanvas.width = LIGHT_W;
  lightCanvas.height = LIGHT_H;
  const lightCtx = lightCanvas.getContext("2d")!;

  initGrid();

  // Default Preset on load
  loadPreset("moss-cave");

  // DOM Handles
  const hudFps = document.getElementById("hud-fps")!;
  const hudParticles = document.getElementById("hud-particles")!;
  const hudPhysicsMs = document.getElementById("hud-physics-ms")!;
  const hudRenderMs = document.getElementById("hud-render-ms")!;

  const btnPlayPause = document.getElementById("btn-play-pause")!;
  const iconPlay = document.getElementById("icon-play")!;
  const iconPause = document.getElementById("icon-pause")!;
  const btnStep = document.getElementById("btn-step")!;
  const btnClear = document.getElementById("btn-clear")!;

  const valBrushSize = document.getElementById("val-brush-size")!;
  const sliderBrushSize = document.getElementById(
    "slider-brush-size"
  ) as HTMLInputElement;

  const brushRound = document.getElementById("brush-round")!;
  const brushSpray = document.getElementById("brush-spray")!;

  const valGravity = document.getElementById("val-gravity")!;
  const sliderGravity = document.getElementById(
    "slider-gravity"
  ) as HTMLInputElement;

  const valMossGrowth = document.getElementById("val-moss-growth")!;
  const sliderMossGrowth = document.getElementById(
    "slider-moss-growth"
  ) as HTMLInputElement;

  const toggleFlashlightInput = document.getElementById(
    "toggle-flashlight"
  ) as HTMLInputElement;
  const toggleSunlightInput = document.getElementById(
    "toggle-sunlight"
  ) as HTMLInputElement;

  const valLightIntensity = document.getElementById("val-light-intensity")!;
  const sliderLightIntensity = document.getElementById(
    "slider-light-intensity"
  ) as HTMLInputElement;
  const selectRenderMode = document.getElementById(
    "select-render-mode"
  ) as HTMLSelectElement;

  const materialsGrid = document.getElementById("materials-grid")!;
  const presetButtons = document.querySelectorAll(".btn-preset");

  const tooltip = document.getElementById("tooltip")!;
  const tooltipTitle = document.getElementById("tooltip-title")!;
  const tooltipDesc = document.getElementById("tooltip-desc")!;

  // Materials Tooltip Descriptions
  const materialDescriptions: Record<string, { title: string; desc: string }> =
    {
      sand: {
        title: "Sand",
        desc: "Granular powder that falls straight down and slides sideways to stack into piles. Sinks in water and melts into lava.",
      },
      water: {
        title: "Water",
        desc: "Transparent low-viscosity fluid. Rushes downwards, rolls over edges, and fills up empty hollows. Evaporates on lava contact.",
      },
      stone: {
        title: "Stone",
        desc: "Immobile solid rock structures. If completely unsupported, the entire connected chunk collapses as a rigid body.",
      },
      moss: {
        title: "Moss",
        desc: "Bioluminescent green moss. Spreads slowly along solid surfaces and expands aggressively if fed with water. Burns easily.",
      },
      lava: {
        title: "Lava",
        desc: "Blazing hot, highly viscous fluid. Melts sand and stone slowly, ignites moss, and instantly converts water to steam.",
      },
      steam: {
        title: "Steam",
        desc: "Fading, buoyant gas that rises upwards. Sinks through water, slowly diffuses, and condenses to water when blocking stone.",
      },
    };

  // Setup Element Button clicks
  materialsGrid.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".btn-material");
    if (!btn) return;

    // Deactivate others
    materialsGrid
      .querySelectorAll(".btn-material")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const matName = btn.getAttribute("data-material")!;
    currentTool = "draw";
    document.getElementById("tool-draw")!.classList.add("active");
    document.getElementById("tool-erase")!.classList.remove("active");

    switch (matName) {
      case "sand":
        currentMaterial = ElementType.SAND;
        break;
      case "water":
        currentMaterial = ElementType.WATER;
        break;
      case "stone":
        currentMaterial = ElementType.STONE;
        break;
      case "moss":
        currentMaterial = ElementType.MOSS;
        break;
      case "lava":
        currentMaterial = ElementType.LAVA;
        break;
      case "steam":
        currentMaterial = ElementType.STEAM;
        break;
    }
  });

  // Setup Material Button Tooltips
  materialsGrid.querySelectorAll(".btn-material").forEach((btn) => {
    btn.addEventListener("mouseenter", () => {
      const mat = btn.getAttribute("data-material")!;
      const info = materialDescriptions[mat];
      if (!info) return;

      tooltipTitle.textContent = info.title;
      tooltipDesc.textContent = info.desc;
      tooltip.style.display = "block";

      const rect = btn.getBoundingClientRect();
      tooltip.style.left = `${rect.right + 12}px`;
      tooltip.style.top = `${rect.top}px`;
    });

    btn.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });
  });

  // Tools Selection
  document.getElementById("tool-draw")!.addEventListener("click", () => {
    currentTool = "draw";
    document.getElementById("tool-draw")!.classList.add("active");
    document.getElementById("tool-erase")!.classList.remove("active");
  });

  document.getElementById("tool-erase")!.addEventListener("click", () => {
    currentTool = "erase";
    document.getElementById("tool-erase")!.classList.add("active");
    document.getElementById("tool-draw")!.classList.remove("active");
  });

  // Preset Button clicks
  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.getAttribute("data-preset")!;
      loadPreset(preset);
    });
  });

  // Floating Controller Hooks
  btnPlayPause.addEventListener("click", () => {
    isPaused = !isPaused;
    if (isPaused) {
      btnPlayPause.classList.remove("active");
      iconPause.style.display = "none";
      iconPlay.style.display = "block";
    } else {
      btnPlayPause.classList.add("active");
      iconPlay.style.display = "none";
      iconPause.style.display = "block";
    }
  });

  btnStep.addEventListener("click", () => {
    updatePhysics();
  });

  btnClear.addEventListener("click", () => {
    initGrid();
  });

  // Speeds setup
  const speedButtons = [
    { id: "btn-speed-1x", val: 1 },
    { id: "btn-speed-2x", val: 2 },
    { id: "btn-speed-4x", val: 4 },
  ];

  speedButtons.forEach((sb) => {
    const el = document.getElementById(sb.id)!;
    el.addEventListener("click", () => {
      speedButtons.forEach((x) =>
        document.getElementById(x.id)!.classList.remove("active")
      );
      el.classList.add("active");
      simSpeed = sb.val;
    });
  });

  // Sliders setup
  sliderBrushSize.addEventListener("input", () => {
    brushSize = parseInt(sliderBrushSize.value);
    valBrushSize.textContent = brushSize.toString();
  });

  brushRound.addEventListener("click", () => {
    brushStyle = "round";
    brushRound.classList.add("active");
    brushSpray.classList.remove("active");
  });

  brushSpray.addEventListener("click", () => {
    brushStyle = "spray";
    brushSpray.classList.add("active");
    brushRound.classList.remove("active");
  });

  sliderGravity.addEventListener("input", () => {
    gravityForce = parseFloat(sliderGravity.value);
    valGravity.textContent = gravityForce.toFixed(1);
  });

  sliderMossGrowth.addEventListener("input", () => {
    const val = parseInt(sliderMossGrowth.value);
    mossGrowthRate = val / 100;
    valMossGrowth.textContent = `${val}%`;
  });

  toggleFlashlightInput.addEventListener("change", () => {
    toggleFlashlight = toggleFlashlightInput.checked;
  });

  toggleSunlightInput.addEventListener("change", () => {
    toggleSunlight = toggleSunlightInput.checked;
  });

  sliderLightIntensity.addEventListener("input", () => {
    lightIntensityVal = parseFloat(sliderLightIntensity.value);
    valLightIntensity.textContent = lightIntensityVal.toFixed(1);
  });

  selectRenderMode.addEventListener("change", () => {
    renderMode = selectRenderMode.value;
  });

  // Canvas Mouse events
  function updateMouseCoordinates(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    // Interpolate screen pixels back to the canvas internal resolution coordinates (800x600)
    mouseX = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    mouseY = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
  }

  canvas.addEventListener("mousedown", (e) => {
    isMouseDown = true;
    updateMouseCoordinates(e);
    drawBrush();
  });

  canvas.addEventListener("mousemove", (e) => {
    updateMouseCoordinates(e);
    if (isMouseDown) {
      drawBrush();
    }
  });

  window.addEventListener("mouseup", () => {
    isMouseDown = false;
  });

  canvas.addEventListener("mouseleave", () => {
    mouseX = -1000;
    mouseY = -1000;
  });

  // Keyboards Shortcuts
  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === " ") {
      btnPlayPause.click();
      e.preventDefault();
    } else if (key === "s") {
      btnStep.click();
    } else if (key === "c") {
      btnClear.click();
    } else if (key >= "1" && key <= "6") {
      // Direct keyboard selection of materials
      const btns = materialsGrid.querySelectorAll(".btn-material");
      const num = parseInt(key) - 1;
      if (num < btns.length) {
        (btns[num] as HTMLElement).click();
      }
    }
  });

  // Simulation Game Loop (Physics updates + Visual Render updates)
  function loop() {
    // 1. Run physics steps if unpaused
    let physTime = 0.0;
    if (!isPaused) {
      const physStart = performance.now();
      // Tick multiple times for simSpeed multipliers
      for (let s = 0; s < simSpeed; s++) {
        updatePhysics();
      }
      physTime = performance.now() - physStart;
    }

    // 2. Compute soft light propagation
    updateLighting();

    // 3. Render grid and lights
    render(ctx, lightCtx, lightCanvas);

    // 4. Update Performance metrics HUD
    fpsCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      currentFps = Math.round((fpsCount * 1000) / (now - lastTime));
      fpsCount = 0;
      lastTime = now;

      hudFps.textContent = currentFps.toString();
      hudParticles.textContent = countParticles().toString();
      hudPhysicsMs.textContent = `${physTime.toFixed(1)}ms`;
      hudRenderMs.textContent = `${renderMs.toFixed(1)}ms`;
    }

    requestAnimationFrame(loop);
  }

  // Kick off frame loop
  requestAnimationFrame(loop);
});
