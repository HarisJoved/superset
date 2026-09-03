/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import * as THREE from 'three';

/**
 * Built-in procedural marker shapes. There's no 3D-file import here (that's
 * explicitly out of scope for now) — every shape below is built from plain
 * three.js primitives, cheap to construct per marker, and needs no loading
 * state or network fetch.
 *
 * Every shape is now a pole + head, mirroring the sensor-marker look from
 * the mining-scenario reference viewer (thin pole planted at the sensor's
 * position, animated head on top), and every shape animates in some way —
 * not just `light`, `dust` and `noise` as before.
 */
export type MarkerShapeId =
  | 'sphere'
  | 'pin'
  | 'light'
  | 'dust'
  | 'noise'
  | 'cube'
  | 'diamond';

export const DEFAULT_MARKER_SHAPE: MarkerShapeId = 'sphere';

export interface MarkerShapeOption {
  id: MarkerShapeId;
  label: string;
  description: string;
}

export const MARKER_SHAPE_OPTIONS: MarkerShapeOption[] = [
  { id: 'sphere', label: 'Sphere', description: 'Pole beacon with a slow pulsing glow — works for any sensor.' },
  { id: 'pin', label: 'Pin', description: 'Map-pin, tip sits exactly on the sensor, head glows gently.' },
  { id: 'light', label: 'Light sensor', description: 'Streetlight bulb — grey and dark by day, glowing amber with rays at night.' },
  { id: 'dust', label: 'Dust / air sensor', description: 'Pole with a drifting particle cloud and pulsing dust rings.' },
  { id: 'noise', label: 'Noise sensor', description: 'Pole with a mic head, expanding sound rings and an animated waveform.' },
  { id: 'cube', label: 'Cube', description: 'Pole-mounted housing with an edge outline and a blinking status LED.' },
  { id: 'diamond', label: 'Diamond', description: 'Pole with a faceted, slowly rotating diamond that breathes light like a stockpile marker.' },
];

/**
 * Sensible starting colour per shape, used when a model hasn't had a colour
 * explicitly set in the placement editor — so a freshly-assigned "Noise
 * sensor" shape reads as purple out of the box instead of every unstyled
 * model defaulting to the same generic blue.
 *
 * "light" is a fixed exception: it ignores whatever colour it's given
 * entirely and always renders grey by day / amber by night (see
 * `buildLight`) — its entry here exists only so the model-colour swatch in
 * the placement editor has something sane to show, not because it affects
 * the marker's actual on-screen colour.
 */
export const DEFAULT_SHAPE_COLORS: Record<MarkerShapeId, string> = {
  sphere: '#2563eb',
  pin: '#ef4444',
  light: '#fbbf24',
  dust: '#a8a29e',
  noise: '#8b5cf6',
  cube: '#0ea5e9',
  diamond: '#06b6d4',
};

export interface BuiltMarker {
  /** Root object — position this at the device's location and add it to
   * the scene. Contains the hit-testable core plus any decoration. */
  group: THREE.Group;
  /** The single mesh that should be raycast against for clicks — set
   * `userData.device` on this and push it into the raycast list. Every
   * shape below exposes exactly one, sized close to `radius`, so hit
   * testing stays simple regardless of which shape is active. */
  coreMesh: THREE.Mesh;
  /** Called once per rendered frame with elapsed seconds since the marker
   * was built and whether day/night mode is currently "night". Every shape
   * below defines one — even shapes with no day/night-specific behaviour
   * still idle-animate (pulse, drift, spin) so nothing on the model reads
   * as static. */
  update?: (elapsed: number, isNight: boolean) => void;
  /** Local-space Y offset (in the same units as `radius`) the caller should
   * place the device-name label at, so the label floats just above this
   * shape's head instead of the marker's base position. Shapes without a
   * pole omit this and the caller falls back to `radius`. */
  labelOffsetY?: number;
}

function coreMaterial(color: THREE.Color, emissiveIntensity = 0.25): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    // A touch of self-illumination keeps markers readable when they sit in
    // the model's shadow, without washing the chosen colour out.
    emissive: color,
    emissiveIntensity,
    roughness: 0.4,
  });
}

function decorationMaterial(
  color: THREE.Color,
  opacity: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** Thin vertical pole planted at the marker's base, matching the
 * pole-mounted sensor look used throughout the reference scene. Returned
 * pole is already positioned (base at y=0, running up to `height`). */
function buildPole(color: THREE.Color, poleRadius: number, height: number): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color: color.clone().multiplyScalar(0.65),
    emissive: color,
    emissiveIntensity: 0.18,
    roughness: 0.55,
    metalness: 0.15,
  });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(poleRadius, poleRadius, height, 10), material);
  pole.position.y = height / 2;
  return pole;
}

function buildSphere(color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const poleHeight = radius * 3.2;
  group.add(buildPole(color, radius * 0.12, poleHeight));

  const headMaterial = coreMaterial(color, 0.3);
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), headMaterial);
  coreMesh.position.y = poleHeight;
  group.add(coreMesh);

  // Soft halo beneath the head that breathes in and out — a generic "this
  // sensor is alive" beacon pulse for the shape used when nothing more
  // specific applies.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.1, radius * 1.5, 24),
    decorationMaterial(color, 0.35),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = poleHeight - radius * 0.1;
  group.add(halo);

  const update = (elapsed: number) => {
    const pulse = 1 + Math.sin(elapsed * 1.6) * 0.08;
    coreMesh.scale.setScalar(pulse);
    headMaterial.emissiveIntensity = 0.28 + Math.sin(elapsed * 1.6) * 0.14;
    const haloPulse = 1 + Math.sin(elapsed * 1.6 + 0.6) * 0.25;
    halo.scale.setScalar(haloPulse);
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(elapsed * 1.6 + 0.6) * 0.15;
  };

  return { group, coreMesh, update, labelOffsetY: poleHeight + radius * 1.6 };
}

function buildCube(color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const poleHeight = radius * 3;
  group.add(buildPole(color, radius * 0.12, poleHeight));

  const size = radius * 1.6;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const headMaterial = coreMaterial(color, 0.22);
  const coreMesh = new THREE.Mesh(geometry, headMaterial);
  coreMesh.position.y = poleHeight + size / 2;
  group.add(coreMesh);

  // A thin edge outline reads as a housing/casing rather than a flat-shaded
  // block — cheap (one extra line object) and makes the cube legible even
  // when it's small on screen.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.35 }),
  );
  edges.position.copy(coreMesh.position);
  group.add(edges);

  // Blinking status LED on top of the housing — the "device is online"
  // heartbeat that gives an otherwise static box some life.
  const ledMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.18, 10, 10), ledMaterial);
  led.position.set(0, poleHeight + size + radius * 0.22, 0);
  group.add(led);

  const update = (elapsed: number) => {
    const blink = (Math.sin(elapsed * 3.2) + 1) / 2; // 0..1
    ledMaterial.opacity = 0.25 + blink * 0.75;
    headMaterial.emissiveIntensity = 0.18 + blink * 0.12;
  };

  return { group, coreMesh, update, labelOffsetY: poleHeight + size + radius * 0.9 };
}

function buildDiamond(color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const poleHeight = radius * 2.6;
  group.add(buildPole(color, radius * 0.12, poleHeight));

  const headGroup = new THREE.Group();
  headGroup.position.y = poleHeight + radius * 1.25;
  group.add(headGroup);

  const headMaterial = coreMaterial(color, 0.3);
  const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(radius * 1.25, 0), headMaterial);
  headGroup.add(coreMesh);

  // A thin equatorial band gives the facets something to catch the light
  // against, instead of reading as a flat grey diamond from a distance.
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.05, radius * 0.05, 8, 24),
    decorationMaterial(color, 0.6),
  );
  band.rotation.x = Math.PI / 2;
  headGroup.add(band);

  const update = (elapsed: number) => {
    // Slow continuous spin plus a stockpile-like breathing glow, rather
    // than a static gem.
    headGroup.rotation.y = elapsed * 0.5;
    const breathe = 0.28 + (Math.sin(elapsed * 1.1) + 1) * 0.5 * 0.22;
    headMaterial.emissiveIntensity = breathe;
  };

  return { group, coreMesh, update, labelOffsetY: poleHeight + radius * 2.6 };
}

/** Classic map pin: the tip sits at the group's local origin (i.e. exactly
 * on the device's placed position), with the round head above it. */
function buildPin(color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const headRadius = radius * 1.1;
  const stemHeight = radius * 2.4;

  const headMaterial = coreMaterial(color, 0.25);
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 18, 18), headMaterial);
  coreMesh.position.set(0, stemHeight, 0);
  group.add(coreMesh);

  const stem = new THREE.Mesh(
    new THREE.ConeGeometry(headRadius * 0.55, stemHeight, 14),
    coreMaterial(color, 0.2),
  );
  // A cone's local origin is its centre, tip pointing +Y by default — flip
  // it point-down and lift so the tip lands exactly at the origin.
  stem.rotation.z = Math.PI;
  stem.position.set(0, stemHeight / 2, 0);
  group.add(stem);

  const update = (elapsed: number) => {
    // Gentle glow breathing so a pin doesn't read as the one static shape
    // on an otherwise animated scene.
    headMaterial.emissiveIntensity = 0.2 + Math.sin(elapsed * 1.8) * 0.12;
  };

  return { group, coreMesh, update, labelOffsetY: stemHeight + headRadius * 2 };
}

/**
 * Soft radial-gradient billboard texture used for the light shape's glow —
 * generated once on a &lt;canvas&gt; and shared across every "light" marker
 * instance (only the SpriteMaterial wrapping it, which carries the
 * per-instance opacity/colour animation, is created per marker) instead of
 * one canvas per marker.
 */
let cachedGlowTexture: THREE.Texture | null = null;
function getGlowTexture(): THREE.Texture | null {
  if (cachedGlowTexture) return cachedGlowTexture;
  if (typeof document === 'undefined') return null; // guards non-browser bundling/tests
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,244,214,0.65)');
  gradient.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  cachedGlowTexture = new THREE.CanvasTexture(canvas);
  return cachedGlowTexture;
}

/**
 * A proper streetlamp — pole, angled arm, fixture hood and bulb — for the
 * light-sensor shape, replacing the old bare bulb-with-ray-spokes look.
 * Day vs night is still the one shape with genuinely different behaviour
 * rather than just an idle animation: by day the bulb is a dull grey and
 * switched off (no glow, no light cast); by night it turns warm, gets a
 * soft camera-facing glow halo instead of thin ray lines, and casts a real
 * `THREE.PointLight` so it visibly brightens the model around it — not just
 * itself — the way an actual streetlight would. The fixture itself (pole,
 * arm, hood) stays neutral grey/dark regardless of day/night, same as
 * before, since a fitting's casing doesn't glow either way.
 *
 * The point light's `intensity`/`distance` below are scaled off `radius`
 * (itself proportional to the loaded model's size) so they land in a
 * reasonable range across differently-scaled models, but "reasonable" for
 * a real-time point light is inherently a per-scene visual judgement call —
 * treat these as a starting point and nudge them if a given model's lights
 * look too dim or too blown-out.
 *
 * `options.castLight` (see the viewer's `buildDeviceGroup`) lets the caller
 * skip the point light for this instance entirely while keeping everything
 * else (bulb colour, glow sprite) — used to cap how many real lights a
 * scene with lots of light sensors ends up with.
 */
function buildLight(
  _color: THREE.Color,
  radius: number,
  options: MarkerShapeOptions = {},
): BuiltMarker {
  const castLight = options.castLight !== false;
  const group = new THREE.Group();
  const DAY_BULB = new THREE.Color('#9ca3af');
  const NIGHT_BULB = new THREE.Color('#ffd98a');
  const GLOW_COLOR = new THREE.Color('#ffe6b0');

  const fixtureMaterial = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.7,
    metalness: 0.2,
  });

  const poleHeight = radius * 3.4;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.1, radius * 0.12, poleHeight, 10),
    fixtureMaterial,
  );
  pole.position.y = poleHeight / 2;
  group.add(pole);

  // Bulb hangs out and slightly down from the pole top, like a real
  // streetlight arm, rather than sitting on the pole itself.
  const poleTop = new THREE.Vector3(0, poleHeight, 0);
  const bulbPos = new THREE.Vector3(radius * 1.7, poleHeight - radius * 0.55, 0);
  const armDir = bulbPos.clone().sub(poleTop);
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.14, armDir.length(), radius * 0.14),
    fixtureMaterial,
  );
  arm.position.copy(poleTop).addScaledVector(armDir, 0.5);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armDir.clone().normalize());
  group.add(arm);

  // Small hood just above the bulb so it reads as a fixture, not a bare ball.
  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.32, radius * 0.32, 10),
    fixtureMaterial,
  );
  hood.position.copy(bulbPos).add(new THREE.Vector3(0, radius * 0.28, 0));
  group.add(hood);

  const bulbMaterial = new THREE.MeshStandardMaterial({
    color: DAY_BULB.clone(),
    emissive: DAY_BULB.clone(),
    emissiveIntensity: 0.05,
    roughness: 0.4,
  });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.42, 14, 14), bulbMaterial);
  coreMesh.position.copy(bulbPos);
  group.add(coreMesh);

  // Soft glow halo — a camera-facing sprite instead of the old ray spokes.
  const glowTexture = getGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture ?? undefined,
    color: GLOW_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.position.copy(bulbPos);
  glow.scale.setScalar(radius * 7);
  group.add(glow);

  // Casts real light onto the model/other markers nearby at night — this is
  // what makes the lamp brighten its surroundings instead of just glowing
  // itself. Off (intensity 0) by day. Skipped entirely (not just left at
  // zero intensity) when `castLight` is false, since even a dark light
  // still costs a shader pass — the viewer caps how many of these get
  // built at once for scenes with a lot of light sensors.
  let pointLight: THREE.PointLight | null = null;
  if (castLight) {
    pointLight = new THREE.PointLight(NIGHT_BULB.clone(), 0, radius * 40, 1);
    pointLight.position.copy(bulbPos);
    group.add(pointLight);
  }

  const update = (elapsed: number, isNight: boolean) => {
    // Smoothly fades the bulb colour between day/night rather than
    // snapping, so flipping the toggle doesn't look like a hard cut.
    const target = isNight ? NIGHT_BULB : DAY_BULB;
    bulbMaterial.color.lerp(target, 0.08);
    bulbMaterial.emissive.lerp(target, 0.08);

    if (isNight) {
      const flicker = 0.9 + Math.sin(elapsed * 3) * 0.1;
      bulbMaterial.emissiveIntensity = 0.6 * flicker;
      glowMaterial.opacity += (0.55 * flicker - glowMaterial.opacity) * 0.15;
      if (pointLight) {
        pointLight.intensity += (radius * 45 * flicker - pointLight.intensity) * 0.15;
      }
    } else {
      bulbMaterial.emissiveIntensity = 0.05;
      glowMaterial.opacity += (0 - glowMaterial.opacity) * 0.15;
      if (pointLight) {
        pointLight.intensity += (0 - pointLight.intensity) * 0.15;
      }
    }
  };

  return { group, coreMesh, update, labelOffsetY: poleHeight + radius * 1.3 };
}

/** Pole-mounted dust / air-quality sensor: a pulsing head, a scattered
 * particle cloud that drifts around it, and expanding "dust ring" pulses —
 * closer in spirit to the reference viewer's pole-mounted dust marker than
 * the old bare drifting-cloud version. */
function buildDust(color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const poleHeight = radius * 3.2;
  group.add(buildPole(color, radius * 0.12, poleHeight));

  const headMaterial = coreMaterial(color, 0.3);
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 14, 14), headMaterial);
  coreMesh.position.y = poleHeight;
  group.add(coreMesh);

  const particleGeometry = new THREE.SphereGeometry(radius * 0.18, 6, 6);
  const particleMaterial = decorationMaterial(color, 0.75);
  const particleCount = 10;
  const particles: {
    mesh: THREE.Mesh;
    baseAngle: number;
    distance: number;
    elevation: number;
    speed: number;
  }[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    // Deterministic pseudo-scatter: golden-angle spiral in azimuth, a small
    // fixed set of elevations/distances so particles read as a cloud
    // rather than a ring.
    const baseAngle = i * 2.399963; // golden angle, radians
    const elevation = poleHeight + ((i % 3) - 1) * radius * 0.5;
    const distance = radius * (1.1 + (i % 4) * 0.22);
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial);
    mesh.position.set(
      Math.cos(baseAngle) * distance,
      elevation,
      Math.sin(baseAngle) * distance,
    );
    group.add(mesh);
    // Alternate drift direction and vary speed a little per particle so the
    // cloud reads as loosely drifting rather than rigidly rotating in lockstep.
    const speed = (0.25 + (i % 3) * 0.12) * (i % 2 === 0 ? 1 : -1);
    particles.push({ mesh, baseAngle, distance, elevation, speed });
  }

  // Expanding "dust ring" pulses around the head, echoing the reference
  // viewer's dust-sensor rings.
  const ringGeometry = new THREE.RingGeometry(radius * 0.7, radius * 1.0, 28);
  const rings: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; offset: number }[] = [];
  [0, 0.5, 1.0].forEach(offset => {
    const material = decorationMaterial(color, 0.5);
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = poleHeight;
    group.add(mesh);
    rings.push({ mesh, material, offset });
  });

  const RING_PERIOD = 2.2;
  const update = (elapsed: number) => {
    particles.forEach(p => {
      const angle = p.baseAngle + elapsed * p.speed;
      const bob = Math.sin(elapsed * 1.3 + p.baseAngle) * radius * 0.15;
      p.mesh.position.set(
        Math.cos(angle) * p.distance,
        p.elevation + bob,
        Math.sin(angle) * p.distance,
      );
    });
    rings.forEach(r => {
      const t = (((elapsed + r.offset) % RING_PERIOD) + RING_PERIOD) % RING_PERIOD / RING_PERIOD;
      r.mesh.scale.setScalar(1 + t * 1.6);
      r.material.opacity = 0.45 * (1 - t);
    });
    headMaterial.emissiveIntensity = 0.28 + Math.sin(elapsed * 1.6) * 0.12;
  };

  return { group, coreMesh, update, labelOffsetY: poleHeight + radius * 1.6 };
}

/** Pole-mounted noise sensor: a pulsing mic head, expanding sonar-style
 * rings, and an animated three-bar waveform beside it — matching the
 * reference viewer's noise marker much more closely than a plain speaker
 * cone. */
function buildNoise(color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const poleHeight = radius * 3.2;
  group.add(buildPole(color, radius * 0.12, poleHeight));

  const headMaterial = coreMaterial(color, 0.3);
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.4, 14, 14), headMaterial);
  coreMesh.position.y = poleHeight;
  group.add(coreMesh);

  // Expanding sonar-style rings around the mic head.
  const ringGeometry = new THREE.TorusGeometry(radius * 0.7, radius * 0.025, 8, 24);
  const rings: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; phaseOffset: number }[] = [];
  [0, 1, 2].forEach(idx => {
    const material = decorationMaterial(color, 0.5);
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = poleHeight;
    group.add(mesh);
    rings.push({ mesh, material, phaseOffset: idx * 0.5 });
  });

  // Small animated waveform bars beside the head, like an audio level
  // meter — three bars whose heights ripple out of phase with each other.
  const barMaterial = decorationMaterial(color, 0.85);
  const bars: { mesh: THREE.Mesh; xOffset: number; baseHeight: number; phase: number }[] = [];
  [-1, 0, 1].forEach((xOffset, idx) => {
    const baseHeight = radius * (0.35 + Math.abs(xOffset) * 0.15);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.16, baseHeight, radius * 0.16), barMaterial);
    mesh.position.set(xOffset * radius * 0.55, poleHeight, radius * 0.65);
    group.add(mesh);
    bars.push({ mesh, xOffset, baseHeight, phase: idx * 1.1 });
  });

  const update = (elapsed: number) => {
    rings.forEach(r => {
      const phase = elapsed * 1.5 + r.phaseOffset;
      const scale = 1 + Math.sin(phase) * 0.3;
      r.mesh.scale.setScalar(scale);
      r.material.opacity = 0.35 + Math.sin(phase) * 0.25;
    });
    const headPulse = 1 + Math.sin(elapsed * 2.4) * 0.12;
    coreMesh.scale.setScalar(headPulse);
    bars.forEach(b => {
      const level = 0.5 + Math.sin(elapsed * 4 + b.phase) * 0.5; // 0..1
      const h = b.baseHeight * (0.4 + level * 0.9);
      b.mesh.scale.y = h / b.baseHeight;
    });
  };

  return { group, coreMesh, update, labelOffsetY: poleHeight + radius * 1.6 };
}

/** Per-marker build options — currently only used by the `light` shape. */
export interface MarkerShapeOptions {
  /** Whether this light marker gets a real `THREE.PointLight` (see
   * `buildLight`). Defaults to true; the viewer caps how many markers get
   * one so a scene with many light sensors doesn't accumulate dozens of
   * live lights. Ignored by every shape except `light`. */
  castLight?: boolean;
}

const BUILDERS: Record<
  MarkerShapeId,
  (color: THREE.Color, radius: number, options?: MarkerShapeOptions) => BuiltMarker
> = {
  sphere: buildSphere,
  pin: buildPin,
  light: buildLight,
  dust: buildDust,
  noise: buildNoise,
  cube: buildCube,
  diamond: buildDiamond,
};

export function buildMarkerShape(
  shape: MarkerShapeId | string | undefined,
  color: THREE.Color,
  radius: number,
  options?: MarkerShapeOptions,
): BuiltMarker {
  const builder = BUILDERS[(shape as MarkerShapeId) || DEFAULT_MARKER_SHAPE];
  return (builder || buildSphere)(color, radius, options);
}
