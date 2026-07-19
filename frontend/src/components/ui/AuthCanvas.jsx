import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Specialized Liquid Glass Shader for the Auth Core
const AuthCoreShader = {
  uniforms: {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uState: { value: 0 }, // 0: idle, 1: loading, 2: success, 3: error
    uPulse: { value: 0 }
  },
  vertexShader: `
    uniform float uTime;
    uniform float uState;
    uniform float uPulse;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vViewPosition;

    // Organic noise-like wave function
    float wave(vec3 p, float speed, float scale) {
      return sin(p.x * scale + uTime * speed) * cos(p.y * scale + uTime * speed) * sin(p.z * scale + uTime * speed);
    }

    void main() {
      vPosition = position;
      
      // Base breath breathing
      float disp = wave(position, 1.0, 2.0) * 0.08;
      
      if (uState == 1.0) {
        // Authenticating state: high frequency ripples + contraction
        disp = wave(position * 3.0, 6.0, 5.0) * 0.12 - 0.05;
      } else if (uState == 2.0) {
        // Success: expand core and generate large waves
        disp = wave(position * 1.5, 3.0, 2.5) * 0.25 + 0.15;
      } else if (uState == 3.0) {
        // Error: violent temporary shudder (shake)
        disp = wave(position * 8.0, 30.0, 10.0) * (0.04 * uPulse);
      }

      vec3 displacedPosition = position + normal * disp;
      vNormal = normalize(normalMatrix * normal);
      
      vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
      vViewPosition = -mvPosition.xyz;
      
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec2 uMouse;
    uniform float uTime;
    uniform float uState;
    uniform float uPulse;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vViewPosition;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      
      vec3 reflectDir = reflect(-viewDir, normal);
      vec2 refCoord = reflectDir.xy * 0.5 + 0.5;
      
      // Specular highlights
      float box = smoothstep(0.4, 0.0, length(refCoord - vec2(0.5, 0.85)));
      float spec1 = pow(box, 3.0) * 0.5;
      
      float strip = smoothstep(0.08, 0.0, abs(refCoord.x - 0.25)) * smoothstep(0.9, 0.1, refCoord.y);
      float spec2 = strip * 0.25;
      
      vec3 cursorLightDir = normalize(vec3(uMouse.x * 2.5, uMouse.y * 2.5, 1.0));
      float lightMouse = max(0.0, dot(reflectDir, cursorLightDir));
      float specMouse = pow(lightMouse, 32.0) * 0.6;
      
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);
      
      // Futuristic Dark Monochrome base color (Glass reflections)
      vec3 baseColor = vec3(0.01, 0.01, 0.012);
      
      if (uState == 1.0) {
        // Loading: energy condensing - faint white/cyan center glow
        baseColor += vec3(0.04, 0.04, 0.06);
      } else if (uState == 2.0) {
        // Success: high luminescence, bright pure white silver core
        baseColor += vec3(0.3, 0.3, 0.35);
      } else if (uState == 3.0) {
        // Error: soft elegant deep red glow
        baseColor += vec3(0.08, 0.01, 0.01) * uPulse;
      }
      
      vec3 color = mix(baseColor, vec3(0.95), spec1 + spec2 + specMouse);
      
      // Rim Glow
      color += vec3(fresnel * 0.4);
      
      // Inject highlight tints on success/error
      if (uState == 2.0) {
        color = mix(color, vec3(1.0, 1.0, 1.0), fresnel * 0.7);
      } else if (uState == 3.0) {
        color = mix(color, vec3(0.9, 0.15, 0.15), fresnel * 0.5 * uPulse);
      } else {
        color = mix(color, vec3(0.92, 0.92, 0.96), fresnel * 0.4);
      }
      
      gl_FragColor = vec4(color, 0.95);
    }
  `
};

// 3D Starfield & Particle Dust Layer
function AuthParticles({ authState }) {
  const pointsRef = useRef();
  const count = 500;
  
  const [positions, speeds, initialPositions] = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const init = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spawn particles randomly in a sphere
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 2.0 + Math.random() * 5.0;
      
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      
      init[i * 3] = x;
      init[i * 3 + 1] = y;
      init[i * 3 + 2] = z;
      
      spd[i] = 0.2 + Math.random() * 0.8;
    }
    return [pos, spd, init];
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const time = state.clock.getElapsedTime();
    const positionAttr = pointsRef.current.geometry.attributes.position;
    
    // Ambient slow drift
    pointsRef.current.rotation.y = time * 0.015;
    pointsRef.current.rotation.x = time * 0.008;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      
      if (authState === 1) {
        // Loading: particles accelerate and spiral inward towards the core
        let x = positionAttr.array[idx];
        let y = positionAttr.array[idx + 1];
        let z = positionAttr.array[idx + 2];
        
        const dist = Math.sqrt(x*x + y*y + z*z);
        if (dist > 0.1) {
          const factor = speeds[i] * 0.04;
          // Spiral vector
          x += (-x / dist - y * 0.2) * factor;
          y += (-y / dist + x * 0.2) * factor;
          z += (-z / dist) * factor;
        } else {
          // Respawn at perimeter
          const r = 5.0 + Math.random() * 2.0;
          x = (Math.random() - 0.5) * r;
          y = (Math.random() - 0.5) * r;
          z = (Math.random() - 0.5) * r;
        }
        positionAttr.array[idx] = x;
        positionAttr.array[idx + 1] = y;
        positionAttr.array[idx + 2] = z;
      } else if (authState === 2) {
        // Success: particles accelerate outward explosively
        let x = positionAttr.array[idx];
        let y = positionAttr.array[idx + 1];
        let z = positionAttr.array[idx + 2];
        const dist = Math.sqrt(x*x + y*y + z*z);
        if (dist > 0.1) {
          x += (x / dist) * speeds[i] * 0.15;
          y += (y / dist) * speeds[i] * 0.15;
          z += (z / dist) * speeds[i] * 0.15;
        }
        positionAttr.array[idx] = x;
        positionAttr.array[idx + 1] = y;
        positionAttr.array[idx + 2] = z;
      } else {
        // Idle/Error: return slowly to initial position + gentle hover
        const ix = initialPositions[idx];
        const iy = initialPositions[idx + 1];
        const iz = initialPositions[idx + 2];
        
        const hoverX = Math.sin(time * 0.3 * speeds[i]) * 0.1;
        const hoverY = Math.cos(time * 0.4 * speeds[i]) * 0.1;
        
        positionAttr.array[idx] = THREE.MathUtils.lerp(positionAttr.array[idx], ix + hoverX, 0.02);
        positionAttr.array[idx + 1] = THREE.MathUtils.lerp(positionAttr.array[idx + 1], iy + hoverY, 0.02);
        positionAttr.array[idx + 2] = THREE.MathUtils.lerp(positionAttr.array[idx + 2], iz, 0.02);
      }
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
        size={0.022}
        color="#ffffff"
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Neural Energy Ring
function NeuralRing({ authState }) {
  const ringRef = useRef();
  
  useFrame((state) => {
    if (!ringRef.current) return;
    const time = state.clock.getElapsedTime();
    
    // Rotate ring
    ringRef.current.rotation.z = time * 0.15;
    ringRef.current.rotation.x = Math.PI * 0.3 + Math.sin(time * 0.2) * 0.08;
    
    // Adjust scale and opacity based on state
    let targetScale = 1.6;
    let targetOpacity = 0.12;
    if (authState === 1) {
      targetScale = 1.3 + Math.sin(time * 8.0) * 0.05;
      targetOpacity = 0.3;
    } else if (authState === 2) {
      targetScale = 3.0;
      targetOpacity = 0.0;
    }
    
    ringRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);
    ringRef.current.material.opacity = THREE.MathUtils.lerp(ringRef.current.material.opacity, targetOpacity, 0.08);
  });

  return (
    <mesh ref={ringRef}>
      <ringGeometry args={[0.98, 1.0, 64]} />
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.12} depthWrite={false} />
    </mesh>
  );
}

// 3D Core Controller
function CoreController({ authState, isHovered, mousePos }) {
  const meshRef = useRef();
  const materialRef = useRef();
  const [pulse, setPulse] = useState(0);

  // Error shudder effect
  useEffect(() => {
    if (authState === 3) {
      setPulse(1.0);
      const timer = setTimeout(() => {
        let t = 1.0;
        const interval = setInterval(() => {
          t -= 0.05;
          setPulse(Math.max(0, t));
          if (t <= 0) clearInterval(interval);
        }, 30);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [authState]);

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return;
    const time = state.clock.getElapsedTime();
    
    materialRef.current.uniforms.uTime.value = time;
    materialRef.current.uniforms.uState.value = authState;
    materialRef.current.uniforms.uPulse.value = pulse;
    
    // Smooth mouse position binding
    materialRef.current.uniforms.uMouse.value.lerp(state.pointer, 0.08);
    
    // Slow core rotation
    let spinSpeed = 0.06;
    if (authState === 1) spinSpeed = 0.3; // Spin faster when authenticating
    if (authState === 2) spinSpeed = 0.02; 
    
    meshRef.current.rotation.y = time * spinSpeed;
    meshRef.current.rotation.x = time * (spinSpeed * 0.4);

    // Breathes scale
    let baseScale = 1.25;
    if (authState === 1) {
      baseScale = 1.1 + Math.sin(time * 12.0) * 0.02; // tense breathing
    } else if (authState === 2) {
      baseScale = 1.7; // expand core
    } else if (isHovered) {
      baseScale = 1.35; // gentle grow on hover
    }
    
    const b = baseScale + Math.sin(time * 0.8) * 0.03;
    meshRef.current.scale.lerp(new THREE.Vector3(b, b, b), 0.08);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={AuthCoreShader.vertexShader}
        fragmentShader={AuthCoreShader.fragmentShader}
        uniforms={AuthCoreShader.uniforms}
        transparent={true}
      />
    </mesh>
  );
}

// Camera controller for Cinematic movements
function AuthCameraController({ authState }) {
  const { camera } = useThree();

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    let targetX = 0;
    let targetY = 0;
    let targetZ = 3.6;

    if (authState === 2) {
      // Zoom camera in (push forward)
      targetZ = 1.2;
    }
    
    // Slow drift movement
    const driftX = Math.sin(time * 0.15) * 0.06;
    const driftY = Math.cos(time * 0.12) * 0.06;
    
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX + driftX, 0.04);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY + driftY, 0.04);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.04);
    
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function AuthCanvas({ authState, isHovered }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Background Volumetric Fog/Light Rays */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.015) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0
        }} 
      />
      
      <Canvas camera={{ position: [0, 0, 3.6], fov: 60 }} style={{ zIndex: 1 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-2, -3, -2]} intensity={0.5} color="#ffffff" />
        
        <AuthParticles authState={authState} />
        <NeuralRing authState={authState} />
        <CoreController authState={authState} isHovered={isHovered} />
        <AuthCameraController authState={authState} />
      </Canvas>
    </div>
  );
}
