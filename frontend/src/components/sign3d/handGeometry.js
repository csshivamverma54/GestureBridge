import * as THREE from 'three';

/**
 * handGeometry.js — Anatomically calibrated 3D human hand rig.
 *
 * Engineered with:
 * - Continuous organic unified forearm, wrist, and palm loft with 3D thenar/hypothenar
 *   muscle cushions, central palmar cup, and natural arched metacarpal knuckle ridge.
 *   Completely eliminates disjointed wrist spheres, rectangular box palms, and tube seams.
 * - Anatomically articulated digits with shaft waist narrowing, fleshy volar pads,
 *   dorsal extensor creases, seamless joint condyle caps, and contoured fingernails.
 * - Opposable thenar thumb integration at natural resting angle.
 * - True Left / Right mirroring for dual-handed sign language demonstration (ISL).
 * - Photorealistic MeshPhysicalMaterial with natural skin tone, velvety subsurface sheen,
 *   and studio specular highlights matching high-end product renders.
 */

// Calibrated anatomical proportions for adult human hand digits
const DIGIT_PROPORTIONS = {
  index:  { relX: -0.27, baseR: 0.088, lengths: [0.40, 0.27, 0.21], restSpread:  0.032 },
  middle: { relX: -0.09, baseR: 0.092, lengths: [0.45, 0.30, 0.23], restSpread:  0.000 },
  ring:   { relX:  0.10, baseR: 0.086, lengths: [0.42, 0.28, 0.21], restSpread: -0.024 },
  pinky:  { relX:  0.27, baseR: 0.074, lengths: [0.33, 0.22, 0.17], restSpread: -0.058 },
};

/**
 * Procedurally lofted unified anatomical human forearm, wrist, and palm geometry.
 *
 * 48 vertical height slices form a single continuous organic skin mesh from mid-forearm,
 * through the carpus, and into the palm with thenar eminence, hypothenar cushion,
 * palmar cup concavity, dorsal tendon contours, and arched knuckle line.
 */
export function createSeamlessArmAndPalmGeometry(isLeft = false) {
  const slices = 48;
  const radialSegments = 36;
  const geom = new THREE.BufferGeometry();

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < slices; i++) {
    const v = i / (slices - 1); // 0 (mid-forearm) to 1 (knuckles)
    const y = -1.45 + v * 1.99;

    let w, d;
    if (v < 0.28) {
      // Forearm section (y = -1.45 to -0.89)
      const tArm = v / 0.28;
      w = THREE.MathUtils.lerp(0.33, 0.28, tArm);
      d = THREE.MathUtils.lerp(0.24, 0.19, tArm);
    } else if (v < 0.44) {
      // Wrist / Carpal section (y = -0.89 to -0.57)
      const tWrist = (v - 0.28) / 0.16;
      w = THREE.MathUtils.lerp(0.28, 0.32, tWrist);
      d = THREE.MathUtils.lerp(0.19, 0.18, tWrist);
    } else {
      // Palm section (y = -0.57 to +0.54)
      const tPalm = (v - 0.44) / 0.56;
      w = 0.32 + Math.sin(tPalm * Math.PI * 0.75) * 0.15;
      d = 0.18 + Math.sin(tPalm * Math.PI * 0.60) * 0.055;
    }

    for (let j = 0; j <= radialSegments; j++) {
      const u = j / radialSegments;
      const angle = u * Math.PI * 2;

      let x = Math.cos(angle) * w;
      let z = Math.sin(angle) * d;

      const isPalmar = z > 0;
      const radialSign = isLeft ? 1 : -1;
      const isRadial = x * radialSign > 0;

      // Forearm muscular contours (radial brachioradialis)
      if (v < 0.35 && isRadial) {
        x += radialSign * (1.0 - v / 0.35) * 0.035;
      }

      // Palm contours active above wrist
      if (v >= 0.45) {
        const tPalm = (v - 0.45) / 0.55;

        // 1. Thenar Eminence (Thumb base muscle cushion)
        if (tPalm > 0.05 && tPalm < 0.65 && isRadial) {
          const vCenter = 0.32;
          const vDist = (tPalm - vCenter) / 0.26;
          const vFactor = Math.max(0, 1 - vDist * vDist);
          const radialFactor = Math.abs(x) / w;
          const thenarBulge = vFactor * radialFactor * 0.115;
          x += radialSign * thenarBulge * 0.95;
          if (isPalmar) {
            z += thenarBulge * 1.32;
          }
        }

        // 2. Hypothenar Eminence (Pinky edge muscle cushion)
        if (tPalm > 0.08 && tPalm < 0.70 && !isRadial) {
          const vCenter = 0.36;
          const vDist = (tPalm - vCenter) / 0.28;
          const vFactor = Math.max(0, 1 - vDist * vDist);
          const ulnarFactor = Math.abs(x) / w;
          const hypoBulge = vFactor * ulnarFactor * 0.07;
          x -= radialSign * hypoBulge * 0.52;
          if (isPalmar) {
            z += hypoBulge * 0.98;
          }
        }

        // 3. Central Palmar Hollow (Cup of palm)
        if (isPalmar && tPalm > 0.20 && tPalm < 0.80) {
          const xDist = x / (w * 0.65);
          const yDist = (tPalm - 0.50) / 0.26;
          const hollowWeight = Math.max(0, 1 - (xDist * xDist + yDist * yDist));
          z -= hollowWeight * 0.036;
        }

        // 4. Dorsal Extensor Surface & Tendon Ridges
        if (!isPalmar && tPalm > 0.22 && tPalm < 0.95) {
          const tendonRipple = Math.cos(angle * 4) * 0.007 * (tPalm - 0.22);
          z += tendonRipple;
        }
      }

      // 5. Arched Knuckle Line height adjustment
      let adjustedY = y;
      if (v > 0.75) {
        const topBlend = (v - 0.75) / 0.25;
        const nx = x / (w || 1);
        const middleX = isLeft ? 0.20 : -0.20;
        const pinkySign = isLeft ? -1 : 1;
        const archProfile = Math.cos((nx - middleX) * 1.4) * 0.04 - (nx * pinkySign > 0 ? (nx * pinkySign) * 0.07 : 0);
        adjustedY += topBlend * topBlend * archProfile;
      }

      positions.push(x, adjustedY, z);
      uvs.push(u, v);
    }
  }

  // Triangle indices
  for (let i = 0; i < slices - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = (i + 1) * (radialSegments + 1) + j;
      const c = (i + 1) * (radialSegments + 1) + (j + 1);
      const d = i * (radialSegments + 1) + (j + 1);

      if (!isLeft) {
        indices.push(a, b, d);
        indices.push(b, c, d);
      } else {
        indices.push(a, d, b);
        indices.push(b, d, c);
      }
    }
  }

  // Bottom forearm end-cap
  const bottomCenterIndex = positions.length / 3;
  positions.push(0, -1.45, 0);
  uvs.push(0.5, 0);
  for (let j = 0; j < radialSegments; j++) {
    const next = j + 1;
    if (!isLeft) {
      indices.push(bottomCenterIndex, next, j);
    } else {
      indices.push(bottomCenterIndex, j, next);
    }
  }

  // Top knuckle arch end-cap
  const topCenterIndex = positions.length / 3;
  positions.push(0, 0.50, 0);
  uvs.push(0.5, 1);
  const topSliceStart = (slices - 1) * (radialSegments + 1);
  for (let j = 0; j < radialSegments; j++) {
    const a = topSliceStart + j;
    const b = topSliceStart + j + 1;
    if (!isLeft) {
      indices.push(topCenterIndex, a, b);
    } else {
      indices.push(topCenterIndex, b, a);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Sculpted phalanx mesh with organic shaft narrowing, volar pulp cushion,
 * dorsal knuckle creases, and flared joint caps that prevent clipping seams.
 */
function createOrganicPhalanx(rBottom, rTop, length, isDistal = false) {
  const radialSegments = 24;
  const heightSegments = 12;
  const geom = new THREE.CylinderGeometry(rTop, rBottom, length, radialSegments, heightSegments, false);
  geom.translate(0, length * 0.5, 0);

  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const u = y / length; // 0 (base) to 1 (top)

    // Dorso-ventral flattening (human fingers are slightly wider laterally)
    x *= 1.02;
    z *= 0.90;

    // Shaft narrowing (waist)
    const shaftFactor = Math.sin(u * Math.PI);
    const waistNarrow = 1.0 - 0.08 * shaftFactor;
    x *= waistNarrow;
    z *= waistNarrow;

    // Fleshy palmar pad (volar pulp)
    if (z > 0) {
      const padBulge = Math.sin(u * Math.PI) * (rBottom * 0.32);
      z += padBulge;
    }

    // Dorsal flattening and subtle joint crease
    if (z < 0) {
      z *= 0.95;
      if (u > 0.72 && u < 0.92) {
        const crease = Math.sin(((u - 0.72) / 0.20) * Math.PI) * (rBottom * 0.08);
        z += crease * 0.32;
      }
    }

    // Distal fingertip tapering and nail bed contour
    if (isDistal && u > 0.65) {
      const tipProgress = (u - 0.65) / 0.35;
      x *= 1.0 - 0.30 * tipProgress * tipProgress;
      if (z > 0) {
        z *= 1.0 - 0.40 * tipProgress;
      } else {
        z *= 1.0 - 0.25 * tipProgress;
      }
    }

    pos.setXYZ(i, x, y, z);
  }

  geom.computeVertexNormals();
  return geom;
}

/**
 * Anatomical joint capsule condyle that envelops joint pivots seamlessly.
 */
function createJointCapsule(radius) {
  const geom = new THREE.SphereGeometry(radius * 1.01, 20, 16);
  geom.scale(1.04, 0.96, 0.88);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Translucent arched fingernail conforming to dorsal distal phalanx.
 */
function createFingernail(radius, length) {
  const nailWidth = radius * 1.55;
  const nailLength = length * 0.58;
  const geom = new THREE.CylinderGeometry(
    nailWidth * 0.48,
    nailWidth * 0.52,
    nailLength,
    16,
    4,
    true,
    -Math.PI * 0.42,
    Math.PI * 0.84
  );
  geom.rotateZ(Math.PI * 0.5);
  geom.rotateY(Math.PI * 0.5);
  geom.translate(0, nailLength * 0.5, -radius * 0.72);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Create an articulated 3-phalanx human digit (index, middle, ring, pinky).
 */
function createDigit(spec, isLeft, skinMat, nailMat) {
  const root = new THREE.Group();

  const x = isLeft ? -spec.relX : spec.relX;
  let y = 0.49;
  let z = 0.025;
  if (Math.abs(spec.relX) < 0.12) {
    y = 0.54; // middle finger highest
    z = 0.04;
  } else if (spec.relX < 0) {
    y = 0.50; // index finger
    z = 0.03;
  } else if (Math.abs(spec.relX) > 0.20) {
    y = 0.42; // pinky finger lowest
    z = 0.00;
  }

  root.position.set(x, y, z);
  root.rotation.z = isLeft ? -spec.restSpread : spec.restSpread;

  const [l1, l2, l3] = spec.lengths;
  const r0 = spec.baseR;
  const r1 = r0 * 0.88;
  const r2 = r0 * 0.78;
  const r3 = r0 * 0.64;

  // MCP Knuckle Capsule
  const mcpMesh = new THREE.Mesh(createJointCapsule(r0 * 1.01), skinMat);
  mcpMesh.castShadow = true;
  root.add(mcpMesh);

  // Proximal Phalanx
  const proxGroup = new THREE.Group();
  root.add(proxGroup);
  const proxMesh = new THREE.Mesh(createOrganicPhalanx(r0, r1, l1, false), skinMat);
  proxMesh.castShadow = true;
  proxMesh.receiveShadow = true;
  proxGroup.add(proxMesh);

  // PIP Joint Capsule + Middle Phalanx
  const midGroup = new THREE.Group();
  midGroup.position.set(0, l1, 0);
  proxGroup.add(midGroup);

  const pipMesh = new THREE.Mesh(createJointCapsule(r1 * 1.01), skinMat);
  midGroup.add(pipMesh);

  const midMesh = new THREE.Mesh(createOrganicPhalanx(r1, r2, l2, false), skinMat);
  midMesh.castShadow = true;
  midMesh.receiveShadow = true;
  midGroup.add(midMesh);

  // DIP Joint Capsule + Distal Phalanx & Fingernail
  const distGroup = new THREE.Group();
  distGroup.position.set(0, l2, 0);
  midGroup.add(distGroup);

  const dipMesh = new THREE.Mesh(createJointCapsule(r2 * 1.01), skinMat);
  distGroup.add(dipMesh);

  const distMesh = new THREE.Mesh(createOrganicPhalanx(r2, r3, l3 * 0.82, true), skinMat);
  distMesh.castShadow = true;
  distMesh.receiveShadow = true;
  distGroup.add(distMesh);

  // Rounded fingertip pulp
  const tipGeom = new THREE.SphereGeometry(r3 * 1.01, 16, 14);
  tipGeom.scale(1.02, 1.14, 0.86);
  const tipMesh = new THREE.Mesh(tipGeom, skinMat);
  tipMesh.position.set(0, l3 * 0.82, 0);
  tipMesh.castShadow = true;
  distGroup.add(tipMesh);

  // Translucent dorsal fingernail
  const nailMesh = new THREE.Mesh(createFingernail(r3, l3), nailMat);
  nailMesh.position.set(0, l3 * 0.32, 0);
  distGroup.add(nailMesh);

  return { root, prox: proxGroup, mid: midGroup, dist: distGroup };
}

/**
 * Create opposable thumb emerging organically from the thenar eminence.
 */
function createThumb(isLeft, skinMat, nailMat) {
  const root = new THREE.Group();

  const posX = isLeft ? 0.42 : -0.42;
  root.position.set(posX, -0.05, 0.08);

  if (!isLeft) {
    root.rotation.set(0.16, 0.38, 0.46);
  } else {
    root.rotation.set(0.16, -0.38, -0.46);
  }

  const r0 = 0.112;
  const r1 = 0.096;
  const r2 = 0.080;
  const l1 = 0.35;
  const l2 = 0.28;

  const cmcMesh = new THREE.Mesh(createJointCapsule(r0 * 1.08), skinMat);
  root.add(cmcMesh);

  const proxGroup = new THREE.Group();
  root.add(proxGroup);
  const proxMesh = new THREE.Mesh(createOrganicPhalanx(r0, r1, l1, false), skinMat);
  proxMesh.castShadow = true;
  proxGroup.add(proxMesh);

  const distGroup = new THREE.Group();
  distGroup.position.set(0, l1, 0);
  proxGroup.add(distGroup);

  const ipMesh = new THREE.Mesh(createJointCapsule(r1 * 1.01), skinMat);
  distGroup.add(ipMesh);

  const distMesh = new THREE.Mesh(createOrganicPhalanx(r1, r2, l2 * 0.82, true), skinMat);
  distMesh.castShadow = true;
  distGroup.add(distMesh);

  const tipGeom = new THREE.SphereGeometry(r2 * 1.02, 16, 14);
  tipGeom.scale(1.04, 1.14, 0.88);
  const tipMesh = new THREE.Mesh(tipGeom, skinMat);
  tipMesh.position.set(0, l2 * 0.82, 0);
  tipMesh.castShadow = true;
  distGroup.add(tipMesh);

  const nailMesh = new THREE.Mesh(createFingernail(r2, l2), nailMat);
  nailMesh.position.set(0, l2 * 0.32, 0);
  distGroup.add(nailMesh);

  return { root, prox: proxGroup, dist: distGroup };
}

/**
 * Assemble a complete, articulated anatomical human hand rig.
 *
 * @param {Object} options
 * @param {boolean} [options.isLeft=false] - When true, creates mirrored Left hand.
 * @param {string} [options.skinColor='#dfb29d'] - Natural warm skin tone.
 * @param {string} [options.sheenColor='#ffe1d4'] - Biological subsurface sheen highlight.
 */
export function createAnatomicalHandRig({
  isLeft = false,
  skinColor = '#dfb29d',
  sheenColor = '#ffe1d4',
} = {}) {
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(skinColor),
    roughness: 0.38,
    metalness: 0.0,
    sheen: 0.85,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(sheenColor),
    clearcoat: 0.12,
    clearcoatRoughness: 0.45,
  });

  const nailMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f7dfd6'),
    roughness: 0.24,
    metalness: 0.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
  });

  const rigRoot = new THREE.Group();
  const wristPivot = new THREE.Group();
  rigRoot.add(wristPivot);

  // Single seamless continuous organic mesh for forearm, wrist, and palm!
  const palmMesh = new THREE.Mesh(createSeamlessArmAndPalmGeometry(isLeft), skinMat);
  palmMesh.castShadow = true;
  palmMesh.receiveShadow = true;
  wristPivot.add(palmMesh);

  // Articulated digits
  const digits = {
    thumb:  createThumb(isLeft, skinMat, nailMat),
    index:  createDigit(DIGIT_PROPORTIONS.index, isLeft, skinMat, nailMat),
    middle: createDigit(DIGIT_PROPORTIONS.middle, isLeft, skinMat, nailMat),
    ring:   createDigit(DIGIT_PROPORTIONS.ring, isLeft, skinMat, nailMat),
    pinky:  createDigit(DIGIT_PROPORTIONS.pinky, isLeft, skinMat, nailMat),
  };

  Object.values(digits).forEach((d) => wristPivot.add(d.root));

  return {
    root: rigRoot,
    wrist: wristPivot,
    digits,
    isLeft,
    materials: [skinMat, nailMat],
  };
}

/**
 * Configure anatomical flat open B-handshape.
 * Fingers held neatly aligned with gentle natural curvature at joints.
 */
export function setFlatOpenHandshape(rig, curlFactor = 0.05, spreadFactor = 1.0) {
  const { index, middle, ring, pinky, thumb } = rig.digits;
  const isLeft = rig.isLeft;
  const sign = isLeft ? -1 : 1;

  const fingerEntries = [
    { d: index,  spread: sign * 0.018 * spreadFactor },
    { d: middle, spread: 0.0 },
    { d: ring,   spread: -sign * 0.015 * spreadFactor },
    { d: pinky,  spread: -sign * 0.030 * spreadFactor },
  ];

  fingerEntries.forEach(({ d, spread }) => {
    d.root.rotation.z = spread;
    d.prox.rotation.x = curlFactor;
    d.mid.rotation.x = curlFactor * 1.15;
    d.dist.rotation.x = curlFactor * 0.75;
  });

  // Thumb aligned comfortably alongside palm / index finger
  if (!isLeft) {
    thumb.root.rotation.set(0.12, 0.28, 0.25);
  } else {
    thumb.root.rotation.set(0.12, -0.28, -0.25);
  }
  thumb.prox.rotation.x = 0.07;
  thumb.dist.rotation.x = 0.05;
}

/**
 * Dispose geometries and materials cleanly on unmount.
 */
export function disposeHandRig(rig) {
  if (!rig) return;
  rig.root.traverse((obj) => {
    if (obj.isMesh && obj.geometry) {
      obj.geometry.dispose();
    }
  });
  rig.materials?.forEach((m) => m.dispose());
}
