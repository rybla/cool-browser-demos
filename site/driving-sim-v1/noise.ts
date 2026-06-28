/**
 * Seeded 2D Perlin Noise generator for deterministic terrain height generation.
 */
export class PerlinNoise {
  private p: Uint8Array = new Uint8Array(512);

  constructor(seed: number = 12345) {
    const permutation = Array.from({ length: 256 }, (_, i) => i);

    // Seeded pseudo-random generator (LCG)
    let s = seed;
    const random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    // Shuffle the permutation array deterministically
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = permutation[i]!;
      permutation[i] = permutation[j]!;
      permutation[j] = tmp;
    }

    // Duplicate the permutation array to avoid overflow checks
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255]!;
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    // Scale vectors to 8 directions (angles 0, 45, 90, 135, 180, 225, 270, 315)
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return (h & 1 ? -u : u) + (h & 2 ? -2.0 * v : 2.0 * v);
  }

  /**
   * Generates a noise value between -1.0 and 1.0.
   */
  public noise2D(x: number, y: number): number {
    // Find unit grid cell coordinates
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    // Relative coordinates of point in cell
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    // Compute fade curves
    const u = this.fade(xf);
    const v = this.fade(yf);

    // Hash coordinates of the 4 corners of the cell
    const aa = this.p[this.p[X]! + Y]!;
    const ab = this.p[this.p[X]! + Y + 1]!;
    const ba = this.p[this.p[X + 1]! + Y]!;
    const bb = this.p[this.p[X + 1]! + Y + 1]!;

    // Add blended gradients from each corner
    const val = this.lerp(
      v,
      this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf)),
      this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1))
    );

    // Standard Perlin 2D returns roughly in [-1, 1], scale slightly to fit better
    return Math.max(-1, Math.min(1, val * 0.7));
  }

  /**
   * Fractal Brownian Motion (FBM) combining multiple octaves of noise.
   */
  public fbm2D(
    x: number,
    y: number,
    octaves: number = 4,
    lacunarity: number = 2.0,
    gain: number = 0.5
  ): number {
    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }
}
