import * as THREE from 'three';

export class Renderer {
    constructor(options = {}) {
        this.scene = options.scene;
        this.chunkSize = options.chunkSize || 32;
        this.blockTypes = options.blockTypes || [];
        
        // Create materials for different block types
        this.materials = this.createMaterials();
        
        // Greedy meshing for performance
        this.useGreedyMeshing = true;
    }

    createMaterials() {
        const materials = {};
        
        const blockColors = {
            0: 0x000000, // Air (shouldn't be rendered)
            1: 0x808080, // Stone
            2: 0x8B4513, // Dirt
            3: 0x00FF00, // Grass
            4: 0xFFD700, // Sand
            5: 0x0077BE, // Water
            6: 0x8B4513, // Wood
            7: 0x228B22, // Leaves
            8: 0x696969  // Cobblestone
        };
        
        for (const [blockId, color] of Object.entries(blockColors)) {
            if (blockId === '0') continue; // Skip air
            
            materials[blockId] = new THREE.MeshLambertMaterial({
                color: color,
                transparent: blockId === '5', // Water is transparent
                opacity: blockId === '5' ? 0.7 : 1.0
            });
        }
        
        return materials;
    }

    createChunkMesh(chunk, chunkX, chunkZ) {
        if (this.useGreedyMeshing) {
            return this.createGreedyChunkMesh(chunk, chunkX, chunkZ);
        } else {
            return this.createSimpleChunkMesh(chunk, chunkX, chunkZ);
        }
    }

    createGreedyChunkMesh(chunk, chunkX, chunkZ) {
        const meshes = [];
        
        // Create separate mesh for each material
        for (const blockType in this.materials) {
            const geometry = this.createGreedyGeometry(chunk, parseInt(blockType));
            
            if (geometry.attributes.position.count > 0) {
                const mesh = new THREE.Mesh(geometry, this.materials[blockType]);
                mesh.receiveShadow = true;
                mesh.castShadow = true;
                meshes.push(mesh);
            } else {
                geometry.dispose();
            }
        }
        
        if (meshes.length === 0) return null;
        
        // Combine all meshes into one
        if (meshes.length === 1) {
            return meshes[0];
        } else {
            const group = new THREE.Group();
            meshes.forEach(mesh => group.add(mesh));
            return group;
        }
    }

    createGreedyGeometry(chunk, targetBlockType) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let vertexCount = 0;
        
        // Greedy meshing for each axis
        for (let axis = 0; axis < 3; axis++) {
            const u = (axis + 1) % 3;
            const v = (axis + 2) % 3;
            
            const x = [0, 0, 0];
            const q = [0, 0, 0];
            
            const mask = new Array(this.chunkSize * this.chunkSize);
            q[axis] = 1;
            
            for (x[axis] = -1; x[axis] < this.chunkSize;) {
                let n = 0;
                
                for (x[v] = 0; x[v] < this.chunkSize; x[v]++) {
                    for (x[u] = 0; x[u] < this.chunkSize; x[u]++) {
                        const blockA = this.getBlock(chunk, x[0], x[1], x[2]) === targetBlockType;
                        const blockB = this.getBlock(chunk, x[0] + q[0], x[1] + q[1], x[2] + q[2]) === targetBlockType;
                        
                        mask[n++] = blockA !== blockB ? (blockA ? 1 : -1) : 0;
                    }
                }
                
                x[axis]++;
                
                // Generate faces from mask
                n = 0;
                for (let j = 0; j < this.chunkSize; j++) {
                    for (let i = 0; i < this.chunkSize;) {
                        if (mask[n] !== 0) {
                            const backFace = mask[n] < 0;
                            
                            // Compute width
                            let w = 1;
                            while (i + w < this.chunkSize && mask[n + w] === mask[n]) {
                                w++;
                            }
                            
                            // Compute height
                            let h = 1;
                            let done = false;
                            while (j + h < this.chunkSize && !done) {
                                for (let k = 0; k < w; k++) {
                                    if (mask[n + k + h * this.chunkSize] !== mask[n]) {
                                        done = true;
                                        break;
                                    }
                                }
                                if (!done) h++;
                            }
                            
                            // Add face
                            x[u] = i;
                            x[v] = j;
                            
                            const du = [0, 0, 0];
                            const dv = [0, 0, 0];
                            du[u] = w;
                            dv[v] = h;
                            
                            this.addQuad(
                                positions, normals, uvs, indices,
                                [x[0], x[1], x[2]],
                                [x[0] + du[0], x[1] + du[1], x[2] + du[2]],
                                [x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]],
                                [x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]],
                                backFace,
                                vertexCount
                            );
                            
                            vertexCount += 4;
                            
                            // Clear mask
                            for (let l = 0; l < h; l++) {
                                for (let k = 0; k < w; k++) {
                                    mask[n + k + l * this.chunkSize] = 0;
                                }
                            }
                            
                            i += w;
                            n += w;
                        } else {
                            i++;
                            n++;
                        }
                    }
                }
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        
        return geometry;
    }

    addQuad(positions, normals, uvs, indices, v1, v2, v3, v4, backFace, vertexOffset) {
        if (backFace) {
            [v1, v2, v3, v4] = [v4, v3, v2, v1];
        }
        
        // Add vertices
        positions.push(...v1, ...v2, ...v3, ...v4);
        
        // Calculate normal
        const normal = this.calculateNormal(v1, v2, v3);
        normals.push(...normal, ...normal, ...normal, ...normal);
        
        // Add UVs
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        
        // Add indices for two triangles
        indices.push(
            vertexOffset, vertexOffset + 1, vertexOffset + 2,
            vertexOffset, vertexOffset + 2, vertexOffset + 3
        );
    }

    calculateNormal(v1, v2, v3) {
        const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
        const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
        
        const normal = [
            edge1[1] * edge2[2] - edge1[2] * edge2[1],
            edge1[2] * edge2[0] - edge1[0] * edge2[2],
            edge1[0] * edge2[1] - edge1[1] * edge2[0]
        ];
        
        const length = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
        if (length > 0) {
            normal[0] /= length;
            normal[1] /= length;
            normal[2] /= length;
        }
        
        return normal;
    }

    getBlock(chunk, x, y, z) {
        if (x < 0 || x >= this.chunkSize || 
            y < 0 || y >= this.chunkSize || 
            z < 0 || z >= this.chunkSize) {
            return 0; // Air outside chunk bounds
        }
        
        const index = x + z * this.chunkSize + y * this.chunkSize * this.chunkSize;
        return chunk.blocks[index] || 0;
    }

    createSimpleChunkMesh(chunk, chunkX, chunkZ) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const normals = [];
        const uvs = [];
        const colors = [];
        
        // Face directions
        const faces = [
            { dir: [0, 0, 1], corners: [[0,1,1], [1,1,1], [1,0,1], [0,0,1]] },  // Front
            { dir: [0, 0, -1], corners: [[1,1,0], [0,1,0], [0,0,0], [1,0,0]] }, // Back
            { dir: [0, 1, 0], corners: [[0,1,0], [1,1,0], [1,1,1], [0,1,1]] },  // Top
            { dir: [0, -1, 0], corners: [[0,0,1], [1,0,1], [1,0,0], [0,0,0]] }, // Bottom
            { dir: [1, 0, 0], corners: [[1,1,1], [1,1,0], [1,0,0], [1,0,1]] },  // Right
            { dir: [-1, 0, 0], corners: [[0,1,0], [0,1,1], [0,0,1], [0,0,0]] }  // Left
        ];
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    const blockType = this.getBlock(chunk, x, y, z);
                    if (blockType === 0) continue; // Skip air blocks
                    
                    // Check each face
                    for (const face of faces) {
                        const [dx, dy, dz] = face.dir;
                        const neighborType = this.getBlock(chunk, x + dx, y + dy, z + dz);
                        
                        // Only render face if neighbor is air or transparent
                        if (neighborType === 0 || (neighborType === 5 && blockType !== 5)) {
                            // Add face vertices
                            for (const corner of face.corners) {
                                positions.push(
                                    x + corner[0],
                                    y + corner[1],
                                    z + corner[2]
                                );
                                normals.push(...face.dir);
                                uvs.push(corner[0], corner[1]);
                                
                                // Add color based on block type
                                const color = new THREE.Color(this.materials[blockType]?.color || 0x808080);
                                colors.push(color.r, color.g, color.b);
                            }
                        }
                    }
                }
            }
        }
        
        if (positions.length === 0) return null;
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // Calculate indices for triangles
        const indices = [];
        for (let i = 0; i < positions.length / 3; i += 4) {
            indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
        }
        geometry.setIndex(indices);
        
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true
        });
        
        return new THREE.Mesh(geometry, material);
    }
}

