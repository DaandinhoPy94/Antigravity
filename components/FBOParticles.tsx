
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { useFBO } from '@react-three/drei';
import { useControls } from 'leva';

// Imports
import { generateParticles, getReferenceUVs } from '../utils/poisson';
import { velocityVertexShader, velocityFragmentShader } from '../shaders/velocity';
import { positionVertexShader, positionFragmentShader } from '../shaders/position';
import { renderVertexShader, renderFragmentShader } from '../shaders/render';

// Simple shader to copy a texture
const copyVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const copyFragmentShader = `
uniform sampler2D uTexture;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(uTexture, vUv);
}
`;

// Simulation Settings
const SIZE = 128; // Texture width/height. 128x128 = 16,384 particles
const PARTICLE_SIZE = 1.8;

export const FBOParticles: React.FC = () => {
  const { gl, camera, viewport } = useThree();

  const {
    uRingRadius,
    uRingWidth,
    uRingDisplacement,
    uReturnStrength,
    uColorBase,
    uColorActive,
    uPointSize,
    uGravityMode, // New control
  } = useControls({
    uRingRadius: { value: 5.0, min: 1, max: 20, step: 0.1, label: 'Ring Radius' },
    uRingWidth: { value: 1.5, min: 0.1, max: 5, step: 0.1, label: 'Ring Width' },
    uRingDisplacement: { value: 12.0, min: 0, max: 50, step: 0.1, label: 'Displacement' },
    uReturnStrength: { value: 0.05, min: 0.001, max: 0.2, step: 0.001, label: 'Return Strength' },
    uColorBase: { value: '#1a80e6', label: 'Base Color' },
    uColorActive: { value: '#66e6ff', label: 'Active Color' },
    uPointSize: { value: 1.8, min: 0.1, max: 10, step: 0.1, label: 'Point Size' },
    uGravityMode: { value: false, label: 'Antigravity Mode' }, // False = Attract, True = Repel
  });

  // 1. Setup FBOs (Frame Buffer Objects)
  // We need TWO sets of buffers now: Position and Velocity
  // And for each, we need two buffers to swap (Ping-Pong)

  // POSITIONS
  const positionsA = useFBO(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    stencilBuffer: false,
    depthBuffer: false,
  });
  const positionsB = useFBO(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    stencilBuffer: false,
    depthBuffer: false,
  });

  // VELOCITIES
  const velocitiesA = useFBO(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    stencilBuffer: false,
    depthBuffer: false,
  });
  const velocitiesB = useFBO(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    stencilBuffer: false,
    depthBuffer: false,
  });

  // Refs to manage ping-pong buffers
  const posTargetRef = useRef(positionsA);
  const posSourceRef = useRef(positionsB);

  const velTargetRef = useRef(velocitiesA);
  const velSourceRef = useRef(velocitiesB);

  // 2. Generate Initial Data
  const initialDataTexture = useMemo(() => {
    const data = generateParticles(SIZE, SIZE);
    console.log('Initial Data (First 4):', data[0], data[1], data[2], data[3]);
    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // 3. Simulation Materials (Physics Engine)

  // A. Velocity Material (Calculates forces)
  const velocityMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null },
        uVelocities: { value: null },
        uOriginalPositions: { value: initialDataTexture }, // Original offsets
        uMouse: { value: new THREE.Vector3(0, 0, 0) },
        uMouseVel: { value: new THREE.Vector3(0, 0, 0) },
        uTime: { value: 0 },
        uReturnStrength: { value: 0.05 },
        uDamping: { value: 0.92 },
        uRingRadius: { value: 5.0 },
        uRingDisplacement: { value: 12.0 },
        uGravityMode: { value: 0 },
      },
      vertexShader: velocityVertexShader,
      fragmentShader: velocityFragmentShader,
    });
  }, [initialDataTexture]);

  // B. Position Material (Integrates velocity)
  const positionMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null },
        uVelocities: { value: null },
      },
      vertexShader: positionVertexShader,
      fragmentShader: positionFragmentShader,
    });
  }, []);

  // 4. Render Material (The Visuals)
  // This renders the actual points to the screen
  const renderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null }, // Will be updated frame-by-frame
        uPointSize: { value: PARTICLE_SIZE },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uColorBase: { value: new THREE.Color('#1a80e6') },
        uColorActive: { value: new THREE.Color('#66e6ff') },
      },
      vertexShader: renderVertexShader,
      fragmentShader: renderFragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
  }, []);

  // 5. Geometry for Points
  // We just need a buffer of UV references, one for each pixel in the texture
  const particlesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const count = SIZE * SIZE;
    const references = getReferenceUVs(count, SIZE);

    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('reference', new THREE.BufferAttribute(references, 2));

    return geometry;
  }, []);

  // 6. Simulation Scene (Off-screen)
  // A full-screen quad to run the fragment shader on every pixel (particle)
  const simScene = useMemo(() => new THREE.Scene(), []);
  const simCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);

  useEffect(() => {
    const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    // We need two meshes, one for each pass, or re-use one mesh and swap material?
    // Re-using mesh is fine, we just set material before render.
    const mesh = new THREE.Mesh(geom, velocityMaterial);
    simScene.add(mesh);
  }, [simScene, velocityMaterial]);

  // 6. Initialize FBOs (Run once)
  useEffect(() => {
    const mesh = simScene.children[0] as THREE.Mesh;
    if (!mesh) return;

    // Create a temporary copy material
    const copyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: initialDataTexture },
      },
      vertexShader: copyVertexShader,
      fragmentShader: copyFragmentShader,
    });

    mesh.material = copyMaterial;

    // Render into positionsA
    gl.setRenderTarget(posTargetRef.current);
    gl.clear();
    gl.render(simScene, simCamera);

    // Render into positionsB (just in case)
    gl.setRenderTarget(posSourceRef.current);
    gl.clear();
    gl.render(simScene, simCamera);

    // Reset
    gl.setRenderTarget(null);
    mesh.material = velocityMaterial; // Restore
  }, [gl, simScene, simCamera, initialDataTexture, velocityMaterial]);

  // Mouse tracking
  const mouseRef = useRef(new THREE.Vector3(0, 0, 0));
  const lastMouseRef = useRef(new THREE.Vector3(0, 0, 0));
  const mouseVelRef = useRef(new THREE.Vector3(0, 0, 0));
  const hoverRef = useRef(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;

      // Project screen coordinates to world space at z=0
      const vec = new THREE.Vector3(x, y, 0.5);
      vec.unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const distance = -camera.position.z / dir.z;
      const pos = camera.position.clone().add(dir.multiplyScalar(distance));

      mouseRef.current.set(pos.x, pos.y, 0); // Z is 0
      // console.log('Mouse Move:', pos.x, pos.y);
      hoverRef.current = 1;
    };

    const handleMouseLeave = () => {
      hoverRef.current = 0;
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [camera]);

  // 7. The Animation Loop
  useFrame((state) => {
    const { gl, clock } = state;

    // --- STEP 1: UPDATE VELOCITY ---

    // Calculate Mouse Velocity (Delta)
    // We use the raw mouseRef vs lastMouseRef for physics accuracy
    const currentMouse = mouseRef.current;
    const lastMouse = lastMouseRef.current;

    // Calculate velocity
    mouseVelRef.current.subVectors(currentMouse, lastMouse);

    // Update last mouse for next frame
    lastMouseRef.current.copy(currentMouse);

    // Update Velocity Uniforms
    velocityMaterial.uniforms.uTime.value = clock.elapsedTime;
    velocityMaterial.uniforms.uPositions.value = posSourceRef.current.texture;
    velocityMaterial.uniforms.uVelocities.value = velSourceRef.current.texture;
    velocityMaterial.uniforms.uMouse.value.copy(mouseRef.current);
    velocityMaterial.uniforms.uMouseVel.value.copy(mouseVelRef.current);

    velocityMaterial.uniforms.uReturnStrength.value = uReturnStrength;
    velocityMaterial.uniforms.uRingRadius.value = uRingRadius;
    velocityMaterial.uniforms.uRingDisplacement.value = uRingDisplacement;
    velocityMaterial.uniforms.uGravityMode.value = uGravityMode ? 1 : 0;

    // Render Velocity
    // We render *into* the velocity target buffer
    // Use the scene mesh we created (it has velocityMaterial by default? No we need to set it)
    const mesh = simScene.children[0] as THREE.Mesh;
    mesh.material = velocityMaterial;

    gl.setRenderTarget(velTargetRef.current);
    gl.clear();
    gl.render(simScene, simCamera);

    // --- STEP 2: UPDATE POSITION ---

    // Update Position Uniforms
    positionMaterial.uniforms.uPositions.value = posSourceRef.current.texture;
    positionMaterial.uniforms.uVelocities.value = velTargetRef.current.texture; // Use the NEW velocity we just computed

    // Render Position
    mesh.material = positionMaterial;

    gl.setRenderTarget(posTargetRef.current);
    gl.clear();
    gl.render(simScene, simCamera);

    // --- STEP 3: UPDATE RENDER MATERIAL ---

    // Feed new positions to the Render Material
    renderMaterial.uniforms.uPositions.value = posTargetRef.current.texture;
    renderMaterial.uniforms.uPointSize.value = uPointSize;
    renderMaterial.uniforms.uColorBase.value.set(uColorBase);
    renderMaterial.uniforms.uColorActive.value.set(uColorActive);

    // --- STEP 4: SWAP BUFFERS ---

    // Swap Position Buffers
    const tempPos = posSourceRef.current;
    posSourceRef.current = posTargetRef.current;
    posTargetRef.current = tempPos;

    // Swap Velocity Buffers
    const tempVel = velSourceRef.current;
    velSourceRef.current = velTargetRef.current;
    velTargetRef.current = tempVel;

    // Reset render target to screen
    gl.setRenderTarget(null);
  });

  return (
    <points geometry={particlesGeometry} material={renderMaterial} />
  );
};
