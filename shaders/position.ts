
export const positionFragmentShader = `
uniform sampler2D uPositions;
uniform sampler2D uVelocities;

varying vec2 vUv;

void main() {
    vec2 uv = vUv;
    vec3 pos = texture2D(uPositions, uv).xyz;
    vec3 vel = texture2D(uVelocities, uv).xyz;
    
    // Euler integration
    pos += vel;
    
    // Store velocity magnitude in w for rendering (color/size)
    float speed = length(vel);
    
    gl_FragColor = vec4(pos, speed);
}
`;

export const positionVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
