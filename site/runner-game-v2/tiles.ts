// Tile blueprints and connection socket types for Scribble Roll

export interface TileObjectBlueprint {
  type:
    | "crate"
    | "gate"
    | "button"
    | "trampoline"
    | "seesaw"
    | "chime"
    | "elevator"
    | "wedge"
    | "pendulum"
    | "domino"
    | "booster"
    | "gravity_pad";
  x: number; // relative to tile bottom-left
  y: number;
  w?: number;
  h?: number;
  id?: string;
  targetGateId?: string;
  force?: number;
  length?: number;
  speed?: number;
  range?: number;
}

export interface TileBlueprint {
  id: number;
  name: string;
  // Socket IDs for matching edges (0: Empty, 1: Low Floor, 2: Mid Floor, 3: High Floor, 4: Vertical Shaft)
  left_socket: number;
  right_socket: number;
  bottom_socket: number;
  top_socket: number;
  // Convex surfaces defining physical floor/walls. Each sub-array is flat [x0,y0, x1,y1, ...] in tile space (0 to 30)
  surfaces: number[][];
  // Dynamic objects in the tile
  objects: TileObjectBlueprint[];
}

export const TILE_SIZE = 30.0; // Each tile is 30x30 units in physics space

export const TILES: TileBlueprint[] = [
  // --- TILE 0: EMPTY SPACE (Buffer / Sky / Pit) ---
  {
    id: 0,
    name: "Empty Space",
    left_socket: 0,
    right_socket: 0,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [],
    objects: [],
  },

  // --- TILE 1: FLAT LOW ROAD ---
  {
    id: 1,
    name: "Flat Low",
    left_socket: 1,
    right_socket: 1,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 0, 30, 0, 30, 2, 0, 2], // Floor platform
    ],
    objects: [
      { type: "wedge", x: 9, y: 3.5, w: 3.5, h: 3.0 }, // Symmetrical dynamic ramp
      { type: "crate", x: 16, y: 3.5, w: 2.0, h: 2.0 },
      { type: "domino", x: 22, y: 4.0, w: 0.8, h: 4.0 }, // Domino to knock over!
      { type: "domino", x: 23, y: 4.0, w: 0.8, h: 4.0 },
    ],
  },

  // --- TILE 2: FLAT MID ROAD ---
  {
    id: 2,
    name: "Flat Mid",
    left_socket: 2,
    right_socket: 2,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [[0, 13, 30, 13, 30, 15, 0, 15]],
    objects: [
      { type: "chime", x: 15, y: 18.0 },
      // Swinging pendulum hammer blocks the center path!
      { type: "pendulum", x: 15, y: 25.0, length: 7.0, range: 7.0 },
      { type: "wedge", x: 8, y: 16.5, w: 3.0, h: 3.0 },
    ],
  },

  // --- TILE 3: FLAT HIGH ROAD ---
  {
    id: 3,
    name: "Flat High",
    left_socket: 3,
    right_socket: 3,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [[0, 25, 30, 25, 30, 27, 0, 27]],
    objects: [
      // Flip gravity UP on approach
      { type: "gravity_pad", x: 6, y: 26.2, w: 2.2, h: 0.4, force: 1.0 },
      { type: "chime", x: 15, y: 28.5 },
      // Flip gravity BACK DOWN before exit
      { type: "gravity_pad", x: 24, y: 26.2, w: 2.2, h: 0.4, force: -1.0 },
    ],
  },

  // --- TILE 4: SLOPE UP (LOW -> MID) ---
  {
    id: 4,
    name: "Slope Up Low-Mid",
    left_socket: 1,
    right_socket: 2,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 0, 30, 0, 30, 15, 0, 2], // Convex wedge
    ],
    objects: [],
  },

  // --- TILE 5: SLOPE DOWN (MID -> LOW) ---
  {
    id: 5,
    name: "Slope Down Mid-Low",
    left_socket: 2,
    right_socket: 1,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [[0, 0, 30, 0, 30, 2, 0, 15]],
    objects: [
      // Dynamic sliding slopes down the ramp
      { type: "wedge", x: 12, y: 11.0, w: 2.5, h: 2.5 },
      { type: "wedge", x: 19, y: 7.5, w: 2.5, h: 2.5 },
    ],
  },

  // --- TILE 6: SLOPE UP (MID -> HIGH) ---
  {
    id: 6,
    name: "Slope Up Mid-High",
    left_socket: 2,
    right_socket: 3,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [[0, 0, 30, 0, 30, 27, 0, 15]],
    objects: [{ type: "chime", x: 15, y: 23.0 }],
  },

  // --- TILE 7: SLOPE DOWN (HIGH -> MID) ---
  {
    id: 7,
    name: "Slope Down High-Mid",
    left_socket: 3,
    right_socket: 2,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [[0, 0, 30, 0, 30, 15, 0, 27]],
    objects: [
      { type: "crate", x: 15, y: 21.0, w: 2.0, h: 2.0 },
      { type: "wedge", x: 20, y: 17.5, w: 3.0, h: 3.0 },
    ],
  },

  // --- TILE 8: THE GAP (LOW) ---
  {
    id: 8,
    name: "The Gap Low",
    left_socket: 1,
    right_socket: 1,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 0, 8, 0, 8, 2, 0, 2], // Left ledge
      [22, 0, 30, 0, 30, 2, 22, 2], // Right ledge
    ],
    objects: [
      // Boost pad on left ledge flings player across the chasm!
      { type: "booster", x: 4, y: 2.2, w: 2.2, h: 0.4, force: 28.0 },
      { type: "chime", x: 15, y: 5.5 },
      // Domino blockade wall on the right landing ledge to crash through
      { type: "domino", x: 24, y: 4.0, w: 0.8, h: 4.0 },
      { type: "domino", x: 25, y: 4.0, w: 0.8, h: 4.0 },
    ],
  },

  // --- TILE 9: LAUNCHER STEP (LOW -> MID) ---
  {
    id: 9,
    name: "Launcher Step",
    left_socket: 1,
    right_socket: 2,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 0, 10, 0, 10, 2, 0, 2], // Low left platform
      [18, 0, 30, 0, 30, 15, 18, 15], // Mid right wall/platform
    ],
    objects: [
      // Trampoline spring board at X=14, Y=1 (launches player up to the step)
      {
        type: "trampoline",
        x: 14,
        y: 1.0,
        w: 3.5,
        h: 0.8,
        id: "spring_step_9",
        force: 21.0,
      },
      { type: "chime", x: 14, y: 9.0 },
    ],
  },

  // --- TILE 10: GATE AND BUTTON CHALLENGE (MID) ---
  {
    id: 10,
    name: "Gate & Button",
    left_socket: 2,
    right_socket: 2,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [[0, 13, 30, 13, 30, 15, 0, 15]],
    objects: [
      // Sliding gate in middle
      { type: "gate", x: 18, y: 17.5, w: 1.6, h: 5.0, id: "gate_10" },
      // Trigger button before it
      {
        type: "button",
        x: 8,
        y: 15.3,
        w: 1.6,
        h: 0.6,
        targetGateId: "gate_10",
      },
      // Checkpoint reward
      { type: "chime", x: 24, y: 17.0 },
      // Added wedge for high chime jumping bypass options
      { type: "wedge", x: 12, y: 16.5, w: 2.5, h: 2.5 },
      { type: "chime", x: 12, y: 21.0 },
    ],
  },

  // --- TILE 11: SPEED LOOP (MID) ---
  {
    id: 11,
    name: "Speed Loop",
    left_socket: 2,
    right_socket: 2,
    bottom_socket: 0,
    top_socket: 0,
    // Outer loop approximated with static blocks
    surfaces: [
      [0, 13, 30, 13, 30, 15, 0, 15], // Base Floor

      // Arc segments of the loop (centered X=15, Y=21, Radius=6)
      [9.0, 15.0, 11.5, 15.0, 11.5, 16.0, 9.0, 16.0], // bottom left wedge
      [7.5, 16.0, 9.5, 18.5, 8.5, 19.5, 6.5, 17.0], // mid-low left wedge
      [6.5, 19.5, 8.5, 20.5, 8.5, 22.5, 6.5, 22.5], // mid-high left wedge
      [7.5, 23.5, 6.5, 25.0, 8.5, 26.5, 9.5, 25.0], // top left wedge
      [11.5, 26.5, 11.5, 27.5, 18.5, 27.5, 18.5, 26.5], // top center ceiling
      [20.5, 25.0, 21.5, 26.5, 23.5, 25.0, 22.5, 23.5], // top right wedge
      [23.5, 22.5, 21.5, 22.5, 21.5, 20.5, 23.5, 19.5], // mid-high right wedge
      [23.5, 17.0, 21.5, 19.5, 20.5, 18.5, 22.5, 16.0], // mid-low right wedge
      [18.5, 16.0, 21.0, 16.0, 21.0, 15.0, 18.5, 15.0], // bottom right wedge
    ],
    objects: [
      { type: "chime", x: 15, y: 24.5 }, // Collectible inside the loop ceiling
    ],
  },

  // --- TILE 12: ELEVATOR SHAFT (MID -> HIGH) ---
  {
    id: 12,
    name: "Elevator Shaft",
    left_socket: 2,
    right_socket: 3,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 13, 6, 13, 6, 15, 0, 15], // Mid left ledge
      [24, 25, 30, 25, 30, 27, 24, 27], // High right ledge
    ],
    objects: [
      // Elevator lift moving between Y=10 and Y=28
      { type: "elevator", x: 15, y: 14.5, w: 5.5, speed: 2.0, range: 7.0 },
      { type: "chime", x: 15, y: 22.0 },
    ],
  },

  // --- TILE 13: SEESAW BRIDGE (LOW) ---
  {
    id: 13,
    name: "Seesaw Bridge",
    left_socket: 1,
    right_socket: 1,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 0, 5, 0, 5, 2, 0, 2], // Left platform edge
      [25, 0, 30, 0, 30, 2, 25, 2], // Right platform edge
    ],
    objects: [
      // Seesaw centered at X=15, Y=2.2 (resting on joint)
      { type: "seesaw", x: 15, y: 2.2, length: 18.0 },
    ],
  },

  // --- TILE 14: DROP CHUTE (HIGH -> LOW) ---
  {
    id: 14,
    name: "Drop Chute",
    left_socket: 3,
    right_socket: 1,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 25, 10, 25, 10, 27, 0, 27], // High left platform
      [20, 0, 30, 0, 30, 2, 20, 2], // Low right platform
    ],
    objects: [
      // Bouncy cushion at bottom to rebound the marble drop
      {
        type: "trampoline",
        x: 15,
        y: 1.0,
        w: 6.0,
        h: 1.0,
        id: "spring_chute_14",
        force: 24.0,
      },
      { type: "chime", x: 15, y: 12.0 },
    ],
  },

  // --- TILE 15: S-CURVE SMOOTH SLIDE ---
  {
    id: 15,
    name: "S-Curve Slide",
    left_socket: 3,
    right_socket: 1,
    bottom_socket: 0,
    top_socket: 0,
    surfaces: [
      [0, 25, 9, 18, 9, 16, 0, 25], // High-mid slope
      [9, 18, 19, 9, 19, 7, 9, 16], // Mid-low slope
      [19, 9, 30, 2, 30, 0, 19, 7], // Low slope ending
    ],
    objects: [
      { type: "chime", x: 14, y: 16.0 },
      { type: "chime", x: 23, y: 8.0 },
    ],
  },
];

// Returns a list of compatible tile indexes that can sit to the right of the given tile ID
export function getCompatibleRightTiles(leftTileId: number): number[] {
  const leftTile = TILES[leftTileId];
  if (!leftTile) return [];
  return TILES.filter(
    (t) => t.left_socket === leftTile.right_socket && t.id !== 0
  ).map((t) => t.id);
}

// Check if two tiles are compatible on vertical borders (for any top/bottom matching)
export function checkVerticalCompatibility(
  bottomTileId: number,
  topTileId: number
): boolean {
  const bottomTile = TILES[bottomTileId];
  const topTile = TILES[topTileId];
  if (!bottomTile || !topTile) return false;
  return bottomTile.top_socket === topTile.bottom_socket;
}
