// Procedural 3D models, built from Three.js primitives in code. Each model keeps
// the silhouette and colour cues of its original CGA sprite.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { graveTexture, leatherTexture } from './textures';

export interface Materials {
  env: THREE.Texture | null;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);

function shadow<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

// -----------------------------------------------------------------------------
// Digger

export interface DiggerModel {
  root: THREE.Group;
  /** Rotates to face the travel direction. */
  body: THREE.Group;
  drill: THREE.Object3D;
  wheels: THREE.Object3D[];
  beacon: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  lampMat: THREE.MeshStandardMaterial;
  /** Where the headlamp sits, in body space. */
  lampAnchor: THREE.Object3D;
  paint: THREE.MeshPhysicalMaterial;
}

export function makeDigger(m: Materials): DiggerModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = phys({ color: 0xd2321e, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.2, envMap: m.env, envMapIntensity: 0.8 });
  const dark = std({ color: 0x1c1b1f, roughness: 0.85 });
  const steel = std({ color: 0xc8ccd2, roughness: 0.28, metalness: 1, envMap: m.env, envMapIntensity: 1.2 });
  const brass = std({ color: 0xe7b24a, roughness: 0.25, metalness: 1, envMap: m.env, envMapIntensity: 1.2 });
  const yellow = phys({ color: 0xf2b630, roughness: 0.4, metalness: 0.1, clearcoat: 0.6, envMap: m.env, envMapIntensity: 0.6 });

  // Chassis
  const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.5, 0.9, 3, 0.12), paint);
  chassis.position.set(-0.05, -0.05, 0);
  body.add(chassis);
  // Yellow hazard stripe along the side
  const stripe = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.1, 0.92, 2, 0.04), yellow);
  stripe.position.set(-0.05, -0.12, 0);
  body.add(stripe);

  // Cab with a glass canopy
  const cab = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.42, 0.74, 3, 0.12), paint);
  cab.position.set(-0.28, 0.36, 0);
  body.add(cab);
  const glass = phys({ color: 0x8fd3ff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.85, clearcoat: 1, envMap: m.env, envMapIntensity: 1.5, emissive: 0x0b2a40 });
  const window = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.26, 0.78, 2, 0.06), glass);
  window.position.set(-0.18, 0.4, 0);
  body.add(window);

  // Headlamp on the cab
  const lampMat = std({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 1.4, roughness: 0.2 });
  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 16), brass);
  lampHousing.rotation.z = Math.PI / 2;
  lampHousing.position.set(0.03, 0.42, 0.2);
  body.add(lampHousing);
  const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), lampMat);
  lamp.rotation.y = Math.PI / 2;
  lamp.position.set(0.1, 0.42, 0.2);
  body.add(lamp);
  const lampAnchor = new THREE.Object3D();
  lampAnchor.position.set(0.12, 0.42, 0.2);
  body.add(lampAnchor);

  // "Ready to fire" beacon
  const beaconMat = std({ color: 0x3cff9a, emissive: 0x3cff9a, emissiveIntensity: 2.5, roughness: 0.2 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), beaconMat);
  beacon.position.set(-0.38, 0.62, 0);
  body.add(beacon);
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 12), steel);
  beaconBase.position.set(-0.38, 0.57, 0);
  body.add(beaconBase);

  // Exhaust stack
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.32, 10), steel);
  stack.position.set(-0.55, 0.32, -0.22);
  body.add(stack);

  // Treads with wheels
  const wheels: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const tread = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.36, 0.2, 3, 0.16), dark);
    tread.position.set(-0.02, -0.34, side * 0.42);
    body.add(tread);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14), brass);
      hub.rotation.x = Math.PI / 2;
      w.add(hub);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), dark);
      w.add(spoke);
      w.position.set(-0.45 + i * 0.43, -0.34, side * 0.53);
      body.add(w);
      wheels.push(w);
    }
  }

  // Drill: a polished cone with a helical flute
  const drill = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 24, 1), steel);
  cone.rotation.z = -Math.PI / 2;
  cone.position.x = 0.31;
  drill.add(cone);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const r = 0.3 * (1 - t) + 0.015;
    const a = t * Math.PI * 7;
    pts.push(new THREE.Vector3(t * 0.6, Math.cos(a) * r, Math.sin(a) * r));
  }
  const flute = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.028, 6), brass);
  drill.add(flute);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 24), brass);
  collar.rotation.z = Math.PI / 2;
  drill.add(collar);
  drill.position.set(0.52, -0.05, 0);
  body.add(drill);

  shadow(root);
  return { root, body, drill, wheels, beacon, beaconMat, lampMat, lampAnchor, paint };
}

// -----------------------------------------------------------------------------
// Nobbin / Hobbin

export interface MonsterModel {
  root: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshPhysicalMaterial;
  face: THREE.Group;
  pupils: THREE.Mesh[];
  lids: THREE.Mesh[];
  feet: THREE.Mesh[];
  arms: THREE.Group[];
  mouth: THREE.Group;
  jaw: THREE.Mesh;
}

export function makeMonster(m: Materials): MonsterModel {
  const root = new THREE.Group();
  const bodyMat = phys({
    color: 0x2fae36,
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.2,
    sheen: 0.25,
    sheenColor: new THREE.Color(0x3a8a30),
    emissive: 0x041a04,
    envMap: m.env,
    envMapIntensity: 0.35,
  });
  const geo = new THREE.SphereGeometry(0.6, 40, 28);
  // Slightly pear-shaped, flatter at the bottom.
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const s = 1 + (y < 0 ? -y * 0.25 : -y * 0.12);
    p.setX(i, p.getX(i) * s);
    p.setZ(i, p.getZ(i) * s * 0.9);
    if (y < -0.4) p.setY(i, -0.4 - (y + 0.4) * 0.4);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, bodyMat);
  root.add(body);

  // Face (eyes and mouth) faces the camera (+z) and turns slightly toward travel.
  const face = new THREE.Group();
  root.add(face);
  const white = phys({ color: 0xe8e8e8, roughness: 0.2, clearcoat: 1, envMap: m.env, envMapIntensity: 0.4 });
  const black = std({ color: 0x0a0a0c, roughness: 0.3 });
  const lidMat = phys({ color: 0x2e9a35, roughness: 0.35, clearcoat: 0.8 });
  const pupils: THREE.Mesh[] = [];
  const lids: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 18), white);
    eye.scale.set(1, 1.15, 0.8);
    eye.position.set(side * 0.2, 0.18, 0.44);
    face.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), black);
    pupil.position.set(side * 0.2, 0.18, 0.6);
    face.add(pupil);
    pupils.push(pupil);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    lid.position.copy(eye.position);
    lid.scale.set(1.04, 1.2, 0.86);
    lid.rotation.x = -0.9;
    face.add(lid);
    lids.push(lid);
  }
  const mouth = new THREE.Group();
  const mouthMat = std({ color: 0x5a0f12, roughness: 0.6 });
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mouthMat);
  jaw.scale.set(1.3, 0.55, 0.6);
  mouth.add(jaw);
  const toothMat = std({ color: 0xfff8e8, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 6), toothMat);
    t.rotation.x = Math.PI;
    t.position.set(-0.12 + i * 0.08, -0.01, 0.07);
    mouth.add(t);
  }
  mouth.position.set(0, -0.12, 0.47);
  face.add(mouth);

  // Little red feet (the CGA sprite's red/brown accents)
  const footMat = phys({ color: 0xd13a22, roughness: 0.4, clearcoat: 0.5 });
  const feet: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), footMat);
    f.scale.set(1.3, 0.55, 1.1);
    f.position.set(side * 0.24, -0.42, 0.08);
    root.add(f);
    feet.push(f);
  }

  // Hobbin arms with claws (hidden while a Nobbin)
  const arms: THREE.Group[] = [];
  const clawMat = std({ color: 0xf0e6d0, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.32, 6, 10), bodyMat);
    upper.rotation.z = (side * Math.PI) / 2.6;
    upper.position.set(side * 0.18, 0, 0);
    arm.add(upper);
    for (let c = 0; c < 3; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), clawMat);
      claw.position.set(side * 0.36, 0.08 - c * 0.07, 0.04);
      claw.rotation.z = -side * (Math.PI / 2 - 0.3);
      arm.add(claw);
    }
    arm.position.set(side * 0.5, -0.05, 0.1);
    root.add(arm);
    arms.push(arm);
  }

  shadow(root);
  return { root, body, bodyMat, face, pupils, lids, feet, arms, mouth, jaw };
}

// -----------------------------------------------------------------------------
// Gold bag and gold

export interface BagModel {
  root: THREE.Group;
  /** Pivot at the base for wobbling. */
  pivot: THREE.Group;
  sack: THREE.Group;
}

let leather: THREE.CanvasTexture | null = null;

export function makeBag(m: Materials): BagModel {
  leather ??= leatherTexture();
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = -0.62;
  root.add(pivot);
  const sack = new THREE.Group();
  sack.position.y = 0.62;
  pivot.add(sack);
  const mat = std({ map: leather, color: 0xd8b088, roughness: 0.82, metalness: 0, envMap: m.env, envMapIntensity: 0.2 });
  const profile: THREE.Vector2[] = [];
  const pts: [number, number][] = [
    [0.0, -0.62],
    [0.4, -0.6],
    [0.62, -0.46],
    [0.7, -0.22],
    [0.64, 0.04],
    [0.46, 0.24],
    [0.24, 0.34],
    [0.15, 0.4],
    [0.22, 0.5],
    [0.34, 0.6],
    [0.28, 0.66],
    [0.12, 0.62],
    [0.0, 0.6],
  ];
  for (const [x, y] of pts) profile.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(new THREE.SplineCurve(profile).getPoints(40), 40);
  // Add lumpy irregularity so it reads as a soft sack.
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 5 + y * 3) * 0.035 * (y < 0.3 ? 1 : 0.3);
    p.setX(i, x * k);
    p.setZ(i, z * k * 0.85);
  }
  g.computeVertexNormals();
  const body = new THREE.Mesh(g, mat);
  body.rotation.y = -Math.PI / 2; // put the "$" (u = 0.25) on the front
  sack.add(body);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 24), std({ color: 0xd9b26a, roughness: 0.9 }));
  rope.rotation.x = Math.PI / 2;
  rope.position.y = 0.44;
  sack.add(rope);
  shadow(root);
  return { root, pivot, sack };
}

export interface GoldModel {
  root: THREE.Group;
  pieces: THREE.Object3D[];
}

export function goldMaterial(m: Materials): THREE.MeshStandardMaterial {
  return std({ color: 0xffc13b, roughness: 0.22, metalness: 1, envMap: m.env, envMapIntensity: 1.6, emissive: 0x3a2200 });
}

/** A heap of coins and nuggets; `pieces` are revealed progressively as the bag bursts. */
export function makeGold(m: Materials): GoldModel {
  const root = new THREE.Group();
  const mat = goldMaterial(m);
  const coin = new THREE.CylinderGeometry(0.16, 0.16, 0.045, 20);
  const nugget = new THREE.DodecahedronGeometry(0.13, 0);
  const pieces: THREE.Object3D[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 34; i++) {
    const isCoin = i % 3 != 0;
    const mesh = new THREE.Mesh(isCoin ? coin : nugget, mat);
    const r = Math.sqrt(rnd()) * 0.62;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.6;
    const y = -0.6 + (0.62 - r) * 0.55 + rnd() * 0.08;
    mesh.position.set(x, y, z);
    mesh.rotation.set(rnd() * 1.2 - 0.6 + (isCoin ? Math.PI / 2 : 0), rnd() * 6, rnd() * 1.2 - 0.6);
    if (!isCoin) mesh.scale.setScalar(0.7 + rnd() * 0.6);
    root.add(mesh);
    pieces.push(mesh);
  }
  // Highest pieces last, so the heap grows upward.
  pieces.sort((a, b) => a.position.y - b.position.y);
  shadow(root);
  return { root, pieces };
}

// -----------------------------------------------------------------------------
// Emerald

export function emeraldGeometry(): THREE.BufferGeometry {
  // A step-cut gem: an octagonal crown and pavilion, flat-shaded for crisp facets.
  const profile = [
    new THREE.Vector2(0.0, -0.42),
    new THREE.Vector2(0.3, -0.1),
    new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.4, 0.14),
    new THREE.Vector2(0.24, 0.27),
    new THREE.Vector2(0.0, 0.27),
  ];
  const g = new THREE.LatheGeometry(profile, 8);
  g.scale(1.55, 1.15, 0.8);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

export function emeraldMaterial(m: Materials): THREE.MeshPhysicalMaterial {
  return phys({
    color: 0x0c9a48,
    roughness: 0.12,
    metalness: 0.0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    flatShading: true,
    emissive: 0x03552a,
    emissiveIntensity: 0.6,
    envMap: m.env,
    envMapIntensity: 0.75,
    specularIntensity: 0.7,
    specularColor: new THREE.Color(0x9affc8),
  });
}

// -----------------------------------------------------------------------------
// Bonus cherry

export function makeCherry(m: Materials): THREE.Group {
  const root = new THREE.Group();
  const red = phys({ color: 0xe0182e, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x3a0008, envMap: m.env, envMapIntensity: 1.2 });
  const stemMat = std({ color: 0x5b7a25, roughness: 0.6 });
  const tops: THREE.Vector3[] = [];
  for (const [x, y, r] of [
    [-0.26, -0.22, 0.27],
    [0.24, -0.3, 0.25],
  ]) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), red);
    c.position.set(x, y, 0.05);
    c.scale.set(1, 0.93, 1);
    root.add(c);
    tops.push(new THREE.Vector3(x, y + r * 0.9, 0.05));
  }
  const knot = new THREE.Vector3(0.05, 0.45, 0);
  for (const t of tops) {
    const mid = t.clone().lerp(knot, 0.5).add(new THREE.Vector3(t.x * 0.3, 0.05, 0));
    const curve = new THREE.QuadraticBezierCurve3(t, mid, knot);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.025, 6), stemMat));
  }
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.16, 0.12, 0.34, 0);
  leafShape.quadraticCurveTo(0.16, -0.08, 0, 0);
  const leaf = new THREE.Mesh(new THREE.ShapeGeometry(leafShape, 8), std({ color: 0x4f9a2a, roughness: 0.5, side: THREE.DoubleSide }));
  leaf.position.copy(knot);
  leaf.rotation.set(0.3, 0.2, 0.5);
  root.add(leaf);
  shadow(root);
  return root;
}

// -----------------------------------------------------------------------------
// Gravestone

export function makeGrave(): THREE.Group {
  const root = new THREE.Group();
  const tex = graveTexture();
  const stone = std({ color: 0xbfc0c6, roughness: 0.9 });
  const face = std({ map: tex, roughness: 0.85 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, -0.6);
  shape.lineTo(-0.45, 0.2);
  shape.absarc(0, 0.2, 0.45, Math.PI, 0, true);
  shape.lineTo(0.45, -0.6);
  shape.lineTo(-0.45, -0.6);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  g.translate(0, 0, -0.12);
  // Planar UVs on the front for the "RIP" engraving.
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 0.5) / 1.0, (p.getY(i) + 0.6) / 1.3);
  const mesh = new THREE.Mesh(g, [face, stone]);
  root.add(mesh);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: 0x4a3020, roughness: 1 }));
  mound.scale.set(1.2, 0.3, 0.7);
  mound.position.y = -0.62;
  root.add(mound);
  shadow(root);
  return root;
}
