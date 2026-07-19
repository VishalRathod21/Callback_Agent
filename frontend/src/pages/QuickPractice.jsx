import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import axios, { API_BASE } from '../api/client';
import Navbar from '../components/ui/Navbar';

// Starfield Particle Layer
function StarsField() {
  const pointsRef = useRef();
  const count = 300;
  
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 4 + Math.random() * 12;
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
    pointsRef.current.rotation.y = time * 0.003;
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
        opacity={0.2}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// Swirling Energy Particles
function EnergyParticles({ count = 60 }) {
  const pointsRef = useRef();
  
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 1.0 + Math.random() * 1.5;
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
    pointsRef.current.rotation.y = -time * 0.04;
    pointsRef.current.rotation.z = time * 0.02;
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
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

// The interactive AI Core & Glass Orb
function PracticeOrb({ selectedTopic, targetRole, pulseTime, isTransitioning, step, normalizedMouse }) {
  const orbGroupRef = useRef();
  const outerGlassRef = useRef();
  const innerCoreRef = useRef();
  const coreMaterialRef = useRef();
  
  // Custom shader for the glowing AI Core inside the glass
  const practiceCoreShader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#E5A93C') }, 
      uPulse: { value: 0.0 }
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPulse;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      float wave(vec3 p, float speed, float scale) {
        return sin(p.x * scale + uTime * speed) * cos(p.y * scale + uTime * speed) * sin(p.z * scale + uTime * speed);
      }
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        
        float disp = wave(position, 2.0, 3.5) * (0.06 + uPulse * 0.18);
        vec3 displaced = position + normal * disp;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uPulse;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vec3 normal = normalize(vNormal);
        float glow = pow(0.65 - dot(normal, vec3(0.0, 0.0, 1.0)), 2.2);
        
        vec3 finalColor = mix(uColor, vec3(1.0), glow * 0.4 + uPulse * 0.4);
        gl_FragColor = vec4(finalColor, 0.75 + glow * 0.25);
      }
    `
  }), []);

  // Map target role to color
  const roleColors = {
    'Software Engineer': '#E5A93C', // Gold
    'AI Engineer': '#00F2FE',       // Electric Teal
    'ML Engineer': '#10B981',       // Emerald
    'Frontend': '#FFFFFF',          // Pure White
    'Backend': '#3B82F6',           // Royal Blue
  };

  const activeColor = roleColors[targetRole] || '#FFFFFF';

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    // Smooth transition between centered and corner state
    let targetX = 0;
    let targetY = 0;
    let targetScale = 1.0;
    
    if (step > 1) {
      targetX = 1.8;
      targetY = 1.4;
      targetScale = 0.55;
    } else if (isTransitioning) {
      targetScale = 10.0; // expand during simulation initialization
    } else if (selectedTopic) {
      targetScale = 1.35; // breathe larger if option is selected
    }

    if (orbGroupRef.current) {
      // Float naturally
      orbGroupRef.current.position.x = THREE.MathUtils.lerp(
        orbGroupRef.current.position.x, 
        targetX + normalizedMouse.x * 0.2, 
        0.06
      );
      orbGroupRef.current.position.y = THREE.MathUtils.lerp(
        orbGroupRef.current.position.y, 
        targetY + normalizedMouse.y * 0.2 + Math.sin(time * 0.8) * 0.1, 
        0.06
      );
      
      const currentScale = THREE.MathUtils.lerp(orbGroupRef.current.scale.x, targetScale, 0.06);
      orbGroupRef.current.scale.set(currentScale, currentScale, currentScale);
      
      orbGroupRef.current.rotation.y = time * 0.08;
      orbGroupRef.current.rotation.x = time * 0.04;
    }

    // Dynamic energy pulse
    if (coreMaterialRef.current) {
      coreMaterialRef.current.uniforms.uTime.value = time;
      
      const targetColor = new THREE.Color(activeColor);
      coreMaterialRef.current.uniforms.uColor.value.lerp(targetColor, 0.1);
      
      // Calculate spring pulse from clicking roles
      const timeSincePulse = (Date.now() - pulseTime) / 1000;
      let pulseVal = 0;
      if (timeSincePulse < 1.2) {
        pulseVal = Math.max(0, Math.sin(timeSincePulse * 6.0) * Math.exp(-timeSincePulse * 3.5));
      }
      coreMaterialRef.current.uniforms.uPulse.value = pulseVal;
    }
  });

  return (
    <group ref={orbGroupRef}>
      {/* Swirling energy sparks */}
      <EnergyParticles count={70} />
      
      {/* Inner Glowing Core */}
      <mesh ref={innerCoreRef}>
        <sphereGeometry args={[0.6, 64, 64]} />
        <shaderMaterial
          ref={coreMaterialRef}
          vertexShader={practiceCoreShader.vertexShader}
          fragmentShader={practiceCoreShader.fragmentShader}
          uniforms={practiceCoreShader.uniforms}
          transparent
        />
      </mesh>

      {/* Outer Physical Liquid Glass Sphere */}
      <mesh ref={outerGlassRef}>
        <sphereGeometry args={[0.95, 64, 64]} />
        <meshPhysicalMaterial
          transmission={0.94}
          roughness={0.05}
          thickness={1.6}
          ior={1.48}
          clearcoat={1.0}
          clearcoatRoughness={0.04}
          color="#ffffff"
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}

const MODULES = [
  { id: 'machine_learning', label: 'Machine Learning', theta: -3.14, desc: 'ML models, scales & pipelines' },
  { id: 'dsa_theory', label: 'DSA Theory', theta: -2.356, desc: 'Verbal complexity & structures' },
  { id: 'system_design', label: 'System Design', theta: -1.57, desc: 'Architecture & scaling tradeoffs' },
  { id: 'behavioral', label: 'Behavioral', theta: -0.785, desc: 'STAR situational responses' },
  { id: 'random', label: 'Random Mix', theta: 0, desc: 'Simulated variety warmup' }
];

const ROLES = ['Software Engineer', 'AI Engineer', 'ML Engineer', 'Frontend', 'Backend'];

const TOPIC_DETAILS = {
  dsa_theory: { title: "DSA Theory", color: "#E5A93C" },
  system_design: { title: "System Design", color: "#3B82F6" },
  behavioral: { title: "Behavioral", color: "#10B981" },
  machine_learning: { title: "Machine Learning", color: "#00F2FE" },
  random: { title: "Random Mix", color: "#FFFFFF" }
};

export default function QuickPractice() {
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(1); // 1: Chamber Selection, 2: Active Q&A, 3: Feedback, 4: Summary
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [hoveredModule, setHoveredModule] = useState(null);
  
  const [targetRole, setTargetRole] = useState('Software Engineer');
  const [candidateId, setCandidateId] = useState('');
  
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [summary, setSummary] = useState(null);
  const [questionsHistory, setQuestionsHistory] = useState([]);
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [seconds, setSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const timerRef = useRef(null);

  // Mouse coordinate state for spotlight/3D displacement
  const [mouseCoords, setMouseCoords] = useState({ x: 0, y: 0 });
  const [pulseTime, setPulseTime] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dimensions, setDimensions] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const storedId = localStorage.getItem('candidateId');
    if (storedId) {
      setCandidateId(storedId);
    }
  }, []);

  useEffect(() => {
    if (location.state && location.state.preselectedTopic) {
      setSelectedTopic(location.state.preselectedTopic);
    }
  }, [location.state]);

  // Window sizing & Mouse listeners
  useEffect(() => {
    const handleResize = () => setDimensions({ w: window.innerWidth, h: window.innerHeight });
    const handleMouseMove = (e) => setMouseCoords({ x: e.clientX, y: e.clientY });
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Timer configuration
  useEffect(() => {
    if (step === 2 || step === 3) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  const formatTime = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const triggerPulse = () => {
    setPulseTime(Date.now());
  };

  // Web Speech API Recording
  const toggleRecording = () => {
    if (isRecording) {
      if (recognition) {
        recognition.stop();
      }
      setIsRecording(false);
    } else {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Voice recognition is not supported in this browser. Please use Chrome or Safari.");
        return;
      }
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecording(true);
      };

      rec.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setAnswerText((prev) => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      rec.onerror = (e) => {
        console.error("Speech recognition error:", e);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      rec.start();
      setRecognition(rec);
    }
  };

  // Launch the simulation session
  const startPracticeSession = async () => {
    if (!selectedTopic) return;
    setIsTransitioning(true);
    
    // Wait for cinematic chamber zoom in to complete
    setTimeout(async () => {
      try {
        setLoading(true);
        const res = await axios.post(`${API_BASE}/practice/start`, {
          topic: selectedTopic,
          target_role: targetRole,
          candidate_id: candidateId || null,
          question_count: 6
        });
        setSession(res.data);
        setCurrentQuestion(res.data.first_question);
        setQuestionsHistory([res.data.first_question]);
        setAnswerText('');
        setSeconds(0);
        setStep(2);
      } catch (err) {
        console.error("Failed to start practice:", err);
        alert("Error starting practice session.");
      } finally {
        setLoading(false);
        setIsTransitioning(false);
      }
    }, 1200);
  };

  // Submit question answer
  const submitAnswer = async (skip = false) => {
    if (isRecording && recognition) {
      recognition.stop();
    }
    
    const ans = skip ? "I will skip this question." : answerText.trim();
    if (!skip && ans.length < 5) {
      alert("Please write a complete answer (at least 5 characters).");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE}/practice/answer`, {
        session_id: session.session_id,
        question_id: currentQuestion.id,
        answer: ans
      });

      setEvaluation(res.data.evaluation);
      setQuestionsHistory((prev) =>
        prev.map((q) =>
          q.id === currentQuestion.id
            ? { ...q, answered: true, candidate_answer: ans, score: res.data.evaluation.score, feedback: res.data.evaluation }
            : q
        )
      );

      setStep(3);

      if (res.data.session_complete) {
        setSummary(res.data.summary);
      } else {
        setSession((prev) => ({
          ...prev,
          next_question: res.data.next_question
        }));
      }
    } catch (err) {
      console.error("Error evaluating answer:", err);
      alert("Error evaluating answer.");
    } finally {
      setLoading(false);
    }
  };

  // Move to the next question
  const handleNext = () => {
    if (summary) {
      setStep(4);
    } else {
      const nextQ = session.next_question;
      setCurrentQuestion(nextQ);
      setQuestionsHistory((prev) => [...prev, nextQ]);
      setAnswerText('');
      setEvaluation(null);
      setStep(2);
    }
  };

  // Save session results to user progress
  const saveToDatabase = async () => {
    if (!candidateId || !summary || saving) return;
    try {
      setSaving(true);
      await axios.post(`${API_BASE}/practice/save`, {
        candidate_id: candidateId,
        session_id: session.session_id,
        topic: selectedTopic,
        average_score: summary.average_score
      });
      setSaved(true);
      setTimeout(() => {
        navigate(`/dashboard/${candidateId}`);
      }, 1500);
    } catch (err) {
      console.error("Error saving progress:", err);
      alert("Could not save to progress dashboard.");
    } finally {
      setSaving(false);
    }
  };

  // Normalized mouse position for 3D displacement
  const normalizedMouse = useMemo(() => {
    return {
      x: (mouseCoords.x / dimensions.w) * 2 - 1,
      y: -(mouseCoords.y / dimensions.h) * 2 + 1
    };
  }, [mouseCoords, dimensions]);

  return (
    <div className="practice-root">
      {/* Noise Overlay */}
      <div className="noise-overlay" />

      {/* Spotlight Effect */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: `radial-gradient(circle 450px at ${mouseCoords.x}px ${mouseCoords.y}px, rgba(255, 255, 255, 0.02) 0%, transparent 100%)`,
        pointerEvents: 'none',
        zIndex: 1
      }} />

      {/* Global 3D Interactive Space */}
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
          <directionalLight position={[2, 3, 2]} intensity={1.2} color="#ffffff" />
          <pointLight position={[-3, -3, -2]} intensity={0.4} color="#ffffff" />
          
          <StarsField />
          <PracticeOrb
            selectedTopic={selectedTopic}
            targetRole={targetRole}
            pulseTime={pulseTime}
            isTransitioning={isTransitioning}
            step={step}
            normalizedMouse={normalizedMouse}
          />
        </Canvas>
      </div>

      {/* SVG Connecting energy lines overlay (Only visible in selection step) */}
      {step === 1 && !isTransitioning && (
        <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
          {MODULES.map((m) => {
            const isSelected = selectedTopic === m.id;
            const isHovered = hoveredModule === m.id;
            const R = isSelected ? 170 : isHovered ? 190 : 255;
            
            const mx = dimensions.w / 2 + R * Math.cos(m.theta);
            const my = dimensions.h / 2 + R * Math.sin(m.theta);
            
            const strokeColor = isSelected 
              ? '#ffffff' 
              : isHovered ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.06)';
            const strokeWidth = isSelected ? 1.5 : isHovered ? 1.0 : 0.5;
            
            return (
              <g key={m.id}>
                <line
                  x1={dimensions.w / 2}
                  y1={dimensions.h / 2}
                  x2={mx}
                  y2={my}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isSelected ? '0' : '3 6'}
                  style={{ transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
                />
                {(isSelected || isHovered) && (
                  <circle r="2.5" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 5px #ffffff)' }}>
                    <animateMotion
                      dur={isSelected ? '1s' : '1.8s'}
                      repeatCount="indefinite"
                      path={`M ${dimensions.w / 2} ${dimensions.h / 2} L ${mx} ${my}`}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>
      )}

      <Navbar />

      {/* Transition Loader overlay */}
      {isTransitioning && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(10px)',
          zIndex: 100,
          color: '#ffffff',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div className="telemetry-log" style={{ fontSize: '11px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '8px' }}>
            initializing warm-up environment...
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            calibrating simulation chamber
          </div>
        </div>
      )}

      {/* Main HUD Interface */}
      <main style={{
        flex: 1,
        maxWidth: step === 1 ? '100vw' : '720px',
        width: '100%',
        margin: '0 auto',
        padding: step === 1 ? '0' : '120px 24px 80px',
        position: 'relative',
        zIndex: 2,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: step === 1 ? 'space-between' : 'flex-start'
      }}>
        
        {/* STEP 1: FUTURISTIC AI SIMULATION CHAMBER */}
        {step === 1 && !isTransitioning && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', padding: '100px 40px 40px', justifyContent: 'space-between', boxSizing: 'border-box' }}>
            
            {/* Header telemetry stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '11px', color: '#888888', letterSpacing: '0.15em', fontFamily: 'monospace' }}>SECURE_SESSION // V.08</div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '4px 0 0', letterSpacing: '-0.02em' }}>SIMULATION CHAMBER</h1>
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', color: '#888888', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div>STATUS: STANDBY</div>
                <div>CORE_TEMP: NORMAL</div>
                <div>PERSONA_ARRAY: INTENDED</div>
              </div>
            </div>

            {/* Orbiting Satellite cards (holographic practice modules) */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {MODULES.map((m, idx) => {
                const isSelected = selectedTopic === m.id;
                const isHovered = hoveredModule === m.id;
                const R = isSelected ? 170 : isHovered ? 190 : 255;
                
                const left = `calc(50% + ${R * Math.cos(m.theta)}px)`;
                const top = `calc(50% + ${R * Math.sin(m.theta)}px)`;
                
                return (
                  <div
                    key={m.id}
                    className={`practice-module-glass ${isSelected ? 'selected' : ''}`}
                    style={{
                      position: 'absolute',
                      left,
                      top,
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'auto',
                      animationDelay: `${idx * -1.2}s`
                    }}
                    onMouseEnter={() => setHoveredModule(m.id)}
                    onMouseLeave={() => setHoveredModule(null)}
                    onClick={() => {
                      setSelectedTopic(m.id);
                      triggerPulse();
                    }}
                  >
                    <div className="module-label">{m.label}</div>
                    <div className="module-desc">{m.desc}</div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Roles & Active Capsule CTA */}
            <div style={{ width: '100%', maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', zIndex: 10 }}>
              
              {/* Role selection chips */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  target chamber parameters
                </span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {ROLES.map((role) => (
                    <button
                      key={role}
                      className={`role-chip ${targetRole === role ? 'selected' : ''}`}
                      onClick={() => {
                        setTargetRole(role);
                        triggerPulse();
                      }}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Simulation Capsule button */}
              <button
                className="activate-capsule"
                disabled={!selectedTopic || loading}
                onClick={startPracticeSession}
              >
                {selectedTopic ? "Activate Simulation Chamber" : "Select Topic Satellite to Initialize"}
              </button>

            </div>
          </div>
        )}

        {/* STEP 2 & 3: Q&A ACTIVE HUD panels */}
        {(step === 2 || step === 3) && currentQuestion && (
          <div style={{ animation: 'fadeIn 0.3s ease', width: '100%' }}>
            
            {/* Top telemetry progress header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  question {currentQuestion.id} of {session?.total_questions}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px', color: '#ffffff' }}>
                  {TOPIC_DETAILS[selectedTopic]?.title} Active HUD
                </div>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', letterSpacing: '0.05em' }}>
                TIME: {formatTime(seconds)}
              </div>
            </div>

            {/* Stark progress indicator */}
            <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', width: '100%', marginBottom: '32px' }}>
              <div style={{
                height: '100%',
                width: `${(currentQuestion.id / session.total_questions) * 100}%`,
                background: '#ffffff',
                transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }} />
            </div>

            {/* Question glass panel */}
            <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px', borderLeft: '4px solid #ffffff' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#888888', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                  Q{currentQuestion.id}
                </span>
                <p style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', lineHeight: 1.6, margin: 0 }}>
                  {currentQuestion.question}
                </p>
              </div>
            </div>

            {/* Question typing area */}
            {step === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Provide your technical explanation... you can use standard notation or speak out loud."
                    disabled={loading}
                    style={{
                      width: '100%',
                      minHeight: '160px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      color: '#ffffff',
                      padding: '20px',
                      fontSize: '14.5px',
                      lineHeight: 1.7,
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box'
                    }}
                  />
                  
                  {/* Speech input toggle */}
                  <button
                    onClick={toggleRecording}
                    style={{
                      position: 'absolute',
                      right: '16px',
                      bottom: '16px',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      border: isRecording ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: isRecording ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0,0,0,0.6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    {isRecording ? (
                      <div className="audio-ring-pulsing" style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffffff' }} />
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                      </svg>
                    )}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button 
                    onClick={() => submitAnswer(true)} 
                    disabled={loading}
                    style={{ background: 'none', border: 'none', color: '#888888', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}
                  >
                    Skip question
                  </button>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#666666' }}>
                      {answerText.length} chars
                    </span>
                    <button 
                      className="activate-capsule" 
                      onClick={() => submitAnswer(false)} 
                      disabled={loading || answerText.trim().length < 5}
                      style={{ padding: '10px 24px', fontSize: '12px' }}
                    >
                      {loading ? 'Evaluating...' : 'Submit Answer →'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: FEEDBACK glass panel */}
            {step === 3 && evaluation && (
              <div style={{ animation: 'fadeIn 0.25s ease' }}>
                <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px' }}>
                  
                  {/* Rating telemetry */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.1em' }}>SCORE:</span>
                      <span style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'monospace', color: '#ffffff' }}>
                        {evaluation.score}/10
                      </span>
                    </div>

                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 12px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#ffffff',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em'
                    }}>
                      {evaluation.verdict ? evaluation.verdict.replace('_', ' ') : 'DECENT'}
                    </span>
                  </div>

                  {/* Feedback Bullet Points */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Strength */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ color: '#ffffff', fontSize: '13px', fontFamily: 'monospace', marginTop: '2px' }}>[+]</div>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#888888', letterSpacing: '0.08em', marginBottom: '4px' }}>STRENGTH SUMMARY</div>
                        <p style={{ fontSize: '14px', color: '#ffffff', margin: 0, lineHeight: 1.5 }}>{evaluation.strength}</p>
                      </div>
                    </div>

                    {/* Gap */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ color: '#ffffff', fontSize: '13px', fontFamily: 'monospace', marginTop: '2px' }}>[-]</div>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#888888', letterSpacing: '0.08em', marginBottom: '4px' }}>IDENTIFIED GAP</div>
                        <p style={{ fontSize: '14px', color: '#a3a3a3', margin: 0, lineHeight: 1.5 }}>{evaluation.gap}</p>
                      </div>
                    </div>

                    {/* Tip */}
                    <div style={{ display: 'flex', gap: '16px' }}>
                      <div style={{ color: '#ffffff', fontSize: '13px', fontFamily: 'monospace', marginTop: '2px' }}>[*]</div>
                      <div>
                        <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#888888', letterSpacing: '0.08em', marginBottom: '4px' }}>ACTIONABLE COACHING TIP</div>
                        <p style={{ fontSize: '14px', color: '#ffffff', margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{evaluation.tip}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="activate-capsule"
                    onClick={handleNext}
                    style={{ padding: '12px 30px', fontSize: '12px' }}
                  >
                    {summary ? 'Compute Results →' : 'Advance Next Question →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: DIAGNOSTICS & SUMMARY */}
        {step === 4 && summary && (
          <div style={{ animation: 'fadeIn 0.3s ease', width: '100%' }}>
            
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ fontSize: '10px', color: '#888888', fontFamily: 'monospace', letterSpacing: '0.15em', marginBottom: '8px' }}>SESSION // RECAP</div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                Simulation Diagnostic Complete
              </h2>
              <p style={{ fontSize: '13px', color: '#a3a3a3', marginBottom: '36px' }}>
                Topic satellite: {TOPIC_DETAILS[selectedTopic]?.title} · {summary.total_questions} scenarios processed
              </p>

              {/* Big Score Meter */}
              <div style={{ display: 'inline-block', marginBottom: '36px' }}>
                <span style={{ fontSize: '10px', color: '#888888', display: 'block', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: '6px' }}>COMPUTED METRIC AVERAGE</span>
                <span style={{ fontSize: '64px', fontWeight: 800, fontFamily: 'monospace', color: '#ffffff', lineHeight: 1 }}>
                  {summary.average_score}/10
                </span>
              </div>

              {/* Score breakdown metrics */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <div style={{ padding: '6px 16px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', fontSize: '12px', fontFamily: 'monospace' }}>
                  [+] {summary.strong} STRONG
                </div>
                <div style={{ padding: '6px 16px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#a3a3a3', fontSize: '12px', fontFamily: 'monospace' }}>
                  [/] {summary.decent} DECENT
                </div>
                <div style={{ padding: '6px 16px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#666666', fontSize: '12px', fontFamily: 'monospace' }}>
                  [-] {summary.needs_work} NEEDS WORK
                </div>
              </div>
            </div>

            {/* Accordion Review */}
            <div className="glass-panel" style={{ padding: '32px', marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: '0 0 20px', letterSpacing: '-0.01em' }}>
                Telemetry Log Review
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {questionsHistory.map((q) => {
                  const isExpanded = expandedQuestionId === q.id;
                  
                  return (
                    <div 
                      key={q.id} 
                      style={{ 
                        border: '1px solid rgba(255,255,255,0.06)', 
                        borderRadius: '6px', 
                        background: 'rgba(255,255,255,0.01)',
                        overflow: 'hidden'
                      }}
                    >
                      <div 
                        onClick={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                        style={{ 
                          padding: '16px', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          cursor: 'pointer' 
                        }}
                      >
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: q.score >= 7 ? '#ffffff' : q.score >= 4 ? '#a3a3a3' : '#555555' }}>
                            [{q.score || 0}/10]
                          </span>
                          <span style={{ fontSize: '13.5px', color: '#ffffff', fontWeight: 500, textAlign: 'left' }}>
                            {q.question.length > 55 ? `${q.question.substring(0, 55)}...` : q.question}
                          </span>
                        </div>
                        <span style={{ color: '#888888', fontSize: '12px', fontFamily: 'monospace' }}>
                          {isExpanded ? '[-]' : '[+]'}
                        </span>
                      </div>

                      {isExpanded && q.feedback && (
                        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', fontSize: '13.5px', lineHeight: 1.6 }}>
                          <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', marginBottom: '4px' }}>YOUR SUBMITTED EXPLANATION:</div>
                            <p style={{ color: '#a3a3a3', margin: 0, fontStyle: 'italic' }}>{q.candidate_answer}</p>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#888888', marginBottom: '4px' }}>ACTIONABLE RE-CALIBRATION:</div>
                            <p style={{ color: '#ffffff', margin: 0, fontWeight: 500 }}>{q.feedback.tip}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Actions Row */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap', zIndex: 10 }}>
              <button 
                className="role-chip" 
                onClick={() => {
                  setStep(1);
                  setSelectedTopic(null);
                  setSession(null);
                  setSummary(null);
                  setEvaluation(null);
                  setSeconds(0);
                }}
              >
                Reset chamber
              </button>
              
              <button className="role-chip" onClick={startPracticeSession}>
                Repeat warmup
              </button>

              <button className="role-chip selected" onClick={() => navigate('/upload')}>
                Launch full panel
              </button>

              {candidateId && (
                <button 
                  className="role-chip" 
                  onClick={saveToDatabase}
                  disabled={saving || saved}
                  style={{
                    background: saved ? 'rgba(255,255,255,0.08)' : '#ffffff',
                    color: saved ? '#ffffff' : '#000000',
                    borderColor: '#ffffff'
                  }}
                >
                  {saving ? 'Saving...' : saved ? 'Saved to Profile ✓' : 'Save to Progress'}
                </button>
              )}
            </div>
          </div>
        )}

      </main>

      <style>{`
        /* Global Practice Root Styles */
        .practice-root {
          background-color: #020202;
          color: #ffffff;
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Outfit', 'Inter', var(--font-sans);
          position: relative;
        }

        /* Ambient Glass Panel styles */
        .glass-panel {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          color: #ffffff;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Interactive Satellite Glass Cards */
        .practice-module-glass {
          background: rgba(255, 255, 255, 0.02);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          padding: 18px 22px;
          width: 230px;
          cursor: pointer;
          text-align: left;
          pointer-events: auto;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          animation: float-card 6s ease-in-out infinite alternate;
        }

        .practice-module-glass:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.28);
          box-shadow: 0 0 25px rgba(255, 255, 255, 0.05);
        }

        .practice-module-glass.selected {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(255, 255, 255, 0.85);
          box-shadow: 0 0 35px rgba(255, 255, 255, 0.12);
        }

        .module-label {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #ffffff;
          margin-bottom: 6px;
        }

        .module-desc {
          font-size: 11px;
          color: #888888;
          line-height: 1.4;
        }

        /* Float card keyframe animations */
        @keyframes float-card {
          0% { transform: translate(-50%, -50%) translateY(-6px); }
          100% { transform: translate(-50%, -50%) translateY(6px); }
        }

        /* Telemetry Parameter Buttons */
        .role-chip {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #888888;
          padding: 8px 18px;
          border-radius: 20px;
          font-size: 11px;
          font-family: monospace;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .role-chip:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.18);
        }

        .role-chip.selected {
          background: #ffffff;
          color: #000000;
          border-color: #ffffff;
          box-shadow: 0 0 15px rgba(255, 255, 255, 0.25);
        }

        /* Large Minimal Activation Capsule */
        .activate-capsule {
          background: #ffffff;
          color: #000000;
          border: none;
          padding: 15px 40px;
          border-radius: 30px;
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 20px rgba(255, 255, 255, 0.15);
        }

        .activate-capsule:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(255, 255, 255, 0.35);
        }

        .activate-capsule:disabled {
          background: rgba(255, 255, 255, 0.12);
          color: rgba(255, 255, 255, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.04);
          box-shadow: none;
          cursor: not-allowed;
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
          animation: noise-shift-frame 8s steps(8) infinite;
        }

        @keyframes noise-shift-frame {
          0% { transform: translate(0, 0); }
          20% { transform: translate(-3%, 3%); }
          40% { transform: translate(3%, -5%); }
          60% { transform: translate(-5%, -3%); }
          80% { transform: translate(5%, 5%); }
          100% { transform: translate(0, 0); }
        }

        /* Telemetry animations */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .audio-ring-pulsing {
          animation: audio-pulse 1.2s infinite ease-in-out;
        }
        
        @keyframes audio-pulse {
          0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.5); }
          100% { transform: scale(1.4); opacity: 0; box-shadow: 0 0 0 8px rgba(255, 255, 255, 0); }
        }
      `}</style>
    </div>
  );
}
