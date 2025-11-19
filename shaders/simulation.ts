
/**
 * SIMULATION FRAGMENT SHADER
 * This runs on the GPU to update particle positions every frame.
 * It acts as the "Physics Engine".
 */

export const simulationFragmentShader = `
uniform sampler2D uPositions;
uniform sampler2D uOriginalPositions;
uniform vec2 uMouse;
uniform float uTime;
uniform float uHover;
uniform float uRingRadius;
uniform float uRingWidth;
uniform float uRingDisplacement;
uniform float uReturnStrength;

varying vec2 vUv;

// --- Simplex Noise 3D ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,7)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  vec2 uv = vUv;
  vec4 currentPos = texture2D(uPositions, uv);
  vec4 originalPos = texture2D(uOriginalPositions, uv);
  
  vec3 pos = currentPos.xyz;
  vec3 refPos = originalPos.xyz;
  float life = currentPos.w; 
  float velocity = 0.0;

  // The "Ring" interaction logic
  // Uniforms controlled by GUI
  
  // Use the mouse position passed in
  vec2 uRingPos = uMouse; 
  
  // Calculate distance between current particle and mouse ring center
  float dist = distance(pos.xy, uRingPos);
  
  // Add some noise to the distance check to make the ring edge irregular/organic
  float noise0 = snoise(vec3(pos.xy * 0.2 + vec2(18.4924, 72.9744), uTime * 0.5));
  float dist1 = distance(pos.xy + (noise0 * 0.2), uRingPos);

  // Create the ring influence factor 't'
  // This creates a band where particles are affected
  float t = smoothstep(uRingRadius - (uRingWidth * 2.0), uRingRadius, dist) 
          - smoothstep(uRingRadius, uRingRadius + uRingWidth, dist1);
          
  // Another layer of ring influence for more detail
  float t2 = smoothstep(uRingRadius - (uRingWidth * 2.0), uRingRadius, dist) 
           - smoothstep(uRingRadius, uRingRadius + uRingWidth * 0.5, dist1);

  // Apply the force
  // The particle is pushed away from the mouse based on the ring factor
  // Note: logic adapted to "pos -= ..." means pushing/pulling based on vector math
  
  vec2 disp = vec2(0.0); // Could add extra noise displacement here
  
  // Only apply if hovering
  if (uHover > 0.5) {
      pos.xy -= (uRingPos - (pos.xy + disp)) * pow(t2, 0.75) * uRingDisplacement * 0.1;
  }

  // --- Physics / Restoration ---
  
  // Always try to return home
  vec3 homeDir = refPos - pos;
  float returnStrength = uReturnStrength + (life * 0.04); // Randomize return speed
  
  // If we are being pushed by the ring, return force is weaker or overpowered
  // If not pushed, we spring back
  
  pos += homeDir * returnStrength;
  
  // Dampen velocity (simulated by just moving position directly here for stability)
  
  // Update life/velocity for visual shader to use
  // We store "how disturbed" the particle is in the w component
  float disturbance = length(pos - refPos);
  velocity = smoothstep(0.0, 2.0, disturbance);

  gl_FragColor = vec4(pos, velocity);
}
`;

export const simulationVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
