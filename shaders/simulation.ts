
/**
 * SIMULATION FRAGMENT SHADER
 * This runs on the GPU to update particle positions every frame.
 * It acts as the "Physics Engine".
 */

export const simulationFragmentShader = `
uniform sampler2D uPositions;
uniform sampler2D uOriginalPositions;
uniform vec2 uMouse;
uniform vec2 uMouseVel; // New: Mouse Velocity
uniform float uAspect; // New: Aspect Ratio
uniform float uGravityMode; // New: 0 = Attract, 1 = Repel
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
  // We use the w component for velocity magnitude storage for the render shader
  float life = currentPos.w; 
  
  // Calculate velocity (current - previous position would be ideal, but we modify pos directly here)
  // So we will calculate the "force" applied this frame
  vec3 velocity = vec3(0.0);

  // 1. RETURN TO HOME
  // Particles always try to go back to their original position
  vec3 homeDir = refPos - pos;
  float returnSpeed = uReturnStrength; // Use UI control
  velocity += homeDir * returnSpeed;

  // 2. MOUSE INTERACTION (Repulsion / Attraction)
  // Adjust positions for aspect ratio to ensure circular interaction
  vec2 aspectMouse = uMouse;
  aspectMouse.x *= uAspect;
  vec2 aspectPos = pos.xy;
  aspectPos.x *= uAspect;

  // Calculate distance and direction
  vec2 dirToParticle = aspectPos - aspectMouse;
  float dist = length(dirToParticle);
  
  // Dynamic Radius based on mouse speed
  float mouseSpeed = length(uMouseVel);
  // Use uRingRadius from UI as base (scaled down to UV space)
  float baseRadius = uRingRadius * 0.05; 
  float dynamicRadius = baseRadius + (mouseSpeed * 4.0);
  dynamicRadius = clamp(dynamicRadius, 0.05, 0.8); // Max radius

  // Noise for organic wave effect
  float noiseVal = snoise(vec3(aspectPos.x * 3.0, aspectPos.y * 3.0, uTime * 0.5));

  // GLOBAL INFLUENCE
  // We want the mouse to affect ALL particles, not just those in a radius.
  // However, the effect should decay with distance.
  
  if (uHover > 0.5) {
      vec2 pushDir = normalize(dirToParticle);
      
      // Calculate a global force based on inverse distance
      // Add a small epsilon to prevent division by zero
      float globalForce = 1.0 / (dist * 2.0 + 0.1);
      
      // Scale by mouse speed? 
      // The user wants "movement of the mouse to ensure there is always movement".
      // So even if mouse is slow, there should be some effect, but speed makes it stronger.
      float speedFactor = 0.2 + mouseSpeed * 3.0;
      
      // Use uRingDisplacement as the master strength control
      float strength = globalForce * speedFactor * uRingDisplacement * 0.01;
      
      // Apply noise to the direction for organic feel
      float noiseInfluence = noiseVal * 0.5;
      
      if (uGravityMode > 0.5) {
          // --- ANTIGRAVITY (Repulsion) ---
          // Push away. Stronger near center.
          // We use the dynamic radius concept for the "shockwave" but keep a global weak push.
          
          float repelForce = strength;
          
          // If within the "shockwave" radius, boost the force significantly
          if (dist < dynamicRadius) {
             repelForce *= 5.0;
          }
          
          velocity.x += pushDir.x * repelForce * (1.0 + noiseInfluence);
          velocity.y += pushDir.y * repelForce * (1.0 + noiseInfluence);
          
      } else {
          // --- GRAVITY (Attraction) ---
          // Pull towards mouse.
          // Gravity usually works as 1/r^2, but for visual stability 1/r is often better.
          
          // We want a "swirling" black hole effect maybe? Or just direct pull.
          // Let's do direct pull but with a twist (curl noise) if possible? 
          // For now, direct pull.
          
          velocity.x -= pushDir.x * strength * (1.0 + noiseInfluence);
          velocity.y -= pushDir.y * strength * (1.0 + noiseInfluence);
      }
  }

  // 3. APPLY VELOCITY TO POSITION
  pos += velocity;

  // 4. FRICTION & LIMIT
  // We don't have a persistent velocity buffer, so we simulate friction by just not moving too far
  // But since we are adding to 'pos' based on 'homeDir' every frame, it acts like a spring.
  // To make it stable, we can clamp the movement.
  
  // Actually, the requested logic implies a persistent velocity model, but this shader 
  // is a position-update shader. 
  // "vel += homeDir..." implies we should have a velocity texture.
  // However, the current architecture only has uPositions and uOriginalPositions.
  // Changing to a full velocity-integration system (Position + Velocity FBOs) would be a larger refactor.
  // Given the constraints and the current code, I will simulate the effect by modifying position directly
  // but using the calculated "velocity" vector as the displacement.
  
  // To prevent explosions:
  float maxVelocity = 0.05;
  if (length(velocity) > maxVelocity) {
      velocity = normalize(velocity) * maxVelocity;
  }
  
  // Store the speed in the w component for the render shader to use for coloring
  float speed = length(velocity);
  
  gl_FragColor = vec4(pos, speed * 100.0); // Scale up speed for visual impact
}
`;

export const simulationVertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
