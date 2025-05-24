export class NoiseGenerator {
    constructor(seed = 0) {
        this.seed = seed;
        this.permutation = this.generatePermutation();
    }

    generatePermutation() {
        const p = [];
        for (let i = 0; i < 256; i++) {
            p[i] = i;
        }
        
        // Shuffle using seed
        let rng = this.seededRandom(this.seed);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        
        // Duplicate for overflow
        for (let i = 0; i < 256; i++) {
            p[256 + i] = p[i];
        }
        
        return p;
    }

    seededRandom(seed) {
        let state = seed;
        return function() {
            state = (state * 1103515245 + 12345) & 0x7fffffff;
            return state / 0x7fffffff;
        };
    }

    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
        return a + t * (b - a);
    }

    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    perlin3D(x, y, z) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        
        const A = this.permutation[X] + Y;
        const AA = this.permutation[A] + Z;
        const AB = this.permutation[A + 1] + Z;
        const B = this.permutation[X + 1] + Y;
        const BA = this.permutation[B] + Z;
        const BB = this.permutation[B + 1] + Z;
        
        return this.lerp(w,
            this.lerp(v,
                this.lerp(u,
                    this.grad(this.permutation[AA], x, y, z),
                    this.grad(this.permutation[BA], x - 1, y, z)
                ),
                this.lerp(u,
                    this.grad(this.permutation[AB], x, y - 1, z),
                    this.grad(this.permutation[BB], x - 1, y - 1, z)
                )
            ),
            this.lerp(v,
                this.lerp(u,
                    this.grad(this.permutation[AA + 1], x, y, z - 1),
                    this.grad(this.permutation[BA + 1], x - 1, y, z - 1)
                ),
                this.lerp(u,
                    this.grad(this.permutation[AB + 1], x, y - 1, z - 1),
                    this.grad(this.permutation[BB + 1], x - 1, y - 1, z - 1)
                )
            )
        );
    }

    fractalNoise3D(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += this.perlin3D(x * frequency, y * frequency, z * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return value / maxValue;
    }

    ridgedNoise(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            let n = Math.abs(this.perlin3D(x * frequency, y * frequency, z * frequency));
            n = 1 - n;
            n = n * n;
            value += n * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return value / maxValue;
    }

    billowNoise(x, y, z, octaves = 4, persistence = 0.5, lacunarity = 2) {
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += Math.abs(this.perlin3D(x * frequency, y * frequency, z * frequency)) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        
        return value / maxValue;
    }

    simplexNoise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;
        
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        
        let i1, j1;
        if (x0 > y0) {
            i1 = 1; j1 = 0;
        } else {
            i1 = 0; j1 = 1;
        }
        
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = this.permutation[ii + this.permutation[jj]] % 12;
        const gi1 = this.permutation[ii + i1 + this.permutation[jj + j1]] % 12;
        const gi2 = this.permutation[ii + 1 + this.permutation[jj + 1]] % 12;
        
        const grad3 = [
            [1,1,0], [-1,1,0], [1,-1,0], [-1,-1,0],
            [1,0,1], [-1,0,1], [1,0,-1], [-1,0,-1],
            [0,1,1], [0,-1,1], [0,1,-1], [0,-1,-1]
        ];
        
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        let n0 = 0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * (grad3[gi0][0] * x0 + grad3[gi0][1] * y0);
        }
        
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        let n1 = 0;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * (grad3[gi1][0] * x1 + grad3[gi1][1] * y1);
        }
        
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        let n2 = 0;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * (grad3[gi2][0] * x2 + grad3[gi2][1] * y2);
        }
        
        return 70 * (n0 + n1 + n2);
    }

    voronoiNoise(x, y, scale = 1) {
        const xi = Math.floor(x / scale);
        const yi = Math.floor(y / scale);
        
        let minDist = Infinity;
        let closestValue = 0;
        
        for (let xo = -1; xo <= 1; xo++) {
            for (let yo = -1; yo <= 1; yo++) {
                const cellX = xi + xo;
                const cellY = yi + yo;
                
                // Generate random point in cell
                const rng = this.seededRandom(cellX * 374761393 + cellY * 668265263 + this.seed);
                const pointX = cellX + rng();
                const pointY = cellY + rng();
                
                const dx = (x / scale) - pointX;
                const dy = (y / scale) - pointY;
                const dist = dx * dx + dy * dy;
                
                if (dist < minDist) {
                    minDist = dist;
                    closestValue = rng();
                }
            }
        }
        
        return closestValue;
    }

    warpedNoise(x, y, z, warpStrength = 0.1) {
        const warpX = this.perlin3D(x * 0.1, y * 0.1, z * 0.1) * warpStrength;
        const warpY = this.perlin3D(x * 0.1 + 100, y * 0.1 + 100, z * 0.1 + 100) * warpStrength;
        const warpZ = this.perlin3D(x * 0.1 + 200, y * 0.1 + 200, z * 0.1 + 200) * warpStrength;
        
        return this.fractalNoise3D(x + warpX, y + warpY, z + warpZ);
    }
}

