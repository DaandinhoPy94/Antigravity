import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { FBOParticles } from './components/FBOParticles';
import { SceneBackground } from './components/SceneBackground';
import { Loader } from '@react-three/drei';
import { Leva } from 'leva';

const App: React.FC = () => {
  return (
    <div className="relative w-full h-screen bg-white">
      <Leva collapsed={false} />
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 z-10 p-8 text-black pointer-events-none">
        <h1 className="text-4xl font-bold tracking-tighter mb-2 bg-gradient-to-r from-cyan-400 to-blue-600 bg-clip-text text-transparent">
          GPGPU Particles
        </h1>
        <p className="text-sm text-gray-600 max-w-md font-light leading-relaxed">
          A simulation of 65,536 particles computed entirely on the GPU using Frame Buffer Objects (FBO).
          Move your mouse to interact with the field via a custom repulsion shader.
        </p>
        <div className="mt-4 flex gap-4 text-xs font-mono text-cyan-500/80">
          <span className="border border-cyan-500/30 px-2 py-1 rounded">Three.js</span>
          <span className="border border-cyan-500/30 px-2 py-1 rounded">GLSL Shaders</span>
          <span className="border border-cyan-500/30 px-2 py-1 rounded">Poisson Sampling</span>
        </div>
      </div>

      {/* 3D Scene */}
      <Canvas
        camera={{ position: [0, 0, 45], fov: 35 }}
        dpr={[1, 2]} // Handle high DPI screens
        gl={{ antialias: false, alpha: false }} // Optimize performance
      >
        <SceneBackground />
        <Suspense fallback={null}>
          <FBOParticles />
        </Suspense>
      </Canvas>
      <Loader />
    </div>
  );
};

export default App;