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
 * Streetlight bulb with rays radiating from the equator — a light sensor.
 * This is the one shape with genuinely different geometry/colour behaviour
 * for day vs night, not just an animation: by day it's a dull grey bulb
 * with no rays at all (switched off), by night it turns amber, glows, and
 * spins its rays slowly. The colour it's constructed with is intentionally
 * ignored for the bulb/rays themselves — see `DEFAULT_SHAPE_COLORS` — only
 * the dark fixture housing stays neutral regardless of day/night.
 */
function buildLight(_color: THREE.Color, radius: number): BuiltMarker {
  const group = new THREE.Group();
  const DAY_COLOR = new THREE.Color('#9ca3af');
  const NIGHT_COLOR = new THREE.Color('#fde047');

  const material = new THREE.MeshStandardMaterial({
    color: DAY_COLOR.clone(),
    emissive: DAY_COLOR.clone(),
    emissiveIntensity: 0.05,
    roughness: 0.5,
  });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 16), material);
  group.add(coreMesh);

  // Small dark fixture housing beneath the bulb — reads as a real light
  // fitting rather than a bare glowing ball, and doesn't change with
  // day/night since a fixture's casing doesn't glow either way.
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.45, radius * 0.6, radius * 0.4, 10),
    new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.7 }),
  );
  housing.position.set(0, -radius * 0.95, 0);
  group.add(housing);

  const rayCount = 8;
  const rayLength = radius * 0.9;
  const rayGeometry = new THREE.CylinderGeometry(radius * 0.06, radius * 0.06, rayLength, 6);
  const rayMaterial = decorationMaterial(NIGHT_COLOR.clone(), 0.85);
  const rayGroup = new THREE.Group();
  for (let i = 0; i < rayCount; i += 1) {
    const angle = (i / rayCount) * Math.PI * 2;
    const ray = new THREE.Mesh(rayGeometry, rayMaterial);
    const inner = radius * 1.15;
    const outer = inner + rayLength;
    const mid = (inner + outer) / 2;
    ray.position.set(Math.cos(angle) * mid, 0, Math.sin(angle) * mid);
    // Cylinders default to standing on Y; lay them flat and point outward.
    ray.rotation.z = Math.PI / 2;
    ray.rotation.y = -angle;
    rayGroup.add(ray);
  }
  // Rays exist only at night — by day the light is switched off, so there's
  // nothing radiating out from it at all, not just a dim version of it.
  rayGroup.visible = false;
  group.add(rayGroup);

  const update = (elapsed: number, isNight: boolean) => {
    // Smoothly fades the bulb colour between day/night rather than
    // snapping, so flipping the toggle doesn't look like a hard cut.
    const target = isNight ? NIGHT_COLOR : DAY_COLOR;
    material.color.lerp(target, 0.08);
    material.emissive.lerp(target, 0.08);

    if (isNight) {
      // Kept modest on purpose: with the scene's environment lighting and
      // renderer exposure now also dimmed for Night (see the isNight effect
      // in the main viewer), a bulb tuned to blow out against a bright Day
      // scene reads as way too luminous against the now much darker Night
      // scene — this glow should stand out against the dark, not wash it out.
      material.emissiveIntensity = 0.4 + Math.sin(elapsed * 3) * 0.15;
      rayGroup.visible = true;
      rayMaterial.opacity = 0.55 + Math.sin(elapsed * 3) * 0.15;
      rayGroup.rotation.y = elapsed * 0.15;
    } else {
      material.emissiveIntensity = 0.05;
      rayGroup.visible = false;
    }
  };

  return { group, coreMesh, update };
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

const BUILDERS: Record<
  MarkerShapeId,
  (color: THREE.Color, radius: number) => BuiltMarker
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
): BuiltMarker {
  const builder = BUILDERS[(shape as MarkerShapeId) || DEFAULT_MARKER_SHAPE];
  return (builder || buildSphere)(color, radius);
}
