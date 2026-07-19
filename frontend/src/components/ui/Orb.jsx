import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── HIGHLY REFRACTIVE, GLOSSY LIQUID GLASS SHADER ──
const LiquidGlassShader = {
  uniforms: {
    uTime: { value: 0 },
    uVolume: { value: 0 },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uVolume;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vViewPosition;

    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      
      // Dynamic fluid/water ripple displacement (physically distorts the sphere surface)
      float disp = sin(position.x * 2.8 + uTime * 1.8) * cos(position.y * 2.8 + uTime * 1.5) * 0.08;
      disp += sin(position.z * 5.0 + uTime * 3.0) * uVolume * 0.12;
      
      vec3 displaced = position + normal * disp;
      vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uVolume;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vViewPosition;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      
      // Fresnel Reflection: outer edges are reflective/opaque, center is highly transparent
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
      
      // Reflection vector for realistic specular highlights
      vec3 reflectDir = reflect(-viewDir, normal);
      
      // Highlight 1: Studio softbox light specular reflection (creates the wet/glossy look)
      float spec1 = pow(max(0.0, dot(reflectDir, normalize(vec3(0.5, 1.2, 0.5)))), 18.0) * 0.65;
      
      // Highlight 2: Secondary bottom fill specular reflection
      float spec2 = pow(max(0.0, dot(reflectDir, normalize(vec3(-0.8, -0.6, 0.8)))), 28.0) * 0.35;
      
      // Premium violet and blue liquid color layers
      vec3 baseColor = vec3(0.1, 0.07, 0.22); // Deep transparent violet-blue base
      vec3 electricPurple = vec3(0.58, 0.44, 0.98); 
      vec3 electricBlue = vec3(0.25, 0.55, 0.95);
      
      // Wave currents swirling inside the transparent liquid orb
      float wave = sin(vPosition.y * 3.5 + uTime * 1.5) * 0.5 + 0.5;
      vec3 fluidGlow = mix(electricPurple, electricBlue, wave);
      
      // Combine base transparent liquid with edge fresnel glow
      vec3 color = mix(baseColor, fluidGlow, fresnel * 0.85);
      
      // Overlay the glossy specular highlights (pure white)
      color += vec3(spec1 + spec2) * (1.0 + uVolume * 0.4);
      
      // Transparency: Center is highly transparent (0.15) to see the inner core nucleus,
      // edges (fresnel) and glossy spots are opaque.
      float alpha = 0.15 + (fresnel * 0.75) + (spec1 * 0.3);
      
      gl_FragColor = vec4(color, alpha);
    }
  `
};

// ── SCROLL CAMERA FLYTHROUGH CONTROLLER ──
function ScrollCameraController() {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalScroll > 0 ? window.scrollY / totalScroll : 0;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useFrame((state) => {
    const p = scrollProgress;
    let targetX = 0.75; 
    let targetY = 0.0;
    let targetZ = 2.9;

    if (p < 0.25) {
      targetX = 0.75;
      targetY = 0.0;
      targetZ = 2.9;
    } else if (p < 0.5) {
      const t = (p - 0.25) / 0.25;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(0.75, -0.75, ease);
      targetY = THREE.MathUtils.lerp(0.0, 0.1, ease);
      targetZ = THREE.MathUtils.lerp(2.9, 2.65, ease);
    } else if (p < 0.75) {
      const t = (p - 0.5) / 0.25;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(-0.75, 0.0, ease);
      targetY = THREE.MathUtils.lerp(0.1, -0.1, ease);
      targetZ = THREE.MathUtils.lerp(2.65, 2.05, ease);
    } else {
      const t = (p - 0.75) / 0.25;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(0.0, 0.45, ease);
      targetY = THREE.MathUtils.lerp(-0.1, 0.0, ease);
      targetZ = THREE.MathUtils.lerp(2.05, 3.1, ease);
    }

    // Hover camera drift
    const time = state.clock.getElapsedTime();
    const hoverX = Math.sin(time * 0.4) * 0.05;
    const hoverY = Math.cos(time * 0.3) * 0.05;

    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX + hoverX, 0.05);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY + hoverY, 0.05);
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, 0.05);
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

// ── ORBITAL NEURAL RINGS ──
function NeuralRing({ radius, color, rotationSpeed, tiltX, tiltZ, uVolumeRef }) {
  const ringRef = useRef();

  useFrame((state) => {
    if (!ringRef.current) return;
    const time = state.clock.getElapsedTime();
    const speedMultiplier = 1.0 + uVolumeRef.current * 2.0;
    ringRef.current.rotation.y = time * rotationSpeed * speedMultiplier;
  });

  return (
    <group ref={ringRef} rotation={[tiltX, 0, tiltZ]}>
      <mesh>
        <torusGeometry args={[radius, 0.005, 8, 120]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0.3} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// ── ORBITAL PARTICLE CORONA SYSTEM ──
function OrbitalParticleCorona({ uVolumeRef }) {
  const pointsRef = useRef();
  const count = 350;

  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.1 + Math.random() * 1.4;
      
      pos[i * 3] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.7;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
      
      spd[i] = 0.25 + Math.random() * 0.35;
    }
    return [pos, spd];
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const time = state.clock.getElapsedTime();
    const positionAttr = pointsRef.current.geometry.attributes.position;
    
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];
      
      const angleOffset = time * speeds[i] * (1.0 + uVolumeRef.current * 3.0);
      const radius = Math.sqrt(x * x + z * z);
      const baseAngle = Math.atan2(z, x) + angleOffset;
      
      positionAttr.setX(i, Math.cos(baseAngle) * radius);
      positionAttr.setZ(i, Math.sin(baseAngle) * radius);
      
      // Particle oscillation
      positionAttr.setY(i, positionAttr.getY(i) + Math.sin(time * 2.0 + i) * 0.0018 * (1.0 + uVolumeRef.current * 4.0));
    }
    positionAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        color="#a78bfa"
        transparent
        opacity={0.55}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ── NEXT GEN AI CORE COMPONENT ASSEMBLY ──
function AICoreAssembly({ turnState, volume }) {
  const coreRef = useRef();
  const shellRef = useRef();
  const shaderRef = useRef();
  const volumeRef = useRef(0);

  // Keep volume updated for subcomponents
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Uniform setup
  const uniforms = useMemo(() => {
    return {
      uTime: { value: 0 },
      uVolume: { value: 0 }
    };
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    // Update uniforms
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = time;
      
      // Calculate dynamic volume response target
      const targetVolume = turnState === 'listening' 
        ? volume 
        : turnState === 'processing' 
          ? 0.45 
          : turnState === 'ai_speaking' 
            ? 0.2 + Math.sin(time * 15) * 0.15 
            : 0;
            
      shaderRef.current.uniforms.uVolume.value = THREE.MathUtils.lerp(
        shaderRef.current.uniforms.uVolume.value,
        targetVolume,
        0.1
      );
      
      volumeRef.current = shaderRef.current.uniforms.uVolume.value;
    }

    // Scale breathing animation matching turn state
    let baseScale = 1.0;
    if (turnState === 'listening') baseScale = 0.92; // contracts slightly
    if (turnState === 'processing') baseScale = 1.1; // expands
    if (turnState === 'ai_speaking') baseScale = 1.05 + Math.sin(time * 12) * 0.05;

    const breathe = baseScale + Math.sin(time * 1.2) * 0.02;
    if (coreRef.current) {
      coreRef.current.scale.lerp(new THREE.Vector3(breathe, breathe, breathe), 0.1);
    }
  });

  return (
    <group ref={coreRef}>
      
      {/* 1. Pulse Core Glowing Nucleus (Visible inside the transparent liquid orb) */}
      <mesh>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial 
          color="#ffffff" 
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh scale={[1.2, 1.2, 1.2]}>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshBasicMaterial 
          color="#d8b4fe" 
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 2. Transparent Liquid Orb (Deforming plasma glass bubble container) */}
      <mesh ref={shellRef}>
        <sphereGeometry args={[0.74, 64, 64]} />
        <shaderMaterial
          ref={shaderRef}
          vertexShader={LiquidGlassShader.vertexShader}
          fragmentShader={LiquidGlassShader.fragmentShader}
          uniforms={uniforms}
          transparent={true}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Tilted Concentric Neural Rings */}
      <NeuralRing 
        radius={1.05} 
        color="#a78bfa" 
        rotationSpeed={0.45} 
        tiltX={Math.PI / 4} 
        tiltZ={Math.PI / 6} 
        uVolumeRef={volumeRef}
      />
      <NeuralRing 
        radius={1.22} 
        color="#60a5fa" 
        rotationSpeed={-0.35} 
        tiltX={-Math.PI / 3} 
        tiltZ={Math.PI / 8} 
        uVolumeRef={volumeRef}
      />
      <NeuralRing 
        radius={1.38} 
        color="#c084fc" 
        rotationSpeed={0.25} 
        tiltX={Math.PI / 6} 
        tiltZ={-Math.PI / 4} 
        uVolumeRef={volumeRef}
      />

      {/* 4. Particle Corona System */}
      <OrbitalParticleCorona uVolumeRef={volumeRef} />

    </group>
  );
}

// ── EXPORT MAIN ENTRY POINT ORB CANVAS ──
export default function Orb({ turnState = 'idle', volume = 0, isHero = false }) {
  const [hasWebGL, setHasWebGL] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) setHasWebGL(false);
    } catch {
      setHasWebGL(false);
    }
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  if (reducedMotion || !hasWebGL) {
    // Fallback UI
    const size = turnState === 'listening' ? 140 + volume * 40 : 140;
    return (
      <div style={{
        width: `${size}px`,
        height: `${size}px`,
        background: 'radial-gradient(circle at center, #ffffff 0%, #8b5cf6 40%, transparent 80%)',
        borderRadius: '50%',
        boxShadow: '0 0 40px rgba(139, 92, 246, 0.4)',
        filter: 'blur(2px)',
        margin: '0 auto',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }} />
    );
  }

  return (
    <div 
      className="orb-canvas-container" 
      style={{ 
        width: isHero ? '100vw' : '100%', 
        height: isHero ? '100vh' : '100%', 
        position: isHero ? 'fixed' : 'relative',
        top: 0,
        left: 0,
        zIndex: isHero ? 1 : 'auto',
        pointerEvents: 'none'
      }}
    >
      <Canvas 
        camera={{ position: [0, 0, 3.2], fov: 60 }}
        style={{ pointerEvents: 'none' }}
      >
        <ambientLight intensity={0.2} />
        <directionalLight position={[1, 3, 2]} intensity={1.2} color="#ffffff" />
        <AICoreAssembly turnState={turnState} volume={volume} />
        {isHero && <ScrollCameraController />}
      </Canvas>
    </div>
  );
}
