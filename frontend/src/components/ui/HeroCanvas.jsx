import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// Specialized shader for the AI Core in the Hero sequence
const CoreShader = {
  uniforms: {
    uTime: { value: 0 },
    uVolume: { value: 0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uPhase: { value: 0 },
    uScroll: { value: 0 }
  },
  vertexShader: `
    uniform float uTime;
    uniform float uVolume;
    uniform float uPhase;
    uniform float uScroll;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vViewPosition;

    float wave(vec3 p, float speed, float scale) {
      return sin(p.x * scale + uTime * speed) * cos(p.y * scale + uTime * speed) * sin(p.z * scale + uTime * speed);
    }

    void main() {
      vPosition = position;
      
      // Calculate organic displacement based on the current active timeline phase
      float disp = wave(position, 1.2, 2.0) * 0.1; // Base breath
      
      if (uPhase == 0.0 || uPhase == 1.0) {
        // Scanning phase: fast horizontal ripples
        disp += sin(position.y * 22.0 + uTime * 8.0) * 0.03;
      } else if (uPhase == 3.0) {
        // Voice rehearsal phase: react to volume
        disp += wave(position * 3.5, 4.0, 7.0) * (0.05 + uVolume * 0.25);
      } else if (uPhase == 4.0) {
        // Coding phase: computational sharper deformations
        disp += abs(wave(position * 4.0, 5.0, 9.0)) * 0.08;
      } else if (uPhase == 6.0) {
        // Success phase: expanded smooth energy
        disp += wave(position * 1.5, 1.8, 2.5) * 0.15;
      }

      // Add scroll deformation
      disp += wave(position * 2.5, 0.5, 5.0) * uScroll * 0.12;

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
    uniform float uPhase;
    uniform float uVolume;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vViewPosition;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);
      
      vec3 reflectDir = reflect(-viewDir, normal);
      vec2 refCoord = reflectDir.xy * 0.5 + 0.5;
      
      // Mirror specular spots
      float box = smoothstep(0.4, 0.0, length(refCoord - vec2(0.5, 0.85)));
      float spec1 = pow(box, 3.0) * 0.45;
      
      float strip = smoothstep(0.08, 0.0, abs(refCoord.x - 0.22)) * smoothstep(0.9, 0.1, refCoord.y);
      float spec2 = strip * 0.22;
      
      vec3 cursorLightDir = normalize(vec3(uMouse.x * 2.0, uMouse.y * 2.0, 1.0));
      float lightMouse = max(0.0, dot(reflectDir, cursorLightDir));
      float specMouse = pow(lightMouse, 32.0) * 0.7;
      
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.5);
      
      // Adaptive base color depending on pipeline phase
      vec3 baseColor = vec3(0.01, 0.01, 0.015);
      
      if (uPhase == 0.0 || uPhase == 1.0) {
        // Scan glow: soft cyan/silver
        float scanLine = sin(vPosition.y * 40.0 - uTime * 6.0) * 0.5 + 0.5;
        baseColor += vec3(0.005, 0.02 * scanLine, 0.03 * scanLine);
      } else if (uPhase == 3.0) {
        // Voice rehearsal: warm glow reacting to audio volume
        baseColor += vec3(0.03, 0.03, 0.04) * (1.0 + uVolume * 2.0);
      } else if (uPhase == 4.0) {
        // Coding: computational grid look
        float grid = step(0.92, sin(vPosition.x * 30.0)) * step(0.92, sin(vPosition.y * 30.0));
        baseColor += vec3(grid * 0.08);
      } else if (uPhase == 6.0) {
        // Success: bright premium silver
        baseColor += vec3(0.08, 0.08, 0.1);
      }
      
      vec3 color = mix(baseColor, vec3(0.95), spec1 + spec2 + specMouse);
      
      // Rim glow
      color += vec3(fresnel * 0.38);
      color = mix(color, vec3(0.92, 0.92, 0.96), fresnel * 0.45);
      
      gl_FragColor = vec4(color, 0.9);
    }
  `
};

// Cinematic Camera Controller: Handles scroll-timeline coordinate pathways
function CameraController({ scrollProgress }) {
  useFrame((state) => {
    const p = scrollProgress; // 0 to 1
    
    let targetX = 0.0;
    let targetY = 0.0;
    let targetZ = 7.0; // Start far away in darkness
    
    // Chapter 1: The AI Awakens (0.0 to 0.125)
    if (p < 0.125) {
      const t = p / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = 0.0;
      targetY = 0.0;
      targetZ = THREE.MathUtils.lerp(7.0, 3.2, ease);
    } 
    // Chapter 2: The Resume Enters (0.125 to 0.25)
    else if (p < 0.25) {
      const t = (p - 0.125) / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(0.0, 0.8, ease);
      targetY = 0.0;
      targetZ = THREE.MathUtils.lerp(3.2, 2.8, ease);
    } 
    // Chapter 3: Panel Materializes (0.25 to 0.375)
    else if (p < 0.375) {
      const t = (p - 0.25) / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(0.8, 0.0, ease);
      targetY = THREE.MathUtils.lerp(0.0, 0.4, ease);
      targetZ = THREE.MathUtils.lerp(2.8, 3.5, ease);
    } 
    // Chapter 4: Conversation Begins (0.375 to 0.5)
    else if (p < 0.5) {
      const t = (p - 0.375) / 0.125;
      const ease = t * t * (3 - 2 * t);
      const angle = ease * Math.PI * 0.45;
      targetX = Math.sin(angle) * 1.5;
      targetY = 0.2;
      targetZ = Math.cos(angle) * 2.8;
    } 
    // Chapter 5: Coding Interview (0.5 to 0.625)
    else if (p < 0.625) {
      const t = (p - 0.5) / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(1.2, -0.9, ease);
      targetY = THREE.MathUtils.lerp(0.2, -0.4, ease);
      targetZ = THREE.MathUtils.lerp(2.2, 2.0, ease);
    } 
    // Chapter 6: Analysis Engine (0.625 to 0.75)
    else if (p < 0.75) {
      const t = (p - 0.625) / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = THREE.MathUtils.lerp(-0.9, 0.0, ease);
      targetY = THREE.MathUtils.lerp(-0.4, 1.4, ease);
      targetZ = THREE.MathUtils.lerp(2.0, 2.5, ease);
    } 
    // Chapter 7: Resume Evolution (0.75 to 0.875)
    else if (p < 0.875) {
      const t = (p - 0.75) / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = 0.0;
      targetY = THREE.MathUtils.lerp(1.4, 0.0, ease);
      targetZ = THREE.MathUtils.lerp(2.5, 2.3, ease);
    } 
    // Chapter 8: Success Placement (0.875 to 1.0)
    else {
      const t = (p - 0.875) / 0.125;
      const ease = t * t * (3 - 2 * t);
      targetX = 0.0;
      targetY = THREE.MathUtils.lerp(0.0, -0.3, ease);
      targetZ = THREE.MathUtils.lerp(2.3, 3.8, ease);
    }
    
    // Constant slow drone floating drift
    const time = state.clock.getElapsedTime();
    const driftX = Math.sin(time * 0.25) * 0.05;
    const driftY = Math.cos(time * 0.2) * 0.05;
    
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX + driftX, 0.04);
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, targetY + driftY, 0.04);
    state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, 0.04);
    
    state.camera.lookAt(0, 0, 0);
  });

  return null;
}

// 3D Glass Morphing Resume Card
function ResumeCard({ scrollProgress }) {
  const ref = useRef();
  
  const p2 = Math.max(0, Math.min(1, (scrollProgress - 0.125) / 0.125));
  const p7 = Math.max(0, Math.min(1, (scrollProgress - 0.75) / 0.125));
  const p8 = Math.max(0, Math.min(1, (scrollProgress - 0.875) / 0.125));

  useFrame((state) => {
    if (!ref.current) return;
    const time = state.clock.getElapsedTime();
    
    let targetPos = new THREE.Vector3(0, 5, -5);
    let targetRot = new THREE.Vector3(0, 0, 0);
    
    if (scrollProgress < 0.125) {
      targetPos.set(0, 4, -4);
    } else if (scrollProgress < 0.25) {
      // Chapter 2: Drifts down from top with tilt
      const ease = p2 * p2 * (3 - 2 * p2);
      targetPos.x = THREE.MathUtils.lerp(-2.5, -0.8, ease);
      targetPos.y = THREE.MathUtils.lerp(1.8, 0.0, ease);
      targetPos.z = THREE.MathUtils.lerp(-0.8, 0.4, ease);
      
      targetRot.x = 0.2;
      targetRot.y = -0.4;
      targetRot.z = 0.05;
    } else if (scrollProgress < 0.75) {
      // Chapter 3, 4, 5, 6: Hidden/Dissolved
      targetPos.set(0, -4, -4);
    } else if (scrollProgress < 0.875) {
      // Chapter 7: Evolution
      const ease = p7 * p7 * (3 - 2 * p7);
      targetPos.x = 0.0;
      targetPos.y = 0.0;
      targetPos.z = THREE.MathUtils.lerp(-1.0, 1.25, ease);
      
      targetRot.x = 0;
      targetRot.y = 0;
      targetRot.z = 0;
    } else {
      // Chapter 8: Success
      const ease = p8 * p8 * (3 - 2 * p8);
      targetPos.x = 0.0;
      targetPos.y = THREE.MathUtils.lerp(0.0, 2.2, ease);
      targetPos.z = THREE.MathUtils.lerp(1.25, 0.6, ease);
      
      targetRot.x = -0.15;
      targetRot.y = 0;
      targetRot.z = 0;
    }

    const hoverY = Math.sin(time * 0.8) * 0.04;
    ref.current.position.copy(targetPos);
    ref.current.position.y += hoverY;
    
    ref.current.rotation.x = targetRot.x + Math.sin(time * 0.4) * 0.015;
    ref.current.rotation.y = targetRot.y + Math.cos(time * 0.3) * 0.015;
    ref.current.rotation.z = targetRot.z;
  });

  const showResume = (scrollProgress >= 0.125 && scrollProgress < 0.24) || (scrollProgress >= 0.75);

  return (
    <group ref={ref}>
      {showResume && (
        <Html transform distanceFactor={3.0} pointerEvents="none">
          <div className={`resume-3d-card ${scrollProgress >= 0.75 ? 'evolved' : ''} ${p2 > 0.85 && scrollProgress < 0.25 ? 'dissolving' : ''}`}>
            {scrollProgress >= 0.125 && scrollProgress < 0.25 && <div className="resume-laser-sweep" />}
            
            <div className="resume-header">
              <span className="avatar-placeholder" />
              <div>
                <div className="name">ALEX CHEN</div>
                <div className="role">SOFTWARE ENGINEER</div>
              </div>
              <div className="score-badge">
                ATS: {scrollProgress >= 0.75 ? Math.min(95, Math.round(65 + p7 * 30)) : 65}%
              </div>
            </div>
            
            <div className="resume-section-title">EXPERIENCE</div>
            <div className="resume-item">
              <div className="item-title">Backend Developer @ CloudCorp</div>
              <div className="item-desc">
                {scrollProgress >= 0.75 
                  ? '• Re-architected caching nodes handling 150K req/sec, reducing retrieval latencies by 42%.' 
                  : '• Maintained existing API databases and assisted with troubleshooting backend server nodes.'}
              </div>
            </div>
            
            <div className="resume-section-title">TECHNICAL SKILLS</div>
            <div className="skills-row">
              <span className="skill-tag active">Python</span>
              <span className="skill-tag active">FastAPI</span>
              <span className="skill-tag active">Redis</span>
              {scrollProgress >= 0.75 && <span className="skill-tag bonus">System Design</span>}
              {scrollProgress >= 0.75 && <span className="skill-tag bonus">Concurrency</span>}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// 3D Orbiting Panelists (Chapter 3 & 4)
function TrinityOrbiters({ scrollProgress }) {
  const groupRef = useRef();
  
  const p3 = Math.max(0, Math.min(1, (scrollProgress - 0.25) / 0.125));
  const active = scrollProgress >= 0.25 && scrollProgress < 0.625;

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();
    
    groupRef.current.rotation.y = time * 0.12;
    
    // Scale up as they assemble from nodes
    const scale = THREE.MathUtils.lerp(0.001, 0.15, p3);
    groupRef.current.scale.set(scale, scale, scale);
  });

  if (!active) return null;

  return (
    <group ref={groupRef}>
      {/* 01: Tech Lead */}
      <group position={[1.3, 0.4, 0]}>
        <mesh>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </mesh>
        <Html transform distanceFactor={2.5} pointerEvents="none" position={[0, -1.3, 0]}>
          <div className="panelist-card">
            <div className="panelist-avatar">TL</div>
            <div>
              <div className="panelist-name">TECH LEAD</div>
              <div className="panelist-status">READY // 100%</div>
            </div>
          </div>
        </Html>
      </group>

      {/* 02: Systems Architect */}
      <group position={[-0.9, -0.8, 0.8]}>
        <mesh>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </mesh>
        <Html transform distanceFactor={2.5} pointerEvents="none" position={[0, -1.3, 0]}>
          <div className="panelist-card">
            <div className="panelist-avatar">SA</div>
            <div>
              <div className="panelist-name">SYS ARCHITECT</div>
              <div className="panelist-status">READY // 100%</div>
            </div>
          </div>
        </Html>
      </group>

      {/* 03: HR Director */}
      <group position={[-0.4, 0.6, -1.1]}>
        <mesh>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} />
        </mesh>
        <Html transform distanceFactor={2.5} pointerEvents="none" position={[0, -1.3, 0]}>
          <div className="panelist-card">
            <div className="panelist-avatar">HR</div>
            <div>
              <div className="panelist-name">HR DIRECTOR</div>
              <div className="panelist-status">READY // 100%</div>
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
}

// Interactive Code Typing Simulator (Chapter 5)
function CodeSandboxPanel({ active }) {
  const [codeText, setCodeText] = useState("");
  const fullCode = "def findNodes(root):\n  if not root:\n    return []\n  return [root.val] + \\\n    findNodes(root.left) + \\\n    findNodes(root.right)";

  useEffect(() => {
    if (!active) {
      setCodeText("");
      return;
    }
    let index = 0;
    const interval = setInterval(() => {
      setCodeText(fullCode.substring(0, index));
      index += 2; // type fast
      if (index > fullCode.length) {
        clearInterval(interval);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div style={{ minWidth: '190px' }}>
      <div className="floating-hud-title">COMPILER_SANDBOX</div>
      <div className="code-sim-container" style={{ whiteSpace: 'pre', textAlign: 'left' }}>
        {codeText}
        <span className="code-sim-cursor" />
      </div>
    </div>
  );
}

// Expanding Radar Diagnostic Panel (Chapter 6)
function RadarPanel({ active }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setPct(1), 150);
      return () => clearTimeout(t);
    } else {
      setPct(0);
    }
  }, [active]);

  // Pentagon points mapping
  const p1_y = 50 - (40 * pct * 0.94);
  const p2_x = 50 + (40 * pct * 0.88 * Math.cos(-Math.PI/10));
  const p2_y = 50 - (40 * pct * 0.88 * Math.sin(-Math.PI/10));
  const p3_x = 50 + (40 * pct * 0.91 * Math.cos(-13*Math.PI/10));
  const p3_y = 50 - (40 * pct * 0.91 * Math.sin(-13*Math.PI/10));
  const p4_x = 50 + (40 * pct * 0.89 * Math.cos(-17*Math.PI/10));
  const p4_y = 50 - (40 * pct * 0.89 * Math.sin(-17*Math.PI/10));
  const p5_x = 50 + (40 * pct * 0.95 * Math.cos(-9*Math.PI/10));
  const p5_y = 50 - (40 * pct * 0.95 * Math.sin(-9*Math.PI/10));
  
  const pointsStr = `${50},${p1_y} ${p2_x},${p2_y} ${p3_x},${p3_y} ${p4_x},${p4_y} ${p5_x},${p5_y}`;

  return (
    <div style={{ minWidth: '180px' }}>
      <div className="floating-hud-title">DIAGNOSTIC_RADAR</div>
      <div className="radar-chart-container">
        <svg className="radar-svg" viewBox="0 0 100 100">
          <polygon points="50,10 88,38 73,82 27,82 12,38" className="radar-grid" />
          <polygon points="50,30 69,44 61,66 39,66 31,44" className="radar-grid" />
          
          <line x1="50" y1="50" x2="50" y2="10" className="radar-axis" />
          <line x1="50" y1="50" x2="88" y2="38" className="radar-axis" />
          <line x1="50" y1="50" x2="73" y2="82" className="radar-axis" />
          <line x1="50" y1="50" x2="27" y2="82" className="radar-axis" />
          <line x1="50" y1="50" x2="12" y2="38" className="radar-axis" />
          
          <polygon points={pointsStr} className="radar-area" />
        </svg>
      </div>
    </div>
  );
}

// 3D Floating Panel Wrapper
function FloatingPanelWrapper({ position, children, index, active }) {
  const ref = useRef();
  const speed = 0.45 + index * 0.08;
  const offset = index * 1.5;

  useFrame((state) => {
    if (!ref.current) return;
    const time = state.clock.getElapsedTime();
    
    const yOffset = Math.sin(time * speed + offset) * 0.08;
    const xOffset = Math.cos(time * (speed * 0.7) + offset) * 0.05;
    
    ref.current.position.y = position[1] + yOffset;
    ref.current.position.x = position[0] + xOffset;
    
    ref.current.rotation.y = Math.sin(time * 0.2 + index) * 0.06;
    ref.current.rotation.x = Math.cos(time * 0.15 + index) * 0.04;
  });

  return (
    <group ref={ref} position={position}>
      <Html transform distanceFactor={3.2} pointerEvents="none">
        <div className={`floating-hud-panel visible ${active ? 'active' : ''}`}>
          {children}
        </div>
      </Html>
    </group>
  );
}

// 3D Neural Connector Lines
function ConnectorLine({ start, end, active }) {
  const lineRef = useRef();

  useFrame((state) => {
    if (!lineRef.current) return;
    const time = state.clock.getElapsedTime();
    const targetOpacity = active ? 0.45 + Math.sin(time * 12.0) * 0.15 : 0.06;
    lineRef.current.material.opacity = THREE.MathUtils.lerp(
      lineRef.current.material.opacity,
      targetOpacity,
      0.08
    );
  });

  return (
    <line ref={lineRef}>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([...start, ...end]), 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        attach="material"
        color={active ? "#ffffff" : "#222222"}
        transparent
        linewidth={1}
        depthWrite={false}
      />
    </line>
  );
}

// Starfield Particle Layer
function StarsField() {
  const pointsRef = useRef();
  const count = 350;
  
  const [positions] = useState(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 16;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 16;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    return arr;
  });

  useFrame((state) => {
    if (!pointsRef.current) return;
    const time = state.clock.getElapsedTime();
    pointsRef.current.rotation.y = time * 0.002;
    pointsRef.current.rotation.x = time * 0.001;
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
        color="#ffffff"
        transparent
        opacity={0.25}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Center AI Core Mesh
function AiCoreMesh({ turnState, volume, phase, scrollProgress }) {
  const meshRef = useRef();
  const materialRef = useRef();

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return;
    
    const time = state.clock.getElapsedTime();
    materialRef.current.uniforms.uTime.value = time;
    materialRef.current.uniforms.uPhase.value = phase;
    materialRef.current.uniforms.uScroll.value = scrollProgress;
    
    // Volume level binding
    const targetVolume = turnState === 'listening' ? volume : turnState === 'processing' ? 0.35 : turnState === 'ai_speaking' ? 0.2 + Math.sin(time * 14.0) * 0.15 : 0.0;
    materialRef.current.uniforms.uVolume.value = THREE.MathUtils.lerp(
      materialRef.current.uniforms.uVolume.value,
      targetVolume,
      0.15
    );

    // Mouse pointer reflection shift
    materialRef.current.uniforms.uMouse.value.lerp(state.pointer, 0.08);

    // Core spin
    const rotSpeed = phase === 4.0 ? 0.25 : 0.08;
    meshRef.current.rotation.y = time * rotSpeed;
    meshRef.current.rotation.x = time * (rotSpeed * 0.5);

    // Breathing scale
    let baseScale = 1.15;
    if (phase === 6.0) baseScale = 1.35; // Expands on success CTA
    if (turnState === 'listening') baseScale = 1.2 + volume * 0.35;
    if (turnState === 'processing') baseScale = 1.25 + Math.sin(time * 6.0) * 0.04;
    
    const b = baseScale + Math.sin(time * 1.0) * 0.03;
    meshRef.current.scale.lerp(new THREE.Vector3(b, b, b), 0.15);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 128, 128]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={CoreShader.vertexShader}
        fragmentShader={CoreShader.fragmentShader}
        uniforms={CoreShader.uniforms}
        transparent={true}
      />
    </mesh>
  );
}

export default function HeroCanvas({ turnState, volume, phase }) {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const storyScrollHeight = window.innerHeight * 7;
      setScrollProgress(Math.min(1.0, window.scrollY / storyScrollHeight));
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Waveform animated paths for Chapter 4
  const timeRef = useRef(0);
  const [wavePath1, setWavePath1] = useState("M10,20 Q25,20 50,20 T90,20");
  const [wavePath2, setWavePath2] = useState("M10,20 Q25,20 50,20 T90,20");

  useEffect(() => {
    let animId;
    const animateWave = () => {
      timeRef.current += 0.15;
      const t = timeRef.current;
      const v = turnState === 'listening' ? volume : 0.08 + Math.sin(t * 1.2) * 0.04;
      
      const amp1 = 20 - (v * 45 * Math.sin(t * 0.8));
      const amp2 = 20 + (v * 35 * Math.cos(t * 0.9));
      
      setWavePath1(`M10,20 Q25,${amp1} 50,20 T90,20`);
      setWavePath2(`M10,20 Q25,${amp2} 50,20 T90,20`);
      
      animId = requestAnimationFrame(animateWave);
    };
    animateWave();
    return () => cancelAnimationFrame(animId);
  }, [turnState, volume]);

  // Panel positions for chapters
  const ch6Panels = [
    { id: 'p5', pos: [-1.5, 0.8, -0.3], title: "ATS_MATCH_METRIC", body: "ATS ALIGNMENT: 95%\nKEYWORDS MATCHED: 18" }
  ];

  const ch8Panels = [
    { id: 'p7', pos: [-1.4, 0.4, 0.5], title: "LINEAR // CAREER", body: "INVITATION: ROUND 02 // MASTERED" },
    { id: 'p8', pos: [1.4, 0.6, 0.3], title: "VERCEL // PLACEMENT", body: "OFFER ISSUED: SENIOR INFRA" }
  ];

  return (
    <div style={{ width: '100%', height: '100vh', position: 'sticky', top: 0, zIndex: 1, pointerEvents: 'none' }}>
      <Canvas camera={{ position: [0, 0, 7.0], fov: 60 }} style={{ pointerEvents: 'none' }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 5, 2]} intensity={1.5} color="#ffffff" />
        <pointLight position={[-4, -4, -3]} intensity={0.6} color="#ffffff" />
        
        {/* Starfield Particles */}
        <StarsField />
        
        {/* Central core */}
        <AiCoreMesh turnState={turnState} volume={volume} phase={phase} scrollProgress={scrollProgress} />
        
        {/* Chapter 2 & 7: 3D Resume Sheet */}
        <ResumeCard scrollProgress={scrollProgress} />

        {/* Chapter 3 & 4: Trinity Orbiting Avatar Badges */}
        <TrinityOrbiters scrollProgress={scrollProgress} />

        {/* Chapter 4: Voice Session Panels & SVG Waveform */}
        {phase === 3 && (
          <>
            <FloatingPanelWrapper position={[-1.4, 0.5, 0.2]} index={0} active={true}>
              <div className="floating-hud-title">LIVE_TRANSCRIPTION</div>
              <pre className="floating-hud-body" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-code)' }}>
                {turnState === 'listening' ? 'User: Speaking to the AI chamber...' : 'AI: Can you describe how you configure Redis shards?'}
              </pre>
            </FloatingPanelWrapper>
            <ConnectorLine start={[0,0,0]} end={[-1.4, 0.5, 0.2]} active={true} />

            <FloatingPanelWrapper position={[1.4, -0.4, 0.4]} index={1} active={true}>
              <div className="floating-hud-title">CADENCE_FEEDBACK</div>
              <svg className="waveform-svg" viewBox="0 0 100 40">
                <path d={wavePath1} stroke="#ffffff" fill="none" strokeWidth="1.5" />
                <path d={wavePath2} stroke="rgba(255,255,255,0.25)" fill="none" strokeWidth="1.0" />
              </svg>
              <div style={{ fontSize: '8.5px', marginTop: '6px', fontFamily: 'var(--font-code)' }}>
                PACE: {turnState === 'listening' ? '135 WPM' : 'STANDBY'}
              </div>
            </FloatingPanelWrapper>
            <ConnectorLine start={[0,0,0]} end={[1.4, -0.4, 0.4]} active={true} />
          </>
        )}

        {/* Chapter 5: Coding Sandbox Panel */}
        {phase === 4 && (
          <>
            <FloatingPanelWrapper position={[-1.3, -0.3, 0.5]} index={0} active={true}>
              <CodeSandboxPanel active={phase === 4} />
            </FloatingPanelWrapper>
            <ConnectorLine start={[0,0,0]} end={[-1.3, -0.3, 0.5]} active={true} />

            <FloatingPanelWrapper position={[1.3, 0.6, 0.2]} index={1} active={true}>
              <div className="floating-hud-title">EXECUTION_LOG</div>
              <div className="floating-hud-body" style={{ textAlign: 'left', fontFamily: 'var(--font-code)' }}>
                TEST 1: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>PASS</span> (2ms)<br />
                TEST 2: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>PASS</span> (1ms)<br />
                TEST 3: <span style={{ color: '#ffffff', fontWeight: 'bold' }}>PASS</span> (4ms)<br />
                COMPLEXITY: O(log N)
              </div>
            </FloatingPanelWrapper>
            <ConnectorLine start={[0,0,0]} end={[1.3, 0.6, 0.2]} active={true} />
          </>
        )}

        {/* Chapter 6: Radar Diagnostic Panel */}
        {phase === 5 && (
          <>
            {ch6Panels.map((panel, idx) => (
              <React.Fragment key={panel.id}>
                <FloatingPanelWrapper position={panel.pos} index={idx} active={true}>
                  <div className="floating-hud-title">{panel.title}</div>
                  <pre className="floating-hud-body" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-code)' }}>{panel.body}</pre>
                </FloatingPanelWrapper>
                <ConnectorLine start={[0,0,0]} end={panel.pos} active={true} />
              </React.Fragment>
            ))}

            <FloatingPanelWrapper position={[1.5, 0.7, -0.2]} index={1} active={true}>
              <RadarPanel active={phase === 5} />
            </FloatingPanelWrapper>
            <ConnectorLine start={[0,0,0]} end={[1.5, 0.7, -0.2]} active={true} />
          </>
        )}

        {/* Chapter 8: Placement Invitations */}
        {phase === 7 && ch8Panels.map((panel, idx) => (
          <React.Fragment key={panel.id}>
            <FloatingPanelWrapper position={panel.pos} index={idx} active={true}>
              <div className="floating-hud-title">{panel.title}</div>
              <pre className="floating-hud-body" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-code)' }}>{panel.body}</pre>
            </FloatingPanelWrapper>
            <ConnectorLine start={[0,0,0]} end={panel.pos} active={true} />
          </React.Fragment>
        ))}

        <CameraController scrollProgress={scrollProgress} />
      </Canvas>
    </div>
  );
}
