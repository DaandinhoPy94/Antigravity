
import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { useFBO } from '@react-three/drei';

// Imports
import { generateParticles, getReferenceUVs } from '../utils/poisson';
import { simulationVertexShader, simulationFragmentShader } from '../shaders/simulation';
import { renderVertexShader, renderFragmentShader } from '../shaders/render';

// Simulation Settings
const SIZE = 256; // Texture width/height. 256x256 = 65,536 particles
const PARTICLE_SIZE = 1.8;

export const FBOParticles: React.FC = () => {
  const { gl, camera, viewport } = useThree();
  
  // 1. Setup FBOs (Frame Buffer Objects)
  // We need two buffers to swap back and forth (Ping-Pong technique)
  const renderTargetA = useFBO(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType, // Important for precision
    stencilBuffer: false,
    depthBuffer: false,
  });
  
  const renderTargetB = useFBO(SIZE, SIZE, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    stencilBuffer: false,
    depthBuffer: false,
  });

  // Refs to manage ping-pong buffers
  const targetRef = useRef(renderTargetA);
  const sourceRef = useRef(renderTargetB);

  // 2. Generate Initial Data
  const initialDataTexture = useMemo(() => {
    const data = generateParticles(SIZE, SIZE);
    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // 3. Simulation Material (The Physics Engine)
  // This renders to the off-screen FBO
  const simulationMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: initialDataTexture },
        uOriginalPositions: { value: initialDataTexture },
        uMouse: { value: new THREE.Vector2(-1000, -1000) }, // Start off-screen
        uTime: { value: 0 },
        uHover: { value: 0 },
      },
      vertexShader: simulationVertexShader,
      fragmentShader: simulationFragmentShader,
    });
  }, [initialDataTexture]);

  // 4. Render Material (The Visuals)
  // This renders the actual points to the screen
  const renderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPositions: { value: null }, // Will be updated frame-by-frame
        uPointSize: { value: PARTICLE_SIZE },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: renderVertexShader,
      fragmentShader: renderFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
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
    const mesh = new THREE.Mesh(geom, simulationMaterial);
    simScene.add(mesh);
  }, [simScene, simulationMaterial]);

  // Mouse tracking
  const mouseRef = useRef(new THREE.Vector2(0, 0));
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
      
      mouseRef.current.set(pos.x, pos.y);
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

    // A. Update Simulation Uniforms
    simulationMaterial.uniforms.uTime.value = clock.elapsedTime;
    // Smoothly interpolate mouse position for fluid movement
    simulationMaterial.uniforms.uMouse.value.lerp(mouseRef.current, 0.1);
    simulationMaterial.uniforms.uHover.value = THREE.MathUtils.lerp(
      simulationMaterial.uniforms.uHover.value, 
      hoverRef.current, 
      0.1
    );
    
    // Feed the *current* position (source) into the simulation
    simulationMaterial.uniforms.uPositions.value = sourceRef.current.texture;

    // B. Render the Simulation Step
    // We render *into* the target buffer
    gl.setRenderTarget(targetRef.current);
    gl.clear();
    gl.render(simScene, simCamera);
    
    // C. Feed new positions to the Render Material
    // The 'target' now contains the updated positions
    renderMaterial.uniforms.uPositions.value = targetRef.current.texture;

    // D. Swap Buffers for next frame
    // Target becomes Source, Source becomes Target
    const temp = sourceRef.current;
    sourceRef.current = targetRef.current;
    targetRef.current = temp;
    
    // Reset render target to screen
    gl.setRenderTarget(null);
  });

  return (
    <points geometry={particlesGeometry} material={renderMaterial} />
  );
};
