
// Simplex noise function
const shaderNoiseFunctions = `
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
`;

export const velocityFragmentShader = `
uniform sampler2D uPositions;
uniform sampler2D uVelocities;
uniform sampler2D uOriginalPositions;
uniform vec3 uMouse;         // Mouse position in world space
uniform vec3 uMouseVel;      // Mouse velocity vector
uniform float uTime;
uniform float uReturnStrength; // springStiffness
uniform float uDamping;        // viscosity
uniform float uRingRadius;     // interaction radius base
uniform float uRingDisplacement; // force multiplier
uniform float uGravityMode;    // 0 = Attract, 1 = Repel

varying vec2 vUv;

${shaderNoiseFunctions}

void main() {
    vec2 uv = vUv;
    
    vec3 pos = texture2D(uPositions, uv).xyz;
    vec3 vel = texture2D(uVelocities, uv).xyz;
    vec3 originalOffset = texture2D(uOriginalPositions, uv).xyz;

    // Calculate target position (relative to mouse)
    // The cloud follows the mouse, so the "home" is mouse + offset
    vec3 homePos = uMouse + originalOffset;

    // --- 1. VARITATIE: Calculate unique properties per pixel ---
    // This ensures they don't move as a single block.
    float noiseVal = snoise(originalOffset.xy * 0.05); // Use originalOffset for fixed variation
    float mass = 1.0 + (noiseVal * 0.5); // Mass varies between 0.5 and 1.5
    
    // Local radius sensitivity
    // We scale uRingRadius (UI) by this local factor
    // Base radius from UI + variation
    float baseRadius = uRingRadius * 2.0;
    float localRadius = baseRadius + (noiseVal * 20.0); // Everyone has slightly different sensitivity

    // --- 2. Fluid Inertia & Homing (The 'Lag' effect) ---
    vec3 homeDir = homePos - pos;
    
    // Spring stiffness (uReturnStrength from UI)
    // Low value = lazy/heavy liquid
    // User requested low stiffness for "drifting back"
    float springStiffness = uReturnStrength * 0.5; 
    
    // Add spring force to velocity
    // Heavier particles might return slower? Let's apply mass here too for consistency
    vel += (homeDir * springStiffness) / mass;

    // --- 3. Velocity-Based Repulsion (The 'Wake') ---
    vec3 mouseDiff = pos - uMouse;
    float dist = length(mouseDiff);
    
    // Mouse speed
    float mouseSpeed = length(uMouseVel);

    // FIX 2: ONLY FORCE ON MOVEMENT
    // If mouseSpeed is low, force is zero.
    if (dist < localRadius && mouseSpeed > 0.01) {
        vec3 pushDir = normalize(mouseDiff);
        
        // FIX 3: FALLOFF: Exponential force
        // smoothstep(edge0, edge1, x) gives 0.0 if x > edge0 (outside circle)
        // and goes to 1.0 as x goes to 0 (center).
        // Note: smoothstep(min, max, value) returns 0 if value < min, 1 if value > max.
        // We want 1.0 at dist=0 and 0.0 at dist=radius.
        // So we use smoothstep(radius, 0.0, dist) -> this is standard GLSL trick to invert
        float interaction = smoothstep(localRadius, 0.0, dist);
        
        // The Power function (4.0) ensures the force is HUGE at center
        // but weak at edges. Prevents 'far' pixels from moving too much.
        interaction = pow(interaction, 4.0); 
        
        // Force calculation
        // Strictly coupled to mouse speed
        float force = interaction * mouseSpeed * uRingDisplacement * 2.0; // Increased multiplier due to pow()
        
        if (uGravityMode > 0.5) {
            // Repel
            vel += (pushDir * force) / mass;
        } else {
            // Attract (Invert force)
            vel -= (pushDir * force) / mass;
        }
    }

    // --- 4. Viscosity (Damping) ---
    // Crucial for the "oil/water" feel
    // Add variation to damping too!
    float damping = 0.90 + (noiseVal * 0.05); // Some are 'smoother' than others
    vel *= damping; 

    gl_FragColor = vec4(vel, 1.0);
}
`;

export const velocityVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
