import * as THREE from 'three';

/**
 * Generates positions on a 2D plane using a stratified sampling approach.
 * This approximates Poisson Disk Sampling but is faster to compute for
 * massive datasets (e.g., 65k particles) at runtime.
 */
export const generateParticles = (width: number, height: number) => {
  const length = width * height;
  const data = new Float32Array(length * 4);

  // Grid settings
  const aspectRatio = window.innerWidth / window.innerHeight;
  const rangeX = 30 * aspectRatio; // Spread in X
  const rangeY = 30; // Spread in Y

  for (let i = 0; i < length; i++) {
    const i4 = i * 4;

    // Normalized grid coordinates (0 to 1)
    // We use a grid + jitter to ensure even distribution without overlapping (Poisson-like)
    const gridX = (i % width) / width;
    const gridY = Math.floor(i / width) / height;

    // Map to world space centered at 0,0 with some random jitter
    // Jitter amount depends on grid density
    const jitter = 0.8 * (1 / width); 
    
    const x = (gridX + (Math.random() - 0.5) * jitter) * rangeX - (rangeX / 2);
    const y = (gridY + (Math.random() - 0.5) * jitter) * rangeY - (rangeY / 2);
    const z = 0; 

    data[i4] = x;
    data[i4 + 1] = y;
    data[i4 + 2] = z;
    data[i4 + 3] = Math.random(); // Alpha/Life/Variation channel
  }

  return data;
};

export const getReferenceUVs = (count: number, size: number) => {
  const references = new Float32Array(count * 2);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      references[index * 2] = (j + 0.5) / size;
      references[index * 2 + 1] = (i + 0.5) / size;
    }
  }
  return references;
};