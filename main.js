/**
 * ===================================================================================
 * GEMELO DIGITAL 3D — SALA DE SERVIDORES Y MODELADO CFD
 * Proyecto de Tesis / Symposium de Grado
 * Programa: Ingeniería en Ciencias de la Computación e Inteligencia Artificial
 * Institución: Universidad de Santander (UDES)
 * ===================================================================================
 * 
 * FUNDAMENTACIÓN MATEMÁTICA Y FÍSICA:
 * 1. Dominio Espacial (Integral Triple):
 *      Ω = [0, 10] × [0, 15] × [0, 3]  (metros)
 *      Volumen total: Vol(Ω) = ∭_Ω dV = 10 × 15 × 3 = 450 m³
 *
 * 2. Distribución Térmica Cuadrática:
 *      T(x,y,z) = 20 + z²  (°C)
 *      - Suelo (z = 0 m): T = 20.0 °C  (línea base de inyección)
 *      - Techo (z = 3 m): T = 29.0 °C  (umbral crítico de extracción)
 *      - Teorema del Valor Medio Ponderado:
 *        T̄ = (1 / 450) ∭_Ω (20 + z²) dV = 20 + (1/3) [z³/3]₀³ = 20 + 3 = 23.0 °C
 *
 * 3. Dinámica de Fluidos Computacional (CFD) — Campo Vectorial:
 *      F(x,y,z) = (0.5x, 0.2y, 1.5 + z)  (m/s)
 *      Divergencia Volumétrica:
 *      ∇·F = ∂(0.5x)/∂x + ∂(0.2y)/∂y + ∂(1.5+z)/∂z = 0.5 + 0.2 + 1.0 = 1.7 > 0
 *      Interpretación: Flujo neto expansivo continuo hacia el pleno de extracción.
 *
 * ARQUITECTURA GRÁFICA:
 * - Three.js r165 (ES Modules vía CDN)
 * - Renderizado PBR Dark/Cyberpunk con Suelo Hiper-reflectante (metalness: 0.8, roughness: 0.15)
 * - 280 LEDs de procesamiento algorítmico asíncrono instanciados (1 draw call)
 * - 600 Estelas CFD vectoriales consolidadas en GPU con Shader GLSL
 * - Navegación OrbitControls amortiguada para exposición en vivo (Symposium-Ready)
 * - ACES Filmic Tone Mapping para fidelidad de contraste y negros puros
 * ===================================================================================
 */

import * as THREE          from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ═══════════════════════════════════════════════════════════════════
//  1. CONSTANTES DEL DOMINIO FÍSICO Y ESCALADO GRÁFICO
// ═══════════════════════════════════════════════════════════════════
const ROOM_W = 10;   // m — Ancho físico (Eje X)
const ROOM_L = 15;   // m — Profundidad física (Eje Z)
const ROOM_H = 3;    // m — Altura física (Eje Y en Three.js)
const SCALE  = 2.0;  // Factor de escala: 1 metro físico = 2 unidades Three.js

const SW = ROOM_W * SCALE;   // 20.0 u. (Ancho Three.js)
const SL = ROOM_L * SCALE;   // 30.0 u. (Profundidad Three.js)
const SH = ROOM_H * SCALE;   //  6.0 u. (Altura Three.js)

// ═══════════════════════════════════════════════════════════════════
//  2. MÁQUINA DE ESTADOS TERMODINÁMICA
// ═══════════════════════════════════════════════════════════════════
const TEMP_MIN   = 20.0;   // °C — Piso térmico normalizado T(x,y,0)
const TEMP_MAX   = 29.0;   // °C — Umbral crítico de disparo HVAC T(x,y,3)
const HEAT_RATE  = 0.40;   // °C/s — Tasa de disipación térmica de los algoritmos
const COOL_RATE  = 0.95;   // °C/s — Tasa de extracción convectiva forzada

let simTemp      = TEMP_MIN;
let simState     = 'HEATING';   // 'HEATING' | 'COOLING'
let cfdOpacity   = 0.0;         // 0.0 = Aire inactivo (HEATING), 1.0 = HVAC pleno (COOLING)

// Parámetros ajustables en tiempo real vía UI
const simParams  = { flowSpeed: 1.0, thermalLoad: 1.0 };

// ═══════════════════════════════════════════════════════════════════
//  3. FORMULACIÓN VECTORIAL DEL CAMPO CFD
//     F(x,y,z) = (0.5x, 0.2y, 1.5 + z)
// ═══════════════════════════════════════════════════════════════════
function fieldThreeJS(tx, ty, tz) {
  const px = tx / SCALE;   // x físico (ancho)
  const py = ty / SCALE;   // z físico (altura vertical en Three.js es Y)
  const pz = tz / SCALE;   // y físico (profundidad en Three.js es Z)

  // Fx = 0.5*x,  Fy (altura) = 1.5 + z,  Fz = 0.2*y
  return new THREE.Vector3(0.5 * px, 1.5 + py, 0.2 * pz);
}

function fieldMagnitude(tx, ty, tz) {
  return fieldThreeJS(tx, ty, tz).length();
}

/**
 * Función de gradiente térmico estricta T(x,y,z) = 20 + z²
 * Normalizada según la altura vertical (ty / SH):
 * 0.0 -> 20°C (Cian/Azul frío)  a  1.0 -> 29°C (Rojo carmesí de calor crítico)
 */
function evaluateThermalColor(ty) {
  const t = Math.max(0.0, Math.min(1.0, ty / SH));
  const col = new THREE.Color();
  if (t < 0.25) {
    col.lerpColors(new THREE.Color(0x0055ff), new THREE.Color(0x00d5ff), t / 0.25);
  } else if (t < 0.55) {
    col.lerpColors(new THREE.Color(0x00d5ff), new THREE.Color(0x00ffaa), (t - 0.25) / 0.30);
  } else if (t < 0.80) {
    col.lerpColors(new THREE.Color(0x00ffaa), new THREE.Color(0xff8800), (t - 0.55) / 0.25);
  } else {
    col.lerpColors(new THREE.Color(0xff8800), new THREE.Color(0xff1500), (t - 0.80) / 0.20);
  }
  return col;
}

// ═══════════════════════════════════════════════════════════════════
//  4. RENDERER, CÁMARA Y POST-PROCESAMIENTO (SYMPOSIUM QUALITY)
// ═══════════════════════════════════════════════════════════════════
const canvas   = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:       true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled       = true;
renderer.shadowMap.type          = THREE.PCFSoftShadowMap;

// ACES Filmic Tone Mapping: negros profundos sin recorte y control estricto de saturación
renderer.toneMapping             = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure     = 0.72;
renderer.outputColorSpace        = THREE.SRGBColorSpace;

// Generador de entorno IBL para reflejos especulares de alta fidelidad PBR
const pmrem   = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envMap  = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const scene   = new THREE.Scene();
scene.background  = new THREE.Color(0x020306);
scene.fog         = new THREE.FogExp2(0x020306, 0.008);
scene.environment = envMap;

// Cámara con perspectiva arquitectónica inmersiva
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(SW * 0.98, SH * 1.50, SL * 0.94);

// OrbitControls (Symposium-Ready): amortiguación orgánica y límite polar estricto
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(SW / 2, SH * 0.38, SL / 2);
controls.enableDamping = true;
controls.dampingFactor = 0.05;       // Sensación pesada y cinematográfica
controls.maxPolarAngle = (Math.PI / 2) - 0.035; // Límite estricto: la cámara NUNCA atraviesa el suelo
controls.minPolarAngle = 0.08;
controls.minDistance   = 3.0;
controls.maxDistance   = 60.0;
controls.update();

// Pipeline de Post-Procesamiento (UnrealBloomPass)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.28,   // Intensidad sutil de bloom
  0.55,   // Radio de dispersión
  0.64    // Umbral de luminancia (solo LEDs y estelas brillantes emiten bloom)
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// ═══════════════════════════════════════════════════════════════════
//  5. PISO HIPER-REFLECTANTE (PBR DARK / CYBERPUNK ELEGANTE)
//     Suelo: THREE.MeshStandardMaterial, metalness: 0.8, roughness: 0.15
// ═══════════════════════════════════════════════════════════════════
function createProceduralRaisedFloorTexture() {
  const SIZE = 1024;
  const cv   = document.createElement('canvas');
  cv.width   = cv.height = SIZE;
  const ctx  = cv.getContext('2d');

  // Base carbón profundo
  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Mapeo modular de baldosas técnicas (2×2 en la textura repetible)
  const TILES = 2;
  const TS    = SIZE / TILES;

  for (let c = 0; c < TILES; c++) {
    for (let r = 0; r < TILES; r++) {
      const x = c * TS;
      const y = r * TS;

      // Cara pulida central con ligera variación de micro-relieve
      const grd = ctx.createRadialGradient(x + TS/2, y + TS/2, 10, x + TS/2, y + TS/2, TS * 0.68);
      grd.addColorStop(0.0, 'rgba(22, 26, 36, 0.50)');
      grd.addColorStop(0.7, 'rgba(12, 15, 22, 0.20)');
      grd.addColorStop(1.0, 'rgba(4, 6, 10, 0.05)');
      ctx.fillStyle = grd;
      ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);

      // Micro-insertos antiestáticos en esquinas de baldosas
      const pins = [
        [x + 14, y + 14], [x + TS - 14, y + 14],
        [x + 14, y + TS - 14], [x + TS - 14, y + TS - 14]
      ];
      ctx.fillStyle = 'rgba(60, 75, 95, 0.40)';
      pins.forEach(([px, py]) => {
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  // Juntas de precisión (rehundido oscuro entre paneles técnicos)
  ctx.strokeStyle = 'rgba(0, 1, 3, 0.98)';
  ctx.lineWidth   = 3.5;
  for (let i = 0; i <= TILES; i++) {
    ctx.beginPath(); ctx.moveTo(i * TS, 0);    ctx.lineTo(i * TS, SIZE);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * TS);    ctx.lineTo(SIZE, i * TS);  ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // Escala de baldosas de 600×600 mm (10m = 16.6 baldosas, 15m = 25 baldosas)
  tex.repeat.set(ROOM_W / 0.6, ROOM_L / 0.6);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function buildHyperReflectiveFloor() {
  const floorTex = createProceduralRaisedFloorTexture();

  // Requisito estricto: THREE.MeshStandardMaterial, metalness: 0.8, roughness: 0.15, carbón profundo
  const floorMat = new THREE.MeshStandardMaterial({
    color:           new THREE.Color(0x06070a), // Carbón profundo
    metalness:       0.80,                     // Hiper-reflectante metálico
    roughness:       0.15,                     // Pulido especular
    map:             floorTex,
    roughnessMap:    floorTex,
    bumpMap:         floorTex,
    bumpScale:       0.0015,
    envMapIntensity: 2.8,                      // Reflejos vivos del entorno e iluminación
  });

  const floorGeo  = new THREE.PlaneGeometry(SW, SL);
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(SW / 2, 0.0, SL / 2);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);
}

// ═══════════════════════════════════════════════════════════════════
//  6. ILUMINACIÓN ARQUITECTÓNICA Y ESTRUCTURA DEL DATACENTER
// ═══════════════════════════════════════════════════════════════════
const ceilingFixtures = [];
const extractorUnits  = [];

// Luz difusa mínima: evita negros empastados sin introducir luz parásita
scene.add(new THREE.AmbientLight(0x020408, 0.12));

// Luz volumétrica reactiva de disipación térmica global
const thermalFillLight = new THREE.PointLight(0xff1800, 0, 42, 2.0);
thermalFillLight.position.set(SW / 2, SH * 0.45, SL / 2);
scene.add(thermalFillLight);

// Material emisivo de paneles de techo (blanco limpio 6000K)
const ceilEmissiveMat = new THREE.MeshStandardMaterial({
  color:             0xffffff,
  emissive:          new THREE.Color(0xffffff),
  emissiveIntensity: 1.25,
  roughness:         0.7,
  metalness:         0.0,
});

function buildCeilingLighting() {
  const COLS    = 3;
  const ROWS    = 5;
  const PANEL_W = 1.8;
  const PANEL_D = 0.55;
  const colStep = SW / (COLS + 1);
  const rowStep = SL / (ROWS + 1);

  const fixtureHousingMat = new THREE.MeshStandardMaterial({
    color: 0x101217, roughness: 0.45, metalness: 0.90,
  });

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const px = colStep * (c + 1);
      const pz = rowStep * (r + 1);

      // Marco arquitectónico
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(PANEL_W + 0.08, 0.06, PANEL_D + 0.08),
        fixtureHousingMat
      );
      housing.position.set(px, SH - 0.03, pz);
      scene.add(housing);

      // Panel difusor LED
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(PANEL_W, 0.02, PANEL_D),
        ceilEmissiveMat
      );
      panel.position.set(px, SH - 0.012, pz);
      scene.add(panel);

      // Foco descendente blanco limpio
      const pLight = new THREE.PointLight(0xf4f8ff, 1.35, 18, 2.2);
      pLight.position.set(px, SH - 0.45, pz);
      scene.add(pLight);
      ceilingFixtures.push(pLight);
    }
  }
}

function buildRoomArchitecture() {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x050609, roughness: 0.90, metalness: 0.10, side: THREE.DoubleSide,
  });

  // Techo técnico
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(SW, SL), wallMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(SW / 2, SH, SL / 2);
  scene.add(ceiling);

  // Paredes perimetrales (sin plano de suelo para evitar colisión de profundidad)
  const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), wallMat);
  wallBack.position.set(SW / 2, SH / 2, 0);
  scene.add(wallBack);

  const wallFront = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), wallMat);
  wallFront.rotation.y = Math.PI;
  wallFront.position.set(SW / 2, SH / 2, SL);
  scene.add(wallFront);

  const wallLeft = new THREE.Mesh(new THREE.PlaneGeometry(SL, SH), wallMat);
  wallLeft.rotation.y = Math.PI / 2;
  wallLeft.position.set(0, SH / 2, SL / 2);
  scene.add(wallLeft);

  const wallRight = new THREE.Mesh(new THREE.PlaneGeometry(SL, SH), wallMat);
  wallRight.rotation.y = -Math.PI / 2;
  wallRight.position.set(SW, SH / 2, SL / 2);
  scene.add(wallRight);

  // Vigas maestras y bandejas de cableado estructurado
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x111318, roughness: 0.45, metalness: 0.92,
  });
  for (let i = 1; i <= 3; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(SW, 0.12, 0.16), beamMat);
    beam.position.set(SW / 2, SH - 0.06, (SL / 4) * i);
    scene.add(beam);
  }

  [SW * 0.28, SW * 0.72].forEach(bx => {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, SL * 0.94), beamMat);
    tray.position.set(bx, SH - 0.32, SL / 2);
    scene.add(tray);

    [-0.07, 0.0, 0.07].forEach(off => {
      const pts = [
        new THREE.Vector3(bx + off, SH - 0.36, 1.0),
        new THREE.Vector3(bx + off, SH - 0.36, SL - 1.0),
      ];
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: (off === 0) ? 0x0088ff : 0x0044aa })
      ));
    });
  });

  buildCeilingExtractors();
}

/** Puntos de escape aerodinámico del campo F(x,y,z) en el techo */
const EXTRACTOR_COORDS = [
  [SW * 0.25, SL * 0.25],
  [SW * 0.75, SL * 0.25],
  [SW * 0.50, SL * 0.50],
  [SW * 0.25, SL * 0.75],
  [SW * 0.75, SL * 0.75],
];

function buildCeilingExtractors() {
  const ductMat = new THREE.MeshStandardMaterial({
    color: 0x13151b, roughness: 0.35, metalness: 0.95,
  });

  EXTRACTOR_COORDS.forEach(([ex, ez]) => {
    // Ducto cilíndrico
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.90, 1.00, 0.28, 36), ductMat);
    duct.position.set(ex, SH - 0.14, ez);
    scene.add(duct);

    // Anillo luminoso de convección reactivo (activo en COOLING)
    const ringMat = new THREE.MeshStandardMaterial({
      color:             0x0a1420,
      emissive:          new THREE.Color(0x00d5ff),
      emissiveIntensity: 0.0,
      roughness:         0.2,
      metalness:         0.8,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.05, 12, 36), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(ex, SH - 0.02, ez);
    scene.add(ring);

    // Álabes estáticos
    for (let b = 0; b < 6; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.015, 0.80), ductMat);
      blade.position.set(ex, SH - 0.14, ez);
      blade.rotation.y = (b / 6) * Math.PI;
      scene.add(blade);
    }

    // Luz de extracción forzada
    const eLight = new THREE.PointLight(0x0099ff, 0, 7.5, 2.0);
    eLight.position.set(ex, SH - 0.55, ez);
    scene.add(eLight);

    extractorUnits.push({ light: eLight, ringMat });
  });
}

// ═══════════════════════════════════════════════════════════════════
//  7. RACKS DE SERVIDORES Y LEDS DE PROCESAMIENTO DINÁMICOS
//     - 10 Unidades (2 filas × 5 gabinetes) de material metálico oscuro
//     - LEDs de actividad algorítmica asíncrona mediante funciones senoidales
// ═══════════════════════════════════════════════════════════════════
const RACKS_COUNT   = 10;
const BLADES_TIER   = 14;
const TOTAL_LEDS    = RACKS_COUNT * BLADES_TIER * 2; // 280 LEDs de cómputo

let ledInstancedMesh = null;
const ledPhaseOffsets = new Float32Array(TOTAL_LEDS);
const ledBaseColors   = [];

// Material de chasis exterior: carbón metálico PBR oscuro
const rackChassisMat = new THREE.MeshStandardMaterial({
  color:             0x0a0c10,
  roughness:         0.22,
  metalness:         0.88,
  envMapIntensity:   1.8,
  emissive:          new THREE.Color(0x000000),
  emissiveIntensity: 0.0,
});

// Postes de aluminio extrusionado
const rackPillarMat = new THREE.MeshStandardMaterial({
  color: 0x161922, roughness: 0.18, metalness: 0.95, envMapIntensity: 2.2,
});

// Puerta de cristal templado ahumado
const glassDoorMat = new THREE.MeshPhysicalMaterial({
  color:              new THREE.Color(0x030610),
  roughness:          0.06,
  metalness:          0.05,
  clearcoat:          1.0,
  clearcoatRoughness: 0.03,
  reflectivity:       0.92,
  transparent:        true,
  opacity:            0.50,
  envMapIntensity:    3.2,
  side:               THREE.FrontSide,
});

// Materiales de los blades por nivel de altura: reflejan T(z) = 20 + z²
const bladeTierMaterials = [];
for (let u = 0; u < BLADES_TIER; u++) {
  bladeTierMaterials.push(new THREE.MeshStandardMaterial({
    color:             (u % 2 === 0) ? 0x0c0e14 : 0x11131a,
    roughness:         0.30,
    metalness:         0.85,
    envMapIntensity:   1.0,
    emissive:          new THREE.Color(0x000000),
    emissiveIntensity: 0.0,
  }));
}

// LED de alimentación estático (permanente verde esmeralda)
const ledPowerStaticMat = new THREE.MeshStandardMaterial({
  color:             0x00ff66,
  emissive:          new THREE.Color(0x00ff66),
  emissiveIntensity: 2.2,
  roughness:         0.0,
  metalness:         0.0,
});

function buildServerRacksAndDynamicLEDs() {
  const RACKS_PER_ROW = 5;
  const RW = 1.10;           // Ancho rack
  const RD = 1.05;           // Profundidad rack
  const RH = SH * 0.80;      // 4.8 u. de altura (2.4 m)
  const ROW_Z  = [SL * 0.28, SL * 0.72];
  const X_STEP = SW / (RACKS_PER_ROW + 1);

  // Geometría y material compartido para los LEDs de actividad instanciados
  const ledGeo = new THREE.BoxGeometry(0.032, 0.022, 0.012);
  const ledMat = new THREE.MeshBasicMaterial({
    color:       0xffffff,
    toneMapped:  false, // Permite que el resplandor bloom alcance máxima intensidad
  });

  ledInstancedMesh = new THREE.InstancedMesh(ledGeo, ledMat, TOTAL_LEDS);
  ledInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  let ledInstanceIndex = 0;

  ROW_Z.forEach((rowZ, rowIdx) => {
    // Fila 0 orientada a +Z (pasillo frío central), fila 1 orientada a -Z
    const doorDir = (rowIdx === 0) ? 1 : -1;

    for (let i = 0; i < RACKS_PER_ROW; i++) {
      const rx = X_STEP * (i + 1);
      const ry = RH / 2;

      // ── Chasis de acero carbón oscuro ──
      const body = new THREE.Mesh(new THREE.BoxGeometry(RW, RH, RD), rackChassisMat);
      body.position.set(rx, ry, rowZ);
      body.castShadow = true; body.receiveShadow = true;
      scene.add(body);

      // Líneas perimetrales
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(RW, RH, RD)),
        new THREE.LineBasicMaterial({ color: 0x1f232d })
      );
      edges.position.set(rx, ry, rowZ);
      scene.add(edges);

      // ── 4 Postes estructurales de aluminio ──
      const pillarGeo = new THREE.BoxGeometry(0.05, RH + 0.02, 0.05);
      [
        [-RW/2 + 0.025, -RD/2 + 0.025],
        [-RW/2 + 0.025,  RD/2 - 0.025],
        [ RW/2 - 0.025, -RD/2 + 0.025],
        [ RW/2 - 0.025,  RD/2 - 0.025]
      ].forEach(([dx, dz]) => {
        const pillar = new THREE.Mesh(pillarGeo, rackPillarMat);
        pillar.position.set(rx + dx, ry, rowZ + dz);
        scene.add(pillar);
      });

      // ── Puerta frontal de cristal templado ahumado ──
      const doorZ = rowZ + doorDir * (RD / 2 + 0.016);
      const door  = new THREE.Mesh(
        new THREE.BoxGeometry(RW - 0.06, RH - 0.06, 0.025),
        glassDoorMat
      );
      door.position.set(rx, ry, doorZ);
      scene.add(door);

      // Manija de puerta
      const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.32, 0.02),
        rackPillarMat
      );
      handle.position.set(rx + (RW / 2 - 0.08), ry, doorZ + doorDir * 0.016);
      scene.add(handle);

      // ── Blades de servidor interiores y matriz de LEDs ──
      const unitH    = (RH - 0.10) / BLADES_TIER;
      const bladeGeo = new THREE.BoxGeometry(RW - 0.09, unitH - 0.012, RD - 0.08);
      const ledFaceZ = rowZ + doorDir * (RD / 2 - 0.065);

      for (let u = 0; u < BLADES_TIER; u++) {
        const uy = -RH / 2 + u * unitH + unitH / 2 + 0.05;

        // Blade físico con material térmico estratificado
        const blade = new THREE.Mesh(bladeGeo, bladeTierMaterials[u]);
        blade.position.set(rx, ry + uy, rowZ);
        scene.add(blade);

        // LED Verde estático de encendido (Power)
        const pwrLed = new THREE.Mesh(ledGeo, ledPowerStaticMat);
        pwrLed.position.set(rx - RW / 2 + 0.11, ry + uy, ledFaceZ);
        scene.add(pwrLed);

        // 2 LEDs dinámicos de actividad algorítmica (Compute Node + Bus)
        for (let l = 0; l < 2; l++) {
          const lx = rx - RW / 2 + 0.18 + l * 0.07;
          dummy.position.set(lx, ry + uy, ledFaceZ);
          dummy.updateMatrix();

          ledInstancedMesh.setMatrixAt(ledInstanceIndex, dummy.matrix);

          // Asignación de fase quasi-Monte Carlo mediante la razón áurea (1.618033)
          const phi = (i * 1.618033) + (u * 0.754877) + (l * 3.14159);
          ledPhaseOffsets[ledInstanceIndex] = phi;

          ledInstanceIndex++;
        }
      }
    }
  });

  ledInstancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(ledInstancedMesh);
}

// ═══════════════════════════════════════════════════════════════════
//  8. ESTELAS DE FLUJO CFD — EXACTAMENTE 600 STREAMLINES
//     - Integración bajo F(x,y,z) = (0.5x, 0.2y, 1.5 + z)
//     - Expansión demostrativa de la divergencia volumétrica ∇·F = 1.7
//     - Shader GLSL consolidado en 1 solo draw call para 60 FPS
// ═══════════════════════════════════════════════════════════════════
const STREAMLINE_COUNT = 600;
const PTS_PER_STREAM   = 55;
const INTEGRAL_STEP    = 0.11;

let cfdMesh            = null;
let cfdShaderMaterial  = null;

function integrateStreamlineCurve(x0, y0, z0) {
  const points = [new THREE.Vector3(x0, y0, z0)];
  let x = x0, y = y0, z = z0;

  for (let s = 1; s < PTS_PER_STREAM; s++) {
    const F = fieldThreeJS(x, y, z);
    const len = F.length();
    if (len < 1e-4) break;

    // Integración numérica hacia adelante (Eulerian Streamline Propagation)
    x += (F.x / len) * INTEGRAL_STEP;
    y += (F.y / len) * INTEGRAL_STEP;
    z += (F.z / len) * INTEGRAL_STEP;

    // Límite de escape hacia el pleno del techo
    if (x < -0.2 || x > SW + 0.2 || y < -0.1 || y > SH + 0.15 || z < -0.2 || z > SL + 0.2) {
      break;
    }
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

function buildConsolidatedCFDStreamlines() {
  const totalVertices = STREAMLINE_COUNT * (PTS_PER_STREAM - 1) * 2;
  const positions     = new Float32Array(totalVertices * 3);
  const colors        = new Float32Array(totalVertices * 3);
  const progresses    = new Float32Array(totalVertices);
  const streamIds     = new Float32Array(totalVertices);

  let vPtr = 0;

  for (let k = 0; k < STREAMLINE_COUNT; k++) {
    const rnd = Math.random();
    let x0, y0, z0;

    if (rnd < 0.60) {
      // Inyección desde baldosas perforadas del pasillo frío central
      x0 = SW * (0.08 + Math.random() * 0.84);
      y0 = SH * Math.random() * 0.08;
      z0 = SL * (0.36 + Math.random() * 0.28);
    } else if (rnd < 0.85) {
      // Tomas perimetrales inferiores de racks
      x0 = SW * (0.05 + Math.random() * 0.90);
      y0 = SH * (0.03 + Math.random() * 0.15);
      z0 = SL * (0.12 + Math.random() * 0.76);
    } else {
      // Convección ascendente intermedia
      x0 = SW * (0.10 + Math.random() * 0.80);
      y0 = SH * (0.10 + Math.random() * 0.35);
      z0 = SL * (0.10 + Math.random() * 0.80);
    }

    const pts = integrateStreamlineCurve(x0, y0, z0);
    const n   = pts.length;
    if (n < 4) continue;

    for (let s = 0; s < n - 1; s++) {
      const p1 = pts[s];
      const p2 = pts[s + 1];

      const prog1 = s / (n - 1);
      const prog2 = (s + 1) / (n - 1);

      const col1 = evaluateThermalColor(p1.y);
      const col2 = evaluateThermalColor(p2.y);

      // Vértice 1 del segmento
      positions[vPtr * 3]     = p1.x;
      positions[vPtr * 3 + 1] = p1.y;
      positions[vPtr * 3 + 2] = p1.z;
      colors[vPtr * 3]        = col1.r;
      colors[vPtr * 3 + 1]    = col1.g;
      colors[vPtr * 3 + 2]    = col1.b;
      progresses[vPtr]        = prog1;
      streamIds[vPtr]         = k;
      vPtr++;

      // Vértice 2 del segmento
      positions[vPtr * 3]     = p2.x;
      positions[vPtr * 3 + 1] = p2.y;
      positions[vPtr * 3 + 2] = p2.z;
      colors[vPtr * 3]        = col2.r;
      colors[vPtr * 3 + 1]    = col2.g;
      colors[vPtr * 3 + 2]    = col2.b;
      progresses[vPtr]        = prog2;
      streamIds[vPtr]         = k;
      vPtr++;
    }
  }

  // Recorte a la cantidad real de vértices generados
  const realPos      = positions.subarray(0, vPtr * 3);
  const realCol      = colors.subarray(0, vPtr * 3);
  const realProg     = progresses.subarray(0, vPtr);
  const realIds      = streamIds.subarray(0, vPtr);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',  new THREE.BufferAttribute(realPos,  3));
  geometry.setAttribute('aColor',    new THREE.BufferAttribute(realCol,  3));
  geometry.setAttribute('aProgress', new THREE.BufferAttribute(realProg, 1));
  geometry.setAttribute('aStreamId', new THREE.BufferAttribute(realIds,  1));

  // Shader GLSL ultra-eficiente para renderizar las 600 estelas fluidas
  cfdShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime:        { value: 0.0 },
      uSpeed:       { value: 1.0 },
      uTrailLen:    { value: 0.28 },
      uGlobalAlpha: { value: 0.0 }, // 0.0 en HEATING -> se desvanece por completo
    },
    vertexShader: /* glsl */`
      attribute vec3  aColor;
      attribute float aProgress;
      attribute float aStreamId;

      uniform float uTime;
      uniform float uSpeed;
      uniform float uTrailLen;
      uniform float uGlobalAlpha;

      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;

        if (uGlobalAlpha < 0.001) {
          vAlpha = 0.0;
          gl_Position = vec4(0.0);
          return;
        }

        // Variación armónica individual por estela mediante pseudo-hash
        float speedMod = 0.85 + 0.35 * fract(sin(aStreamId * 12.9898) * 43758.5453);
        float phaseOff = fract(aStreamId * 0.6180339887); // Razón áurea

        // Posición de la cabeza de flujo cíclica [0, 1]
        float head = mod(uTime * 0.45 * uSpeed * speedMod + phaseOff, 1.0);
        float dist = mod(head - aProgress + 2.0, 1.0);

        if (dist > uTrailLen) {
          vAlpha = 0.0;
        } else {
          float norm = 1.0 - (dist / uTrailLen); // 0 = cola, 1 = cabeza
          float envelope = smoothstep(0.0, 0.25, norm)
                         * pow(norm, 0.70)
                         * (1.0 - smoothstep(0.85, 1.0, norm));
          vAlpha = clamp(envelope * 0.92 * uGlobalAlpha, 0.0, 1.0);
        }

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec3  vColor;
      varying float vAlpha;

      void main() {
        if (vAlpha < 0.003) discard;
        gl_FragColor = vec4(vColor, vAlpha);
      }
    `,
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  });

  cfdMesh = new THREE.LineSegments(geometry, cfdShaderMaterial);
  cfdMesh.frustumCulled = false;
  scene.add(cfdMesh);
}

// ═══════════════════════════════════════════════════════════════════
//  9. CONSTRUCCIÓN INTEGRAL DE LA ESCENA
// ═══════════════════════════════════════════════════════════════════
buildHyperReflectiveFloor();
buildRoomArchitecture();
buildCeilingLighting();
buildServerRacksAndDynamicLEDs();
buildConsolidatedCFDStreamlines();

// ═══════════════════════════════════════════════════════════════════
//  10. ACTUALIZACIÓN TERMODINÁMICA Y LEDS ASÍNCRONOS
// ═══════════════════════════════════════════════════════════════════
const hudTempEl    = document.getElementById('particle-count');
const hudCfdLiveEl = document.getElementById('cfd-streamlines-count');

const LED_PALETTE = {
  cool: new THREE.Color(0x00e5ff),  // Procesamiento normal / Frío (20°C)
  warm: new THREE.Color(0xff9900),  // Carga media / Alerta (24.5°C)
  hot:  new THREE.Color(0xff1500),  // Sobrecarga térmica crítica (29°C)
};

const CHASSIS_COLD = new THREE.Color(0x000618);
const CHASSIS_HOT  = new THREE.Color(0xff1200);

const tempColorHelper = new THREE.Color();

function updateThermodynamicCycle(dt, elapsedTime) {
  const tLoad = simParams.thermalLoad;

  // ── MÁQUINA DE ESTADOS REACTIVA ──────────────────────────────────
  if (simState === 'HEATING') {
    // 1. Fase de calentamiento: el fluido de aire permanece inactivo (opacidad 0)
    simTemp += HEAT_RATE * tLoad * dt;

    if (simTemp >= TEMP_MAX) {
      simTemp  = TEMP_MAX;
      simState = 'COOLING'; // Disparo automático de HVAC en umbral crítico (29°C)
    }

    // Desvanecimiento rápido si quedaba remanente de convección
    cfdOpacity = Math.max(0.0, cfdOpacity - dt * 2.2);

  } else { // 'COOLING'
    // 2. Fase de extracción reactiva forzada (CFD)
    simTemp -= COOL_RATE * dt;

    if (simTemp <= TEMP_MIN) {
      simTemp  = TEMP_MIN;
      simState = 'HEATING'; // Sala refrigerada a 20°C: reinicio del ciclo
    }

    // Se materializan las 600 líneas de flujo
    cfdOpacity = Math.min(1.0, cfdOpacity + dt * 1.5);
  }

  // Normalización de temperatura: 0.0 (20°C) a 1.0 (29°C)
  const tn = Math.max(0.0, Math.min(1.0, (simTemp - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)));

  // ── A. EMISIVIDAD DE RACKS SEGÚN T(x,y,z) = 20 + z² ──────────────
  rackChassisMat.emissive.lerpColors(CHASSIS_COLD, CHASSIS_HOT, Math.pow(tn, 1.6));
  rackChassisMat.emissiveIntensity = tn * 0.45;

  for (let u = 0; u < BLADES_TIER; u++) {
    const zFrac = u / (BLADES_TIER - 1);       // 0 (base) a 1 (cima del rack)
    const zQuad = Math.pow(zFrac, 1.85);       // Modela el término cuadrático z²
    const bladeT = tn * (0.15 + 0.85 * zQuad);

    const bMat = bladeTierMaterials[u];
    bMat.emissive.lerpColors(CHASSIS_COLD, CHASSIS_HOT, bladeT);
    bMat.emissiveIntensity = bladeT * (0.12 + 0.70 * zQuad);
  }

  // ── B. ACTUALIZACIÓN ASÍNCRONA DE LEDS DE PROCESAMIENTO ──────────
  if (ledInstancedMesh) {
    // Tinte cromático global de los LEDs según la temperatura del sistema
    if (tn < 0.5) {
      tempColorHelper.lerpColors(LED_PALETTE.cool, LED_PALETTE.warm, tn * 2.0);
    } else {
      tempColorHelper.lerpColors(LED_PALETTE.warm, LED_PALETTE.hot, (tn - 0.5) * 2.0);
    }

    const dynColor = new THREE.Color();

    for (let k = 0; k < TOTAL_LEDS; k++) {
      const phi = ledPhaseOffsets[k];

      // Función multi-armónica asíncrona: simula procesamiento continuo de algoritmos de IA
      const pulse = Math.abs(
        Math.sin(elapsedTime * 6.5 + phi) * 0.50 +
        Math.sin(elapsedTime * 14.8 + phi * 1.618) * 0.35 +
        Math.sin(elapsedTime * 28.2 + phi * 2.718) * 0.15
      );

      const intensity = Math.max(0.12, pulse * 2.4);
      dynColor.copy(tempColorHelper).multiplyScalar(intensity);

      ledInstancedMesh.setColorAt(k, dynColor);
    }
    ledInstancedMesh.instanceColor.needsUpdate = true;
  }

  // ── C. EXTRACTORES DE TECHO Y LUZ TÉRMICA ─────────────────────────
  thermalFillLight.intensity = tn * 8.5;
  thermalFillLight.color.lerpColors(CHASSIS_COLD, CHASSIS_HOT, tn);

  bloomPass.strength = 0.28 + tn * 0.22;

  const hvacActive = (simState === 'COOLING') ? cfdOpacity : 0.0;
  extractorUnits.forEach(({ light, ringMat }) => {
    light.intensity           = hvacActive * 6.0;
    ringMat.emissiveIntensity = hvacActive * 1.35;
  });

  // Paneles de techo: modulan sutilmente su color blanco hacia tonalidad cálida
  ceilEmissiveMat.emissive.setRGB(1.0, 1.0 - tn * 0.14, 1.0 - tn * 0.28);
  ceilingFixtures.forEach(l => {
    l.color.setRGB(1.0, 1.0 - tn * 0.12, 1.0 - tn * 0.24);
    l.intensity = 1.35 - tn * 0.25;
  });

  // ── D. SHADER DE LAS 600 ESTELAS CFD ─────────────────────────────
  if (cfdShaderMaterial) {
    cfdShaderMaterial.uniforms.uTime.value        = elapsedTime;
    cfdShaderMaterial.uniforms.uSpeed.value       = simParams.flowSpeed;
    cfdShaderMaterial.uniforms.uGlobalAlpha.value = cfdOpacity;
  }

  // ── E. TELEMETRÍA EN HUD ──────────────────────────────────────────
  if (frameCount % 4 === 0) {
    if (hudTempEl) {
      if (simState === 'HEATING') {
        hudTempEl.textContent = `${simTemp.toFixed(1)} °C  🔴 CALENTANDO (Aire OFF)`;
        hudTempEl.className   = 'hud-value hud-alert';
      } else {
        hudTempEl.textContent = `${simTemp.toFixed(1)} °C  🔵 ENFRIANDO (HVAC Activo)`;
        hudTempEl.className   = 'hud-value hud-highlight';
      }
    }

    if (hudCfdLiveEl) {
      if (simState === 'COOLING' && cfdOpacity > 0.05) {
        hudCfdLiveEl.textContent = `600 Streamlines (Flujo ∇·F = 1.7 Activo)`;
        hudCfdLiveEl.style.color = '#00ffee';
      } else {
        hudCfdLiveEl.textContent = `600 Streamlines (Standby)`;
        hudCfdLiveEl.style.color = '#48cae4';
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  11. BUCLE DE RENDERIZADO (60 FPS ESTABLES)
//      - Sin traslaciones ni rotaciones parásitas de objetos
// ═══════════════════════════════════════════════════════════════════
const clock = new THREE.Clock();
let frameCount = 0;

function renderLoop() {
  requestAnimationFrame(renderLoop);

  const dt          = Math.min(clock.getDelta(), 0.05);
  const elapsedTime = clock.getElapsedTime();
  frameCount++;

  // Actualización de amortiguación de cámara
  controls.update();

  // Actualización de física termodinámica y algoritmos
  updateThermodynamicCycle(dt, elapsedTime);

  // Renderizado post-procesado
  composer.render();
}

renderLoop();

// ═══════════════════════════════════════════════════════════════════
//  12. ENLACE DE PARÁMETROS INTERACTIVOS (UI SLIDERS)
// ═══════════════════════════════════════════════════════════════════
(function setupSimulationSliders() {
  const sf = document.getElementById('slider-flow');
  const st = document.getElementById('slider-thermal');
  const bf = document.getElementById('badge-flow');
  const bt = document.getElementById('badge-thermal');

  if (sf && bf) {
    sf.addEventListener('input', () => {
      simParams.flowSpeed = parseFloat(sf.value);
      bf.textContent = simParams.flowSpeed.toFixed(2) + '×';
    });
  }

  if (st && bt) {
    st.addEventListener('input', () => {
      simParams.thermalLoad = parseFloat(st.value);
      bt.textContent = simParams.thermalLoad.toFixed(2) + '×';
    });
  }
})();

// ═══════════════════════════════════════════════════════════════════
//  13. RESPONSIVE Y CONTROL DE REDIMENSIONAMIENTO
// ═══════════════════════════════════════════════════════════════════
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
});
