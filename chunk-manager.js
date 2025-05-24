import * as THREE from 'three';
import { Renderer } from './renderer.js';

export class ChunkManager {
    constructor(options = {}) {
        this.chunkSize = options.chunkSize || 32;
        this.renderDistance = options.renderDistance || 6;
        this.terrainGenerator = options.terrainGenerator;
        this.scene = options.scene;
        
        this.chunks = new Map(); // Map of "x,z" -> chunk data
        this.chunkMeshes = new Map(); // Map of "x,z" -> THREE.Mesh
        this.loadedChunks = new Set();
        this.renderer = new Renderer({
            scene: this.scene,
            chunkSize: this.chunkSize,
            blockTypes: options.blockTypes || []
        });
        
        this.currentPlayerChunk = { x: 0, z: 0 };
        this.loadingQueue = [];
        this.isLoading = false;
    }

    async loadChunksAroundPosition(chunkX, chunkZ) {
        const chunksToLoad = [];
        
        for (let x = chunkX - this.renderDistance; x <= chunkX + this.renderDistance; x++) {
            for (let z = chunkZ - this.renderDistance; z <= chunkZ + this.renderDistance; z++) {
                const chunkKey = `${x},${z}`;
                if (!this.loadedChunks.has(chunkKey)) {
                    chunksToLoad.push({ x, z });
                }
            }
        }
        
        // Sort by distance to load closest chunks first
        chunksToLoad.sort((a, b) => {
            const distA = Math.sqrt((a.x - chunkX) ** 2 + (a.z - chunkZ) ** 2);
            const distB = Math.sqrt((b.x - chunkX) ** 2 + (b.z - chunkZ) ** 2);
            return distA - distB;
        });
        
        for (const chunk of chunksToLoad) {
            await this.loadChunk(chunk.x, chunk.z);
        }
    }

    async loadChunk(chunkX, chunkZ) {
        const chunkKey = `${chunkX},${chunkZ}`;
        
        if (this.loadedChunks.has(chunkKey)) {
            return;
        }
        
        // Generate chunk data
        const chunkData = this.generateChunk(chunkX, chunkZ);
        this.chunks.set(chunkKey, chunkData);
        
        // Create and add mesh to scene
        const mesh = this.renderer.createChunkMesh(chunkData, chunkX, chunkZ);
        if (mesh) {
            mesh.position.set(chunkX * this.chunkSize, 0, chunkZ * this.chunkSize);
            mesh.userData.chunkMesh = true;
            mesh.userData.chunkX = chunkX;
            mesh.userData.chunkZ = chunkZ;
            this.scene.add(mesh);
            this.chunkMeshes.set(chunkKey, mesh);
        }
        
        this.loadedChunks.add(chunkKey);
    }

    generateChunk(chunkX, chunkZ) {
        const chunk = {
            x: chunkX,
            z: chunkZ,
            blocks: new Uint8Array(this.chunkSize * this.chunkSize * this.chunkSize),
            modified: false
        };
        
        // Generate terrain using the terrain generator
        this.terrainGenerator.generateChunk(chunk);
        
        return chunk;
    }

    updatePlayerPosition(chunkX, chunkZ) {
        if (this.currentPlayerChunk.x === chunkX && this.currentPlayerChunk.z === chunkZ) {
            return;
        }
        
        this.currentPlayerChunk = { x: chunkX, z: chunkZ };
        
        // Load new chunks
        this.loadChunksAroundPosition(chunkX, chunkZ);
        
        // Unload distant chunks
        this.unloadDistantChunks(chunkX, chunkZ);
    }

    unloadDistantChunks(playerChunkX, playerChunkZ) {
        const maxDistance = this.renderDistance + 2; // Extra buffer
        const chunksToUnload = [];
        
        for (const chunkKey of this.loadedChunks) {
            const [x, z] = chunkKey.split(',').map(Number);
            const distance = Math.sqrt((x - playerChunkX) ** 2 + (z - playerChunkZ) ** 2);
            
            if (distance > maxDistance) {
                chunksToUnload.push({ key: chunkKey, x, z });
            }
        }
        
        for (const chunk of chunksToUnload) {
            this.unloadChunk(chunk.x, chunk.z);
        }
    }

    unloadChunk(chunkX, chunkZ) {
        const chunkKey = `${chunkX},${chunkZ}`;
        
        // Remove mesh from scene
        const mesh = this.chunkMeshes.get(chunkKey);
        if (mesh) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.chunkMeshes.delete(chunkKey);
        }
        
        // Remove chunk data
        this.chunks.delete(chunkKey);
        this.loadedChunks.delete(chunkKey);
    }

    getBlock(x, y, z) {
        if (y < 0 || y >= this.chunkSize) {
            return 0; // Air
        }
        
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkZ = Math.floor(z / this.chunkSize);
        const chunkKey = `${chunkX},${chunkZ}`;
        
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) {
            return 0; // Air for unloaded chunks
        }
        
        const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const index = localX + localZ * this.chunkSize + y * this.chunkSize * this.chunkSize;
        
        return chunk.blocks[index] || 0;
    }

    setBlock(x, y, z, blockType) {
        if (y < 0 || y >= this.chunkSize) {
            return false;
        }
        
        const chunkX = Math.floor(x / this.chunkSize);
        const chunkZ = Math.floor(z / this.chunkSize);
        const chunkKey = `${chunkX},${chunkZ}`;
        
        const chunk = this.chunks.get(chunkKey);
        if (!chunk) {
            return false;
        }
        
        const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const index = localX + localZ * this.chunkSize + y * this.chunkSize * this.chunkSize;
        
        chunk.blocks[index] = blockType;
        chunk.modified = true;
        
        // Regenerate chunk mesh
        this.regenerateChunkMesh(chunkX, chunkZ);
        
        // Regenerate neighboring chunks if block is on edge
        if (localX === 0) this.regenerateChunkMesh(chunkX - 1, chunkZ);
        if (localX === this.chunkSize - 1) this.regenerateChunkMesh(chunkX + 1, chunkZ);
        if (localZ === 0) this.regenerateChunkMesh(chunkX, chunkZ - 1);
        if (localZ === this.chunkSize - 1) this.regenerateChunkMesh(chunkX, chunkZ + 1);
        
        return true;
    }

    regenerateChunkMesh(chunkX, chunkZ) {
        const chunkKey = `${chunkX},${chunkZ}`;
        const chunk = this.chunks.get(chunkKey);
        
        if (!chunk) return;
        
        // Remove old mesh
        const oldMesh = this.chunkMeshes.get(chunkKey);
        if (oldMesh) {
            this.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
            oldMesh.material.dispose();
        }
        
        // Create new mesh
        const mesh = this.renderer.createChunkMesh(chunk, chunkX, chunkZ);
        if (mesh) {
            mesh.position.set(chunkX * this.chunkSize, 0, chunkZ * this.chunkSize);
            mesh.userData.chunkMesh = true;
            mesh.userData.chunkX = chunkX;
            mesh.userData.chunkZ = chunkZ;
            this.scene.add(mesh);
            this.chunkMeshes.set(chunkKey, mesh);
        }
    }

    getLoadedChunkCount() {
        return this.loadedChunks.size;
    }

    dispose() {
        // Remove all chunk meshes
        for (const mesh of this.chunkMeshes.values()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        
        // Clear all data structures
        this.chunks.clear();
        this.chunkMeshes.clear();
        this.loadedChunks.clear();
    }
}

