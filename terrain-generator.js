import { NoiseGenerator } from './noise.js';

export class TerrainGenerator {
    constructor(options = {}) {
        this.seed = options.seed || 12345;
        this.chunkSize = options.chunkSize || 32;
        this.worldHeight = options.worldHeight || 256;
        
        // Initialize multiple noise generators for different features
        this.heightNoise = new NoiseGenerator(this.seed);
        this.biomeNoise = new NoiseGenerator(this.seed + 1000);
        this.caveNoise = new NoiseGenerator(this.seed + 2000);
        this.oreNoise = new NoiseGenerator(this.seed + 3000);
        this.temperatureNoise = new NoiseGenerator(this.seed + 4000);
        this.humidityNoise = new NoiseGenerator(this.seed + 5000);
        this.mountainNoise = new NoiseGenerator(this.seed + 6000);
        this.riverNoise = new NoiseGenerator(this.seed + 7000);
        this.erosionNoise = new NoiseGenerator(this.seed + 8000);
        this.ridgeNoise = new NoiseGenerator(this.seed + 9000);
        this.plateauNoise = new NoiseGenerator(this.seed + 10000);
        this.warpNoise = new NoiseGenerator(this.seed + 11000);
        this.valleyNoise = new NoiseGenerator(this.seed + 12000);
        
        // Terrain generation parameters
        this.seaLevel = 64;
        this.maxHeight = 220;
        this.minHeight = 10;
        this.mountainHeight = 180;
        this.plateauHeight = 120;

        // Define biomes and blocks
        this.biomes = {
            OCEAN: { id: 0, name: 'Ocean', color: [0, 0, 0.8] },
            PLAINS: { id: 1, name: 'Plains', color: [0.3, 0.8, 0.3] },
            DESERT: { id: 2, name: 'Desert', color: [0.9, 0.8, 0.4] },
            FOREST: { id: 3, name: 'Forest', color: [0.2, 0.6, 0.2] },
            MOUNTAINS: { id: 4, name: 'Mountains', color: [0.6, 0.6, 0.6] },
            TAIGA: { id: 5, name: 'Taiga', color: [0.2, 0.5, 0.3] },
            SWAMP: { id: 6, name: 'Swamp', color: [0.4, 0.5, 0.3] },
            TUNDRA: { id: 7, name: 'Tundra', color: [0.7, 0.8, 0.9] }
        };

        this.blocks = {
            AIR: 0,
            STONE: 1,
            DIRT: 2,
            GRASS: 3,
            SAND: 4,
            WATER: 5,
            WOOD: 6,
            LEAVES: 7,
            COBBLESTONE: 8
        };
    }

    generateHeightMap(chunkX, chunkZ) {
        const heightMap = [];
        
        for (let x = 0; x < this.chunkSize; x++) {
            heightMap[x] = [];
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Domain warping for more natural terrain
                const warpStrength = 20.0;
                const warpX = this.warpNoise.fractalNoise3D(worldX * 0.003, 0, worldZ * 0.003, 2, 0.5, 2.0) * warpStrength;
                const warpZ = this.warpNoise.fractalNoise3D(worldX * 0.003 + 100, 0, worldZ * 0.003 + 100, 2, 0.5, 2.0) * warpStrength;
                
                const warpedX = worldX + warpX;
                const warpedZ = worldZ + warpZ;
                
                // Continental shelf - very large scale features
                const continental = this.heightNoise.fractalNoise3D(warpedX * 0.0008, 0, warpedZ * 0.0008, 2, 0.6, 2.5);
                
                // Base terrain height
                let height = this.heightNoise.fractalNoise3D(warpedX * 0.004, 0, warpedZ * 0.004, 4, 0.6, 2.2);
                
                // Mountain ridge generation using ridged noise
                const mountainMask = this.mountainNoise.fractalNoise3D(warpedX * 0.002, 400, warpedZ * 0.002, 3, 0.6, 2.0);
                if (mountainMask > 0.2) {
                    // Primary mountain ridges
                    const ridge1 = this.ridgeNoise.ridgedNoise(warpedX * 0.008, 500, warpedZ * 0.008, 4, 0.5, 2.3);
                    const ridge2 = this.ridgeNoise.ridgedNoise(warpedX * 0.012, 600, warpedZ * 0.012, 3, 0.4, 2.1);
                    
                    // Combine ridges with multiplication for sharp peaks
                    const combinedRidge = ridge1 * ridge2;
                    
                    // Mountain height based on mask strength
                    const mountainStrength = Math.pow(Math.max(0, mountainMask - 0.2), 1.5);
                    const mountainAddition = combinedRidge * mountainStrength * 2.5;
                    
                    height += mountainAddition;
                    
                    // Add secondary peaks and detail
                    const detailNoise = this.mountainNoise.fractalNoise3D(warpedX * 0.025, 700, warpedZ * 0.025, 3, 0.4, 2.0);
                    height += detailNoise * mountainStrength * 0.4;
                }
                
                // Plateau generation with mountain-like features
                const plateauMask = this.plateauNoise.fractalNoise3D(warpedX * 0.003, 800, warpedZ * 0.003, 2, 0.5, 2.0);
                if (plateauMask > 0.4 && mountainMask < 0.3) {
                    const plateauStrength = Math.pow(Math.max(0, plateauMask - 0.4), 2.0);
                    
                    // Base plateau height
                    const plateauHeight = this.plateauNoise.fractalNoise3D(warpedX * 0.01, 900, warpedZ * 0.01, 2, 0.3, 2.0);
                    
                    // Add mountain-like ridges on top of plateaus
                    const plateauRidge1 = this.ridgeNoise.ridgedNoise(warpedX * 0.015, 1300, warpedZ * 0.015, 3, 0.6, 2.2);
                    const plateauRidge2 = this.mountainNoise.ridgedNoise(warpedX * 0.02, 1400, warpedZ * 0.02, 2, 0.5, 2.0);
                    
                    // Create rocky peaks and spires
                    const rockFormations = this.ridgeNoise.fractalNoise3D(warpedX * 0.04, 1500, warpedZ * 0.04, 4, 0.4, 2.5);
                    const spires = Math.max(0, this.mountainNoise.ridgedNoise(warpedX * 0.08, 1600, warpedZ * 0.08, 2, 0.7, 2.0) - 0.3);
                    
                    // Surface roughness for rocky texture
                    const surfaceRoughness = this.erosionNoise.fractalNoise3D(warpedX * 0.1, 1700, warpedZ * 0.1, 3, 0.3, 2.0);
                    
                    // Combine all plateau features
                    const ridgeContribution = (plateauRidge1 * plateauRidge2) * plateauStrength * 0.8;
                    const rockContribution = Math.pow(Math.max(0, rockFormations), 1.5) * plateauStrength * 0.6;
                    const spireContribution = Math.pow(spires, 2.0) * plateauStrength * 1.2;
                    const roughnessContribution = surfaceRoughness * plateauStrength * 0.15;
                    
                    // Add stepped terrain effect for mesa-like appearance
                    const stepNoise = this.plateauNoise.fractalNoise3D(warpedX * 0.006, 1800, warpedZ * 0.006, 1, 1.0, 1.0);
                    const steps = Math.floor((stepNoise + 1) * 2) * 0.1 * plateauStrength;
                    
                    height += (plateauHeight * plateauStrength * 1.2) + ridgeContribution + rockContribution + spireContribution + roughnessContribution + steps;
                }
                
                // Valley carving using inverse ridged noise
                const valleyNoise1 = 1.0 - this.valleyNoise.ridgedNoise(warpedX * 0.006, 1000, warpedZ * 0.006, 2, 0.6, 2.0);
                const valleyNoise2 = 1.0 - this.valleyNoise.ridgedNoise(warpedX * 0.004, 1100, warpedZ * 0.004, 1, 1.0, 1.0);
                const valleyMask = valleyNoise1 * valleyNoise2;
                
                if (valleyMask < 0.3) {
                    const valleyDepth = (0.3 - valleyMask) * 2.0;
                    height -= valleyDepth;
                }
                
                // River valley generation - more pronounced
                const riverValue = Math.abs(this.riverNoise.fractalNoise3D(warpedX * 0.008, 600, warpedZ * 0.008, 2, 0.5, 2.0));
                if (riverValue < 0.08) {
                    const riverDepth = Math.pow((0.08 - riverValue) * 12.5, 1.5);
                    height -= riverDepth;
                }
                
                // Erosion simulation for more realistic terrain
                const erosionFactor = this.erosionNoise.fractalNoise3D(warpedX * 0.02, 1200, warpedZ * 0.02, 3, 0.5, 2.0);
                const slope = this.calculateSlope(warpedX, warpedZ);
                const erosionAmount = erosionFactor * slope * 0.2;
                height -= erosionAmount;
                
                // Regional variations with continental influence
                const regional = this.heightNoise.fractalNoise3D(warpedX * 0.015, 100, warpedZ * 0.015, 3, 0.5, 2.0);
                height += regional * 0.3 * (1.0 + continental * 0.5);
                
                // Fine surface details
                const detail = this.heightNoise.fractalNoise3D(warpedX * 0.08, 300, warpedZ * 0.08, 2, 0.3, 2.0);
                height += detail * 0.1;
                
                // Apply continental influence
                height += continental * 0.8;
                
                // Normalize and scale to world height
                height = Math.max(-1, Math.min(1.5, height));
                const finalHeight = this.seaLevel + height * (this.mountainHeight - this.seaLevel);
                
                heightMap[x][z] = Math.floor(Math.max(this.minHeight, Math.min(this.maxHeight, finalHeight)));
            }
        }
        
        return heightMap;
    }

    calculateSlope(x, z) {
        // Calculate approximate slope using nearby noise samples
        const sampleDistance = 1.0;
        const h1 = this.heightNoise.fractalNoise3D((x - sampleDistance) * 0.004, 0, z * 0.004, 4, 0.6, 2.2);
        const h2 = this.heightNoise.fractalNoise3D((x + sampleDistance) * 0.004, 0, z * 0.004, 4, 0.6, 2.2);
        const h3 = this.heightNoise.fractalNoise3D(x * 0.004, 0, (z - sampleDistance) * 0.004, 4, 0.6, 2.2);
        const h4 = this.heightNoise.fractalNoise3D(x * 0.004, 0, (z + sampleDistance) * 0.004, 4, 0.6, 2.2);
        
        const dx = (h2 - h1) / (2.0 * sampleDistance);
        const dz = (h4 - h3) / (2.0 * sampleDistance);
        
        return Math.sqrt(dx * dx + dz * dz);
    }

    generateChunk(chunk) {
        const { x: chunkX, z: chunkZ } = chunk;
        
        // Generate heightmap for this chunk
        const heightMap = this.generateHeightMap(chunkX, chunkZ);
        const biomeMap = this.generateBiomeMap(chunkX, chunkZ);
        const caveMap = this.generateCaveMap(chunkX, chunkZ);
        
        // Fill chunk with blocks
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                const height = heightMap[x][z];
                const biome = biomeMap[x][z];
                
                this.generateColumn(chunk, x, z, worldX, worldZ, height, biome, caveMap);
            }
        }
        
        // Add structures and features
        this.addStructures(chunk, chunkX, chunkZ, heightMap, biomeMap);
    }

    generateBiomeMap(chunkX, chunkZ) {
        const biomeMap = [];
        
        for (let x = 0; x < this.chunkSize; x++) {
            biomeMap[x] = [];
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                // Temperature and humidity maps
                const temperature = this.temperatureNoise.fractalNoise3D(worldX * 0.003, 0, worldZ * 0.003, 3, 0.5, 2.0);
                const humidity = this.humidityNoise.fractalNoise3D(worldX * 0.004, 100, worldZ * 0.004, 3, 0.5, 2.0);
                
                // Determine biome based on temperature and humidity
                let biome = this.biomes.PLAINS; // Default
                
                if (temperature < -0.3) {
                    if (humidity > 0.2) {
                        biome = this.biomes.TAIGA;
                    } else {
                        biome = this.biomes.TUNDRA;
                    }
                } else if (temperature > 0.4) {
                    if (humidity < -0.2) {
                        biome = this.biomes.DESERT;
                    } else if (humidity > 0.3) {
                        biome = this.biomes.SWAMP;
                    } else {
                        biome = this.biomes.PLAINS;
                    }
                } else {
                    if (humidity > 0.1) {
                        biome = this.biomes.FOREST;
                    } else {
                        biome = this.biomes.PLAINS;
                    }
                }
                
                // Mountain biome override
                const mountainMask = this.mountainNoise.fractalNoise3D(worldX * 0.003, 400, worldZ * 0.003, 3, 0.6, 2.0);
                if (mountainMask > 0.5) {
                    biome = this.biomes.MOUNTAINS;
                }
                
                biomeMap[x][z] = biome;
            }
        }
        
        return biomeMap;
    }

    generateCaveMap(chunkX, chunkZ) {
        const caveMap = [];
        
        for (let x = 0; x < this.chunkSize; x++) {
            caveMap[x] = [];
            for (let z = 0; z < this.chunkSize; z++) {
                caveMap[x][z] = [];
                
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                for (let y = 0; y < this.chunkSize; y++) {
                    // 3D cave noise with multiple frequencies
                    const cave1 = this.caveNoise.fractalNoise3D(worldX * 0.02, y * 0.02, worldZ * 0.02, 2, 0.5, 2.0);
                    const cave2 = this.caveNoise.fractalNoise3D(worldX * 0.05, y * 0.05, worldZ * 0.05, 1, 1.0, 1.0);
                    
                    // Combine cave noises
                    const caveValue = cave1 + cave2 * 0.3;
                    
                    // Determine if this is a cave
                    let isCave = false;
                    if (y < this.seaLevel - 10) { // Only generate caves below certain depth
                        if (caveValue > 0.1 && caveValue < 0.4) {
                            isCave = true;
                        }
                    }
                    
                    caveMap[x][z][y] = isCave;
                }
            }
        }
        
        return caveMap;
    }

    generateColumn(chunk, localX, localZ, worldX, worldZ, height, biome, caveMap) {
        for (let y = 0; y < this.chunkSize; y++) {
            const index = localX + localZ * this.chunkSize + y * this.chunkSize * this.chunkSize;
            
            // Check if this position is a cave
            const isCave = caveMap[localX][localZ][y];
            
            if (y > height) {
                // Above ground - air or water
                if (y <= this.seaLevel && biome === this.biomes.OCEAN) {
                    chunk.blocks[index] = this.blocks.WATER;
                } else {
                    chunk.blocks[index] = this.blocks.AIR;
                }
            } else if (isCave && y < height - 2) {
                // Cave system
                chunk.blocks[index] = this.blocks.AIR;
            } else {
                // Underground - generate terrain based on biome
                chunk.blocks[index] = this.getBlockForBiomeAndDepth(biome, height, y, worldX, worldZ);
            }
        }
    }

    getBlockForBiomeAndDepth(biome, surfaceHeight, currentY, worldX, worldZ) {
        const depthFromSurface = surfaceHeight - currentY;
        
        // Deep underground is always stone
        if (depthFromSurface > 5) {
            // Add ore generation
            const oreChance = this.oreNoise.fractalNoise3D(worldX * 0.1, currentY * 0.1, worldZ * 0.1, 1, 1, 1);
            if (oreChance > 0.8) {
                return this.blocks.COBBLESTONE; // Ore substitute
            }
            return this.blocks.STONE;
        }
        
        // Surface and near-surface blocks based on biome
        switch (biome) {
            case this.biomes.DESERT:
                if (depthFromSurface === 0) return this.blocks.SAND;
                if (depthFromSurface <= 3) return this.blocks.SAND;
                return this.blocks.STONE;
                
            case this.biomes.OCEAN:
                if (depthFromSurface === 0) return this.blocks.SAND;
                if (depthFromSurface <= 2) return this.blocks.SAND;
                return this.blocks.STONE;
                
            case this.biomes.MOUNTAINS:
                if (depthFromSurface === 0) return this.blocks.STONE;
                if (depthFromSurface <= 1) return this.blocks.STONE;
                return this.blocks.STONE;
                
            case this.biomes.SWAMP:
                if (depthFromSurface === 0) return this.blocks.DIRT;
                if (depthFromSurface <= 3) return this.blocks.DIRT;
                return this.blocks.STONE;
                
            default: // Plains, Forest, Taiga, Tundra
                if (depthFromSurface === 0) return this.blocks.GRASS;
                if (depthFromSurface <= 3) return this.blocks.DIRT;
                return this.blocks.STONE;
        }
    }

    addStructures(chunk, chunkX, chunkZ, heightMap, biomeMap) {
        // Add trees and other structures
        for (let x = 2; x < this.chunkSize - 2; x++) {
            for (let z = 2; z < this.chunkSize - 2; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                const biome = biomeMap[x][z];
                const height = heightMap[x][z];
                
                // Tree generation based on biome and noise
                const treeNoise = this.heightNoise.fractalNoise3D(worldX * 0.1, 1000, worldZ * 0.1, 1, 1, 1);
                
                let treeChance = 0;
                switch (biome) {
                    case this.biomes.FOREST:
                        treeChance = 0.3;
                        break;
                    case this.biomes.TAIGA:
                        treeChance = 0.25;
                        break;
                    case this.biomes.PLAINS:
                        treeChance = 0.05;
                        break;
                }
                
                if (treeNoise > (1 - treeChance) && height > this.seaLevel) {
                    this.generateTree(chunk, x, z, height + 1);
                }
            }
        }
    }

    generateTree(chunk, x, z, baseY) {
        const treeHeight = 4 + Math.floor(Math.random() * 3);
        
        // Generate trunk
        for (let y = 0; y < treeHeight; y++) {
            if (baseY + y < this.chunkSize) {
                const index = x + z * this.chunkSize + (baseY + y) * this.chunkSize * this.chunkSize;
                chunk.blocks[index] = this.blocks.WOOD;
            }
        }
        
        // Generate leaves
        const leafStartY = baseY + treeHeight - 2;
        for (let ly = leafStartY; ly < leafStartY + 3; ly++) {
            if (ly >= this.chunkSize) break;
            
            const radius = ly === leafStartY + 2 ? 1 : 2;
            for (let lx = x - radius; lx <= x + radius; lx++) {
                for (let lz = z - radius; lz <= z + radius; lz++) {
                    if (lx >= 0 && lx < this.chunkSize && lz >= 0 && lz < this.chunkSize) {
                        const distance = Math.sqrt((lx - x) ** 2 + (lz - z) ** 2);
                        if (distance <= radius && (lx !== x || lz !== z || ly > leafStartY)) {
                            const index = lx + lz * this.chunkSize + ly * this.chunkSize * this.chunkSize;
                            if (chunk.blocks[index] === this.blocks.AIR) {
                                chunk.blocks[index] = this.blocks.LEAVES;
                            }
                        }
                    }
                }
            }
        }
    }

    getBiomeAt(x, z) {
        const temperature = this.temperatureNoise.fractalNoise3D(x * 0.003, 0, z * 0.003, 3, 0.5, 2.0);
        const humidity = this.humidityNoise.fractalNoise3D(x * 0.004, 100, z * 0.004, 3, 0.5, 2.0);
        
        if (temperature < -0.3) {
            return humidity > 0.2 ? 'Taiga' : 'Tundra';
        } else if (temperature > 0.4) {
            if (humidity < -0.2) return 'Desert';
            if (humidity > 0.3) return 'Swamp';
            return 'Plains';
        } else {
            return humidity > 0.1 ? 'Forest' : 'Plains';
        }
    }
}