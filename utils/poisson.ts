import * as THREE from 'three';

/**
 * Generates positions on a 2D plane using a stratified sampling approach.
 * This approximates Poisson Disk Sampling but is faster to compute for
 * massive datasets (e.g., 65k particles) at runtime.
 */
export const generateParticles = (width: number, height: number) => {
  const length = width * height;
  const data = new Float32Array(length * 4);

  // Radial settings
  const maxRadius = 25.0; // Maximum spread radius
  const power = 2.0; // Higher power = more density at center

  for (let i = 0; i < length; i++) {
    const i4 = i * 4;

    // Polar coordinates
    // Random angle
    const theta = Math.random() * Math.PI * 2;

    // Random radius with bias towards center
    // Math.random() is 0..1. Squaring it makes it smaller on average.
    const r = Math.pow(Math.random(), power) * maxRadius;

    // Convert to Cartesian
    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
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