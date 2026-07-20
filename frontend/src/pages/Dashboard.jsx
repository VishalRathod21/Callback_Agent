import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import axios, { API_BASE } from '../api/client';
import Navbar from '../components/ui/Navbar';

// Starfield background layer
function StarsField() {
  const pointsRef = useRef();
  const count = 250;
  
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 5 + Math.random() * 10;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = radius * Math.cos(phi);
    }
    return arr;
  }, []);

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
        opacity={0.15}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Swirling Particle field mapping candidate intelligence
function IntelligenceParticles({ count }) {
  const pointsRef = useRef();
  
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 1.1 + Math.random() * 1.4;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = radius * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const time = state.clock.getElapsedTime();
    pointsRef.current.rotation.y = -time * 0.025;
    pointsRef.current.rotation.x = time * 0.012;
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
        size={0.025}
        color="#ffffff"
        transparent
        opacity={0.35}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Intelligence Orb Component
function IntelligenceOrb({ readinessScore, normalizedMouse, pulseTime }) {
  const groupRef = useRef();
  const innerCoreRef = useRef();
  const outerGlassRef = useRef();
  const materialRef = useRef();

  const readiness = useMemo(() => {
    return Math.max(0.15, Math.min(1.0, (readinessScore || 0) / 100));
  }, [readinessScore]);

  const particleCount = useMemo(() => {
    return Math.round(40 + readiness * 120);
  }, [readiness]);

  const shaderData = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uGlow: { value: readiness },
      uPulse: { value: 0.0 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uGlow;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        
        float wave = sin(position.x * 4.0 + uTime * 2.2) * cos(position.y * 4.0 + uTime * 2.2) * (0.04 + uGlow * 0.08);
        vec3 displaced = position + normal * wave;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uGlow;
      uniform float uPulse;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vec3 normal = normalize(vNormal);
        float fresnel = pow(0.7 - dot(normal, vec3(0.0, 0.0, 1.0)), 2.2);
        
        // Stark monochrome glow profile
        vec3 baseColor = vec3(0.96, 0.97, 1.0);
        float alpha = 0.45 + fresnel * 0.45 + uPulse * 0.25;
        
        gl_FragColor = vec4(baseColor * (0.75 + uGlow * 0.5), alpha);
      }
    `
  }), [readiness]);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(time * 0.5) * 0.15;
      
      // Drift with mouse coords
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, normalizedMouse.x * 0.4, 0.05);
      groupRef.current.position.y += THREE.MathUtils.lerp(0, normalizedMouse.y * 0.4, 0.05);
      
      groupRef.current.rotation.y = time * 0.05;
      groupRef.current.rotation.x = time * 0.02;
    }
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = time;
      
      const timeSincePulse = (Date.now() - pulseTime) / 1000;
      let pulseVal = 0;
      if (timeSincePulse < 1.2) {
        pulseVal = Math.max(0, Math.sin(timeSincePulse * 7.0) * Math.exp(-timeSincePulse * 4.0));
      }
      materialRef.current.uniforms.uPulse.value = pulseVal;
    }
  });

  return (
    <group ref={groupRef}>
      <IntelligenceParticles count={particleCount} />

      {/* Glowing Inner Intelligence Core */}
      <mesh ref={innerCoreRef}>
        <sphereGeometry args={[0.62, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={shaderData.vertexShader}
          fragmentShader={shaderData.fragmentShader}
          uniforms={shaderData.uniforms}
          transparent
        />
      </mesh>

      {/* Outer Physical Glass shell */}
      <mesh ref={outerGlassRef}>
        <sphereGeometry args={[0.98, 64, 64]} />
        <meshPhysicalMaterial
          transmission={0.96}
          roughness={0.04}
          thickness={1.7}
          ior={1.5}
          clearcoat={1.0}
          clearcoatRoughness={0.03}
          color="#ffffff"
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}

// Sparkline graph overlay in floating HUD panels
function MicroSparkline() {
  const points = useMemo(() => {
    return Array.from({ length: 12 }, () => Math.random() * 20 + 5);
  }, []);

  const path = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${idx * 8} ${30 - p}`).join(' ');

  return (
    <svg width="88" height="30" style={{ opacity: 0.6 }}>
      <path d={path} fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// React Spring / requestAnimationFrame count up effect
function CountUp({ end, duration = 1.0 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const totalFrames = 60 * duration;
    let frame = 0;
    const step = end / totalFrames;
    
    const animate = () => {
      frame++;
      if (frame <= totalFrames) {
        setVal(Math.min(Math.round(step * frame), end));
        requestAnimationFrame(animate);
      } else {
        setVal(end);
      }
    };
    requestAnimationFrame(animate);
  }, [end, duration]);
  return <span>{val}</span>;
}

const TIMELINE_NODES = {
  greeting: {
    title: "Greeting & Warmup",
    time: "00:00 - 02:15",
    confidence: 88,
    transcript: "Candidate introduced their background in machine learning and distributed systems. Spoke clearly with structured outline.",
    thoughts: "Core audio frequency analysis indicates stable baseline. Heart rate calculation suggests initial focus without anxiety.",
    waveform: [8, 25, 18, 40, 8, 12, 50, 18, 12, 25, 4, 20, 35, 18, 8],
    detailType: "metadata",
    details: {
      "Calibration Status": "SYNCHRONIZED",
      "Latency Baseline": "0.18s",
      "Language Flow": "Excellent"
    }
  },
  coding: {
    title: "Algorithmic Challenge",
    time: "02:15 - 12:45",
    confidence: 76,
    transcript: "Discussed dynamic programming approach. Explained time complexity of O(N) and space complexity of O(N).",
    thoughts: "Candidate accurately identified the subproblem formulation. Minor delay in complexity calculation corrected upon question hint.",
    waveform: [15, 50, 30, 80, 20, 18, 70, 45, 20, 60, 10, 35, 75, 20, 8],
    detailType: "code",
    code: `def solve_dp(nums):
    dp = [0] * len(nums)
    dp[0] = nums[0]
    for i in range(1, len(nums)):
        dp[i] = max(dp[i-1], nums[i])
    return dp[-1]`,
    details: {
      "Complexity Score": "O(N) time / O(N) space",
      "Compiler Result": "PASSED"
    }
  },
  behavioral: {
    title: "STAR Behavioral Assessment",
    time: "12:45 - 20:30",
    confidence: 82,
    transcript: "Presented cross-functional conflict situation using STAR format. Focused heavily on collaboration metrics.",
    thoughts: "Excellent articulation of personal contribution. Quantifiable metrics (e.g. 'reduced latency by 20%') were explicitly highlighted.",
    waveform: [12, 35, 20, 60, 15, 25, 40, 30, 20, 50, 8, 28, 45, 15, 12],
    detailType: "metadata",
    details: {
      "STAR Structure": "VALIDATED",
      "Team Empathy": "9.4/10",
      "Quantifiable Metrics": "Present"
    }
  },
  follow_up: {
    title: "System Design Extension",
    time: "20:30 - 28:15",
    confidence: 70,
    transcript: "Proposed Redis-based cache layer to optimize reads. Discussed eviction policies and stale data mitigation.",
    thoughts: "Demonstrated strong knowledge of caching architectures. Gaps identified in detailing cache-aside database write failures.",
    waveform: [25, 65, 35, 85, 30, 28, 75, 50, 30, 70, 15, 40, 80, 30, 15],
    detailType: "metadata",
    details: {
      "Scaling Competence": "Optimal",
      "Caching Trade-offs": "Explained",
      "Failure Tolerance": "Minor Gaps"
    }
  },
  completion: {
    title: "Session Diagnostics",
    time: "28:15 - End",
    confidence: 90,
    transcript: "Session finalized. AI Engine synchronized candidate metadata and calculated overall score matrix.",
    thoughts: "Overall readiness metrics updated. Session concluded with positive momentum. High technical competency verified.",
    waveform: [8, 15, 12, 25, 8, 8, 35, 15, 8, 15, 4, 12, 25, 12, 4],
    detailType: "metadata",
    details: {
      "Final Diagnostics": "VERIFIED",
      "Report Cache": "Updated",
      "Session Outcome": "COMPLETED"
    }
  }
};

const CONSTELLATION_SKILLS = [
  { id: 'dsa', name: 'DSA', cx: 200, cy: 60, rate: 84, desc: 'Data structures core theoretical logic' },
  { id: 'algorithms', name: 'Algorithms', cx: 110, cy: 160, rate: 78, desc: 'Sorting, searching & runtime complexities' },
  { id: 'communication', name: 'Communication', cx: 290, cy: 160, rate: 90, desc: 'Vocal flow, STAR layout, clarity' },
  { id: 'leadership', name: 'Leadership', cx: 330, cy: 260, rate: 82, desc: 'Conflict resolution, ownership metrics' },
  { id: 'problem_solving', name: 'Problem Solving', cx: 200, cy: 190, rate: 86, desc: 'Abstract thinking & pattern match' },
  { id: 'system_design', name: 'System Design', cx: 70, cy: 260, rate: 72, desc: 'Horizontal scaling & system limits' },
  { id: 'machine_learning', name: 'Machine Learning', cx: 200, cy: 300, rate: 80, desc: 'Feature engineering & model lifecycles' }
];

const NEURAL_LINKS = [
  { from: 'dsa', to: 'algorithms' },
  { from: 'dsa', to: 'problem_solving' },
  { from: 'algorithms', to: 'problem_solving' },
  { from: 'system_design', to: 'problem_solving' },
  { from: 'system_design', to: 'machine_learning' },
  { from: 'communication', to: 'leadership' },
  { from: 'communication', to: 'problem_solving' }
];

export default function Dashboard() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  const [pulseTime, setPulseTime] = useState(0);
  const [activeTimelineNode, setActiveTimelineNode] = useState('greeting');
  const [hoveredSkill, setHoveredSkill] = useState(null);
  
  const timerRef = useRef(null);

  // Fetch Dashboard Metrics
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE}/dashboard/${candidateId}`);
        setData(res.data);
      } catch (err) {
        console.error("Error fetching dashboard metrics:", err);
        const detailMsg = err.response?.data?.detail;
        setError(typeof detailMsg === 'string' ? detailMsg : 'Candidate telemetry record not found or access expired.');
      } finally {
        setLoading(false);
      }
    };
    if (candidateId) {
      fetchDashboardData();
    }
  }, [candidateId]);

  // Global mouse coordinates listener
  useEffect(() => {
    const handleMouseMove = (e) => {
      setMouseCoords({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const triggerPulse = () => {
    setPulseTime(Date.now());
  };

  const normalizedMouse = useMemo(() => {
    return {
      x: (mouseCoords.x / window.innerWidth) * 2 - 1,
      y: -(mouseCoords.y / window.innerHeight) * 2 + 1
    };
  }, [mouseCoords]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px', background: '#020202', color: '#ffffff' }}>
        <div style={{ position: 'relative', width: '48px', height: '48px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.05)' }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#ffffff', animation: 'spin 1s linear infinite' }} />
        </div>
        <p style={{ fontSize: '11px', color: '#888888', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
          compiling intelligence network...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dashboard-root">
        <Navbar />
        <div style={{ background: '#020202', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 24px 40px' }}>
          <div className="glass-panel" style={{ padding: '40px', maxWidth: '520px', width: '100%', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
              TELEMETRY_OFFLINE // RECORD_NOT_FOUND
            </div>
            <h3 style={{ color: '#ffffff', fontSize: '20px', marginBottom: '12px', fontWeight: 700 }}>
              Candidate Session Not Found
            </h3>
            <p style={{ color: '#888888', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
              {error || 'No candidate record was found for this ID. Start a new practice session by uploading your resume.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="capsule-btn" onClick={() => navigate('/upload')}>
                Upload Resume & Practice →
              </button>
              <button className="capsule-btn" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#a1a1aa' }} onClick={() => navigate('/')}>
                ← Return Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const {
    has_data,
    candidate_name,
    target_role,
    total_sessions,
    total_time_min,
    readiness_score,
    averages,
    score_timeline,
  } = data;

  // Handle case where candidate has no simulation telemetry data
  if (!has_data) {
    return (
      <div className="dashboard-root">
        <div className="noise-overlay" />
        <Navbar />
        
        {/* Standby 3D Canvas */}
        <div style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}>
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <ambientLight intensity={0.2} />
            <directionalLight position={[1, 2, 1]} intensity={1.0} color="#ffffff" />
            <StarsField />
            <IntelligenceOrb readinessScore={20} normalizedMouse={normalizedMouse} pulseTime={pulseTime} />
          </Canvas>
        </div>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', zIndex: 1, position: 'relative', padding: '120px 24px' }}>
          <div className="glass-panel" style={{ padding: '48px', maxWidth: '580px', width: '100%', textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>
              system_standby // no telemetry found
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', marginBottom: '14px', letterSpacing: '-0.02em' }}>
              Intelligence Room for {candidate_name}
            </h2>
            <p style={{ color: '#888888', fontSize: '13.5px', lineHeight: 1.6, marginBottom: '32px' }}>
              The chamber has not gathered any performance telemetry for <strong>{target_role || 'General Role'}</strong>. Complete a full interview or quick practice warmup to synchronize intelligence diagnostics.
            </p>
            <button className="capsule-btn" onClick={() => navigate('/upload')}>
              Initialize First Rehearsal →
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Active Live AI Room Layout
  return (
    <div className="dashboard-root">
      {/* Analog noise filter */}
      <div className="noise-overlay" />

      {/* Cursor light spotlight */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: `radial-gradient(circle 400px at ${mouseCoords.x}px ${mouseCoords.y}px, rgba(255, 255, 255, 0.015) 0%, transparent 100%)`,
        pointerEvents: 'none',
        zIndex: 1
      }} />

      {/* Core 3D Canvas Space */}
      <div style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0
      }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
          <ambientLight intensity={0.25} />
          <directionalLight position={[2, 3, 2]} intensity={1.3} color="#ffffff" />
          <pointLight position={[-3, -3, -1]} intensity={0.3} color="#ffffff" />
          <StarsField />
          <IntelligenceOrb 
            readinessScore={readiness_score} 
            normalizedMouse={normalizedMouse} 
            pulseTime={pulseTime} 
          />
        </Canvas>
      </div>

      <Navbar />

      {/* Main Command Room Container */}
      <main style={{
        flex: 1,
        maxWidth: '1240px',
        width: '100%',
        margin: '0 auto',
        padding: '110px 24px 80px',
        position: 'relative',
        zIndex: 2,
        boxSizing: 'border-box'
      }}>

        {/* Global Live Room Telemetry header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px', marginBottom: '40px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.15em' }}>
              INTELLIGENCE_ROOM // LIVE_SYNCHRONIZED
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff', margin: '4px 0 0', letterSpacing: '-0.02em' }}>
              Candidate Command Deck
            </h1>
            <p style={{ fontSize: '13px', color: '#888888', marginTop: '6px' }}>
              Candidate: <strong>{candidate_name}</strong> · Active Array: <strong>{target_role || 'General Role'}</strong>
            </p>
          </div>
          <button className="capsule-btn" onClick={() => navigate('/upload')}>
            Launch Simulation →
          </button>
        </div>

        {/* Outer Circular Floating Panels Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '48px' }}>
          
          {/* Overall Score */}
          <div className="glass-panel floating-panel-a" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.1em' }}>READINESS_INDEX</span>
                <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: '4px' }}>
                  <CountUp end={Math.round(readiness_score)} />%
                </div>
              </div>
              <MicroSparkline />
            </div>
            <p style={{ fontSize: '12px', color: '#888888', margin: '12px 0 0', lineHeight: 1.4 }}>
              Combined matrix score updating live from active neural nodes.
            </p>
          </div>

          {/* Sessions Completed */}
          <div className="glass-panel floating-panel-b" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.1em' }}>CHAMBER_LOADS</span>
                <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: '4px' }}>
                  <CountUp end={total_sessions} />
                </div>
              </div>
              <MicroSparkline />
            </div>
            <p style={{ fontSize: '12px', color: '#888888', margin: '12px 0 0', lineHeight: 1.4 }}>
              Total elapsed runtime: {total_time_min} mins across all simulation sectors.
            </p>
          </div>

          {/* Technical Index */}
          <div className="glass-panel floating-panel-a" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.1em' }}>TECHNICAL_INDEX</span>
                <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: '4px' }}>
                  <CountUp end={Math.round(averages?.technical || 0)} />%
                </div>
              </div>
              <MicroSparkline />
            </div>
            <p style={{ fontSize: '12px', color: '#888888', margin: '12px 0 0', lineHeight: 1.4 }}>
              Systems design, cache architectures, and distributed system trade-offs.
            </p>
          </div>

          {/* Coding Index */}
          <div className="glass-panel floating-panel-b" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.1em' }}>CODING_CAPACITY</span>
                <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: '4px' }}>
                  <CountUp end={Math.round(averages?.dsa || 0)} />%
                </div>
              </div>
              <MicroSparkline />
            </div>
            <p style={{ fontSize: '12px', color: '#888888', margin: '12px 0 0', lineHeight: 1.4 }}>
              DSA theoretical correctness and runtime complexity calibrations.
            </p>
          </div>

          {/* Communication Index */}
          <div className="glass-panel floating-panel-a" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.1em' }}>COMMUNICATION_FLOW</span>
                <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: '4px' }}>
                  <CountUp end={Math.round(averages?.hr || 0)} />%
                </div>
              </div>
              <MicroSparkline />
            </div>
            <p style={{ fontSize: '12px', color: '#888888', margin: '12px 0 0', lineHeight: 1.4 }}>
              STAR verbal structures, situation descriptions, and metrics accuracy.
            </p>
          </div>

          {/* Confidence Index */}
          <div className="glass-panel floating-panel-b" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.1em' }}>CONFIDENCE_STABILITY</span>
                <div style={{ fontSize: '36px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff', marginTop: '4px' }}>
                  <CountUp end={Math.round(readiness_score * 0.96)} />%
                </div>
              </div>
              <MicroSparkline />
            </div>
            <p style={{ fontSize: '12px', color: '#888888', margin: '12px 0 0', lineHeight: 1.4 }}>
              Latent vocal tremor analysis and speech pacing diagnostics.
            </p>
          </div>
        </div>

        {/* Section: Constellation and Cinematic Replay (Split Layout) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', lg: 'repeat(2, 1fr)', gap: '32px', marginBottom: '48px', contentVisibility: 'auto' }} className="responsive-split-grid">
          
          {/* Neural Constellation Panel */}
          <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '100%', textAlign: 'left', marginBottom: '24px' }}>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.12em' }}>NEURAL_NETWORK</span>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: '4px 0 0' }}>Skills Constellation</h2>
            </div>

            {/* Constellation SVG Diagram */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '400px', height: '400px' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 400" style={{ overflow: 'visible' }}>
                {/* Connection lines */}
                {NEURAL_LINKS.map((link, idx) => {
                  const fromNode = CONSTELLATION_SKILLS.find(s => s.id === link.from);
                  const toNode = CONSTELLATION_SKILLS.find(s => s.id === link.to);
                  if (!fromNode || !toNode) return null;
                  
                  const isHighlighted = hoveredSkill === link.from || hoveredSkill === link.to;
                  
                  return (
                    <line
                      key={idx}
                      x1={fromNode.cx}
                      y1={fromNode.cy}
                      x2={toNode.cx}
                      y2={toNode.cy}
                      stroke={isHighlighted ? '#ffffff' : 'rgba(255,255,255,0.06)'}
                      strokeWidth={isHighlighted ? 1.5 : 0.8}
                      style={{ transition: 'stroke 0.3s ease, stroke-width 0.3s ease' }}
                    />
                  );
                })}

                {/* Nodes */}
                {CONSTELLATION_SKILLS.map((skill) => {
                  const isHovered = hoveredSkill === skill.id;
                  
                  return (
                    <g 
                      key={skill.id}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => {
                        setHoveredSkill(skill.id);
                        triggerPulse();
                      }}
                      onMouseLeave={() => setHoveredSkill(null)}
                    >
                      {/* Glow circle */}
                      <circle
                        cx={skill.cx}
                        cy={skill.cy}
                        r={isHovered ? 16 : 8}
                        fill="rgba(255, 255, 255, 0.03)"
                        stroke={isHovered ? '#ffffff' : 'rgba(255,255,255,0.2)'}
                        strokeWidth="1"
                        style={{ transition: 'all 0.3s ease' }}
                      />
                      <circle
                        cx={skill.cx}
                        cy={skill.cy}
                        r={4}
                        fill="#ffffff"
                        style={{ filter: isHovered ? 'drop-shadow(0 0 4px #ffffff)' : 'none', transition: 'all 0.3s ease' }}
                      />
                      
                      {/* Label */}
                      <text
                        x={skill.cx}
                        y={skill.cy - 12}
                        textAnchor="middle"
                        fill={isHovered ? '#ffffff' : '#888888'}
                        fontSize="10"
                        fontFamily="monospace"
                        letterSpacing="0.05em"
                        style={{ transition: 'fill 0.3s ease', userSelect: 'none' }}
                      >
                        {skill.name.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Float Skill Info Card inside container */}
              {hoveredSkill && (
                <div style={{
                  position: 'absolute',
                  left: '12px',
                  bottom: '12px',
                  width: 'calc(100% - 24px)',
                  background: 'rgba(0, 0, 0, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  boxSizing: 'border-box',
                  animation: 'fadeIn 0.25s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 700, color: '#ffffff' }}>
                      {CONSTELLATION_SKILLS.find(s => s.id === hoveredSkill)?.name.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#888888' }}>
                      RATING: {CONSTELLATION_SKILLS.find(s => s.id === hoveredSkill)?.rate}%
                    </span>
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#a3a3a3', margin: 0, lineHeight: 1.4 }}>
                    {CONSTELLATION_SKILLS.find(s => s.id === hoveredSkill)?.desc}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cinematic Replay Timeline Panel */}
          <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.12em' }}>CHAMBER_WALKTHROUGH</span>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: '4px 0 16px' }}>Cinematic Telemetry Replay</h2>
              <p style={{ fontSize: '12.5px', color: '#888888', margin: '0 0 32px 0', lineHeight: 1.5 }}>
                Click nodes to inspect the audio frequencies, code matrices, and candidate responses.
              </p>

              {/* Horizontal Timeline flow */}
              <div style={{ position: 'relative', padding: '16px 0', marginBottom: '40px' }}>
                {/* Horizontal line */}
                <div style={{ position: 'absolute', top: '24px', left: '10px', right: '10px', height: '1.5px', background: 'rgba(255,255,255,0.06)' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                  {Object.keys(TIMELINE_NODES).map((key) => {
                    const node = TIMELINE_NODES[key];
                    const isActive = activeTimelineNode === key;
                    
                    return (
                      <div 
                        key={key} 
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                        onClick={() => {
                          setActiveTimelineNode(key);
                          triggerPulse();
                        }}
                      >
                        <div style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: isActive ? '#ffffff' : '#020202',
                          border: isActive ? '1.5px solid #ffffff' : '1.5px solid rgba(255, 255, 255, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 1,
                          transition: 'all 0.3s ease',
                          boxShadow: isActive ? '0 0 10px #ffffff' : 'none'
                        }}>
                          {isActive && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#000000' }} />}
                        </div>
                        <span style={{ 
                          marginTop: '8px', 
                          fontSize: '9.5px', 
                          fontFamily: 'monospace', 
                          color: isActive ? '#ffffff' : '#555555',
                          transition: 'color 0.3s ease'
                        }}>
                          {key.toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected node telemetry HUD */}
            {activeTimelineNode && TIMELINE_NODES[activeTimelineNode] && (
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.01)', 
                border: '1px solid rgba(255, 255, 255, 0.05)', 
                borderRadius: '6px', 
                padding: '24px',
                animation: 'fadeIn 0.3s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
                  <h3 style={{ fontSize: '13.5px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                    {TIMELINE_NODES[activeTimelineNode].title}
                  </h3>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#888888' }}>
                    {TIMELINE_NODES[activeTimelineNode].time}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Speech waveform visualizer */}
                  <div>
                    <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#888888', marginBottom: '6px' }}>LATENT_SPEECH_WAVEFORM</div>
                    <div style={{ display: 'flex', gap: '3px', height: '40px', alignItems: 'center' }}>
                      {TIMELINE_NODES[activeTimelineNode].waveform.map((val, idx) => (
                        <div 
                          key={idx} 
                          className="audio-waveform-bar"
                          style={{ 
                            width: '4px', 
                            height: `${val}%`, 
                            background: '#ffffff', 
                            opacity: 0.6,
                            borderRadius: '2px',
                            animation: `drift-waveform ${0.8 + idx * 0.1}s infinite ease-in-out alternate`
                          }} 
                        />
                      ))}
                    </div>
                  </div>

                  {/* Transcript */}
                  <div>
                    <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#888888', marginBottom: '4px' }}>TELEMETRY_TRANSCRIPT</div>
                    <p style={{ fontSize: '12.5px', color: '#a3a3a3', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                      "{TIMELINE_NODES[activeTimelineNode].transcript}"
                    </p>
                  </div>

                  {/* Optional code snapshot */}
                  {TIMELINE_NODES[activeTimelineNode].detailType === 'code' && (
                    <div>
                      <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#888888', marginBottom: '4px' }}>CODE_COMPILATION_MATRIX</div>
                      <pre style={{
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        padding: '12px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: '#ffffff',
                        margin: 0,
                        fontFamily: 'monospace',
                        overflowX: 'auto'
                      }}>
                        {TIMELINE_NODES[activeTimelineNode].code}
                      </pre>
                    </div>
                  )}

                  {/* AI Thoughts */}
                  <div>
                    <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#888888', marginBottom: '4px' }}>COGNITIVE_COACHING_LOG</div>
                    <p style={{ fontSize: '12.5px', color: '#ffffff', margin: 0, lineHeight: 1.5 }}>
                      {TIMELINE_NODES[activeTimelineNode].thoughts}
                    </p>
                  </div>

                  {/* Metadata telemetry details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                    {Object.entries(TIMELINE_NODES[activeTimelineNode].details).map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: '9px', fontFamily: 'monospace', color: '#666666' }}>{k.toUpperCase()}</div>
                        <div style={{ fontSize: '11px', color: '#ffffff', fontWeight: 600, marginTop: '2px' }}>{v}</div>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            )}

          </div>

        </div>

        {/* Diagnostic Logs (Session History Table) */}
        <div className="glass-panel" style={{ padding: '32px' }}>
          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.12em' }}>HISTORICAL_INDEX</span>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: '4px 0 24px' }}>Diagnostics Database Log</h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['INDEX_ID', 'TIMESTAMP', 'DSA_GRADE', 'TECH_GRADE', 'HR_GRADE', 'OVERALL', 'DIAGNOSTIC_REPORT'].map((th) => (
                    <th key={th} style={{ padding: '12px 16px', fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                      {th}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {score_timeline.map((s) => {
                  const formattedDate = s.date 
                    ? new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'N/A';

                  return (
                    <tr 
                      key={s.session_id} 
                      style={{ 
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: 'transparent',
                        transition: 'background 0.3s ease'
                      }}
                      className="log-row"
                    >
                      <td style={{ padding: '16px', fontSize: '13.5px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                        SESSION_#{s.session_number}
                      </td>
                      <td style={{ padding: '16px', fontSize: '13.5px', color: '#888888' }}>
                        {formattedDate}
                      </td>
                      <td style={{ padding: '16px', fontSize: '13.5px', color: '#ffffff', fontFamily: 'monospace' }}>
                        {s.dsa || 0}%
                      </td>
                      <td style={{ padding: '16px', fontSize: '13.5px', color: '#ffffff', fontFamily: 'monospace' }}>
                        {s.technical || 0}%
                      </td>
                      <td style={{ padding: '16px', fontSize: '13.5px', color: '#ffffff', fontFamily: 'monospace' }}>
                        {s.hr || 0}%
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px', fontWeight: 700, color: '#ffffff', fontFamily: 'monospace' }}>
                        {s.overall || 0}%
                      </td>
                      <td style={{ padding: '16px' }}>
                        <button 
                          onClick={() => navigate(`/report/${candidateId}`)}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#ffffff', 
                            fontSize: '12px', 
                            fontWeight: 700, 
                            cursor: 'pointer',
                            fontFamily: 'monospace',
                            textDecoration: 'underline'
                          }}
                        >
                          OPEN_DECK
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      <style>{`
        .dashboard-root {
          background-color: #020202;
          color: #ffffff;
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Outfit', 'Inter', var(--font-sans);
          position: relative;
        }

        /* Glass Panel styles */
        .glass-panel {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          color: #ffffff;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Ambient float drifts */
        .floating-panel-a {
          animation: float-panel-y 8s ease-in-out infinite alternate;
        }

        .floating-panel-b {
          animation: float-panel-y-rev 9s ease-in-out infinite alternate;
        }

        @keyframes float-panel-y {
          0% { transform: translateY(-3px); }
          100% { transform: translateY(3px); }
        }

        @keyframes float-panel-y-rev {
          0% { transform: translateY(4px); }
          100% { transform: translateY(-4px); }
        }

        /* Stark capsule button */
        .capsule-btn {
          background: #ffffff;
          color: #000000;
          border: none;
          padding: 12px 30px;
          border-radius: 30px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 15px rgba(255, 255, 255, 0.15);
        }

        .capsule-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 25px rgba(255, 255, 255, 0.35);
        }

        /* Analog Noise overlays */
        .noise-overlay {
          position: fixed;
          top: -50%;
          left: -50%;
          right: -50%;
          bottom: -50%;
          width: 200%;
          height: 200%;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
          opacity: 0.012;
          pointer-events: none;
          z-index: 99;
          animation: noise-shift-frame 7s steps(7) infinite;
        }

        @keyframes noise-shift-frame {
          0% { transform: translate(0, 0); }
          20% { transform: translate(-3%, 3%); }
          40% { transform: translate(3%, -5%); }
          60% { transform: translate(-5%, -3%); }
          80% { transform: translate(5%, 5%); }
          100% { transform: translate(0, 0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Waveform bar animations */
        @keyframes drift-waveform {
          0% { transform: scaleY(0.6); }
          100% { transform: scaleY(1.3); }
        }

        .log-row:hover {
          background: rgba(255, 255, 255, 0.02) !important;
        }

        /* Responsive Layouts */
        @media(min-width: 992px) {
          .responsive-split-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
