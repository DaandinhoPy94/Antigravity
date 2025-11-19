
/**
 * RENDER SHADERS
 * These determine how the points actually look on screen.
 */

export const renderVertexShader = `
uniform sampler2D uPositions;
uniform float uPointSize;
uniform float uPixelRatio;

attribute vec2 reference; // UV coordinate to read from texture

varying vec3 vColor;
varying float vAlpha;
varying float vVelocity;

void main() {
  // Read position data from the simulation texture
  vec4 posData = texture2D(uPositions, reference);
  vec3 pos = posData.xyz;
  float velocity = posData.w; // Stored "disturbance" amount
  
  vVelocity = velocity;

  // Move vertex to the computed position
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Size attenuation (make particles smaller when far away)
  // Scale size by velocity for impact
  float size = uPointSize * (1.0 + velocity * 2.0);
  gl_PointSize = size * (100.0 / -mvPosition.z) * uPixelRatio;
  
  // Color variation
  // Base blueish, shift to white/bright cyan on high velocity
  vec3 colorBase = vec3(0.1, 0.5, 0.9);
  vec3 colorActive = vec3(0.4, 0.9, 1.0);
  
  vColor = mix(colorBase, colorActive, velocity);
  vAlpha = 0.6 + velocity * 0.4;
}
`;

export const renderFragmentShader = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  // Circular particle shape with soft edge
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  
  // Discard outside circle
  if (dist > 0.5) discard;
  
  // Soft glow
  float alpha = (1.0 - smoothstep(0.3, 0.5, dist)) * vAlpha;
  
  gl_FragColor = vec4(vColor, alpha);
}
`;
