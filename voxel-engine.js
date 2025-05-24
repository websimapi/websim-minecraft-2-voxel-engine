import * as THREE from 'three';
import { ChunkManager } from './chunk-manager.js';
import { TerrainGenerator } from './terrain-generator.js';
import { Renderer } from './renderer.js';

export class VoxelEngine {
    constructor(options = {}) {
        this.container = options.container;
        this.seed = options.seed || 12345;
        this.renderDistance = options.renderDistance || 6;
        this.chunkSize = options.chunkSize || 32;
        this.worldHeight = options.worldHeight || 256;
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = null;
        this.chunkManager = null;
        this.terrainGenerator = null;
        this.voxelRenderer = null;
        
        this.player = {
            position: new THREE.Vector3(0, 128, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Vector2(0, 0),
            speed: 20,
            jumpSpeed: 10,
            onGround: false
        };
        
        this.controls = {
            keys: {},
            mouse: { x: 0, y: 0 },
            locked: false
        };
        
        this.stats = {
            fps: 0,
            frameCount: 0,
            lastTime: 0,
            chunksLoaded: 0,
            currentBiome: 'Plains'
        };
        
        this.selectedBlock = 1; // Stone by default
        this.blockTypes = [
            { name: 'Air', color: 0x000000 },
            { name: 'Stone', color: 0x808080 },
            { name: 'Dirt', color: 0x8B4513 },
            { name: 'Grass', color: 0x00FF00 },
            { name: 'Sand', color: 0xFFD700 },
            { name: 'Water', color: 0x0077BE },
            { name: 'Wood', color: 0x8B4513 },
            { name: 'Leaves', color: 0x228B22 },
            { name: 'Cobblestone', color: 0x696969 }
        ];
    }

    async init() {
        // Initialize renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x87CEEB); // Sky blue
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Initialize terrain generator
        this.terrainGenerator = new TerrainGenerator({
            seed: this.seed,
            chunkSize: this.chunkSize,
            worldHeight: this.worldHeight
        });

        // Initialize chunk manager
        this.chunkManager = new ChunkManager({
            chunkSize: this.chunkSize,
            renderDistance: this.renderDistance,
            terrainGenerator: this.terrainGenerator,
            scene: this.scene
        });

        // Initialize voxel renderer
        this.voxelRenderer = new Renderer({
            scene: this.scene,
            chunkSize: this.chunkSize,
            blockTypes: this.blockTypes
        });

        // Set up lighting
        this.setupLighting();
        
        // Set up controls
        this.setupControls();
        
        // Set initial camera position
        this.camera.position.copy(this.player.position);
        
        // Generate initial chunks
        await this.generateInitialChunks();
        
        console.log(`Voxel Engine initialized with seed: ${this.seed}`);
    }

    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);

        // Directional light (sun)
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        directionalLight.shadow.camera.left = -100;
        directionalLight.shadow.camera.right = 100;
        directionalLight.shadow.camera.top = 100;
        directionalLight.shadow.camera.bottom = -100;
        this.scene.add(directionalLight);

        // Sky gradient
        const skyGradient = this.createSkyGradient();
        this.scene.background = skyGradient;
    }

    createSkyGradient() {
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            side: THREE.BackSide
        });

        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        return sky;
    }

    setupControls() {
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            this.controls.keys[e.code] = true;
            
            // Block selection
            const num = parseInt(e.key);
            if (num >= 1 && num <= 8) {
                this.selectedBlock = num;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.controls.keys[e.code] = false;
        });

        // Mouse controls
        this.renderer.domElement.addEventListener('click', () => {
            this.renderer.domElement.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            this.controls.locked = document.pointerLockElement === this.renderer.domElement;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.controls.locked) return;
            
            this.player.rotation.x -= e.movementY * 0.002;
            this.player.rotation.y -= e.movementX * 0.002;
            
            this.player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.player.rotation.x));
        });

        // Mouse click for block breaking/placing
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            if (!this.controls.locked) return;
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
            
            if (e.button === 0) { // Left click - break block
                this.breakBlock(raycaster);
            } else if (e.button === 2) { // Right click - place block
                this.placeBlock(raycaster);
            }
        });

        // Prevent context menu on right click
        this.renderer.domElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Window resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    async generateInitialChunks() {
        const chunkX = Math.floor(this.player.position.x / this.chunkSize);
        const chunkZ = Math.floor(this.player.position.z / this.chunkSize);
        
        await this.chunkManager.loadChunksAroundPosition(chunkX, chunkZ);
    }

    start() {
        this.animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.update();
        this.render();
        this.updateStats();
    }

    update() {
        const deltaTime = 0.016; // Assume 60fps
        
        this.updatePlayer(deltaTime);
        this.updateCamera();
        this.updateChunks();
    }

    updatePlayer(deltaTime) {
        const moveVector = new THREE.Vector3();
        
        // Movement input
        if (this.controls.keys['KeyW']) moveVector.z -= 1;
        if (this.controls.keys['KeyS']) moveVector.z += 1;
        if (this.controls.keys['KeyA']) moveVector.x -= 1;
        if (this.controls.keys['KeyD']) moveVector.x += 1;
        if (this.controls.keys['Space']) moveVector.y += 1;
        if (this.controls.keys['ShiftLeft']) moveVector.y -= 1;
        
        // Apply rotation to movement
        if (moveVector.length() > 0) {
            moveVector.normalize();
            moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotation.y);
            moveVector.multiplyScalar(this.player.speed * deltaTime);
            this.player.position.add(moveVector);
        }
        
        // Keep player above ground
        if (this.player.position.y < 1) {
            this.player.position.y = 1;
        }
    }

    updateCamera() {
        this.camera.position.copy(this.player.position);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.player.rotation.y;
        this.camera.rotation.x = this.player.rotation.x;
    }

    updateChunks() {
        const chunkX = Math.floor(this.player.position.x / this.chunkSize);
        const chunkZ = Math.floor(this.player.position.z / this.chunkSize);
        
        this.chunkManager.updatePlayerPosition(chunkX, chunkZ);
        this.stats.chunksLoaded = this.chunkManager.getLoadedChunkCount();
        
        // Update current biome
        this.stats.currentBiome = this.terrainGenerator.getBiomeAt(
            this.player.position.x, 
            this.player.position.z
        );
    }

    breakBlock(raycaster) {
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        for (let intersect of intersects) {
            if (intersect.object.userData.chunkMesh) {
                const point = intersect.point.clone();
                point.sub(intersect.face.normal.clone().multiplyScalar(0.1));
                
                const blockPos = {
                    x: Math.floor(point.x),
                    y: Math.floor(point.y),
                    z: Math.floor(point.z)
                };
                
                this.chunkManager.setBlock(blockPos.x, blockPos.y, blockPos.z, 0);
                break;
            }
        }
    }

    placeBlock(raycaster) {
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        for (let intersect of intersects) {
            if (intersect.object.userData.chunkMesh) {
                const point = intersect.point.clone();
                point.add(intersect.face.normal.clone().multiplyScalar(0.1));
                
                const blockPos = {
                    x: Math.floor(point.x),
                    y: Math.floor(point.y),
                    z: Math.floor(point.z)
                };
                
                this.chunkManager.setBlock(blockPos.x, blockPos.y, blockPos.z, this.selectedBlock);
                break;
            }
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    updateStats() {
        this.stats.frameCount++;
        const now = performance.now();
        
        if (now >= this.stats.lastTime + 1000) {
            this.stats.fps = Math.round(this.stats.frameCount * 1000 / (now - this.stats.lastTime));
            this.stats.frameCount = 0;
            this.stats.lastTime = now;
        }
    }

    getStats() {
        return this.stats;
    }

    getPlayerPosition() {
        return this.player.position;
    }

    getSeed() {
        return this.seed;
    }

    dispose() {
        if (this.chunkManager) {
            this.chunkManager.dispose();
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Clear scene
        while (this.scene.children.length > 0) {
            this.scene.remove(this.scene.children[0]);
        }
    }
}

