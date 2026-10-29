// viewer.js — escena 3D (three.js): membrana, postes, costuras, sol y sombras.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const S = 0.001; // mm -> m
const toScene = (p) => new THREE.Vector3(p[0] * S, p[2] * S, -p[1] * S); // z del modelo = alto

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  camera.position.set(9, 7, 11);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.5, 0);

  const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x36302a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 0.5; sc.far = 120;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(40, 40, 0x9aa4b0, 0x6d757f);
  grid.position.y = 0.002;
  scene.add(grid);

  // plano invisible que sólo recoge sombra: sobre la foto del cliente la vela
  // proyecta su sombra en el suelo real sin tapar la imagen
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.ShadowMaterial({ opacity: 0.42 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.004;
  shadowCatcher.receiveShadow = true;
  shadowCatcher.visible = false;
  scene.add(shadowCatcher);

  const group = new THREE.Group();
  scene.add(group);

  let sailMesh = null, sailBack = null, seamLines = null, photoTex = null;
  // dos materiales: cara superior y cara inferior, para los tejidos bicolor (DualShade)
  const sailMat = new THREE.MeshStandardMaterial({ color: 0x34312d, side: THREE.FrontSide, roughness: 0.92, metalness: 0.02 });
  const sailMatBack = new THREE.MeshStandardMaterial({ color: 0x34312d, side: THREE.BackSide, roughness: 0.92, metalness: 0.02 });
  sailMat.shadowSide = THREE.DoubleSide;      // sin esto la tela no entra en el mapa de sombras
  sailMatBack.shadowSide = THREE.DoubleSide;

  function clearGroup() {
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose?.();
      if (o.material && o.material !== sailMat && o.material !== sailMatBack) o.material.dispose?.();
    }
  }

  function update(result, opts = {}) {
    clearGroup();
    if (!result) return;
    const { mesh, fixings, panels, corners } = result;

    // membrana
    const pos = new Float32Array(mesh.verts.length * 3);
    mesh.verts.forEach((p, i) => { const v = toScene(p); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
    const idx = new Uint32Array(mesh.tris.length * 3);
    mesh.tris.forEach((t, i) => { idx[i * 3] = t[0]; idx[i * 3 + 1] = t[1]; idx[i * 3 + 2] = t[2]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    sailMesh = new THREE.Mesh(g, sailMat);
    sailMesh.castShadow = true; sailMesh.receiveShadow = true;
    sailBack = new THREE.Mesh(g, sailMatBack);
    sailBack.castShadow = false; sailBack.receiveShadow = true;
    group.add(sailMesh, sailBack);

    // costuras reales sobre la superficie curva
    if (opts.seams !== false && panels) {
      const pts = [];
      for (const p of panels) {
        const loop = p.seam3d || [];
        for (let i = 0; i < loop.length; i++) {
          const a = toScene(loop[i]), b = toScene(loop[(i + 1) % loop.length]);
          pts.push(a.x, a.y + 0.004, a.z, b.x, b.y + 0.004, b.z);
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
      seamLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x0d1116, transparent: true, opacity: 0.55 }));
      group.add(seamLines);
    }

    // postes inclinados hacia fuera y herrajes de esquina
    const poleMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.poleColor || '#8d949c'), roughness: 0.45, metalness: 0.75 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.9 });
    const up = new THREE.Vector3(0, 1, 0);
    const cx = fixings.reduce((a, f) => a + f[0], 0) / fixings.length;
    const cy = fixings.reduce((a, f) => a + f[1], 0) / fixings.length;
    const rake = Math.tan((opts.poleRake ?? 8) * Math.PI / 180);

    /** Cilindro entre dos puntos de la escena. */
    const tube = (a, b, r, mat) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 1e-4) return null;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      return m;
    };

    fixings.forEach((f, i) => {
      const top = toScene(f);
      const h = f[2] * S;
      if (h >= 0.3) {
        // el pie se separa del eje: el poste se inclina alejándose de la vela
        const out = new THREE.Vector2(f[0] - cx, f[1] - cy);
        if (out.lengthSq() < 1) out.set(1, 0);
        out.normalize().multiplyScalar(h * rake);
        const base = new THREE.Vector3(top.x + out.x, 0, top.z - out.y);
        const pole = tube(base, top, 0.055, poleMat);
        if (pole) { pole.castShadow = true; pole.receiveShadow = true; group.add(pole); }
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 20), poleMat);
        plate.position.set(base.x, 0.025, base.z);
        plate.castShadow = true; plate.receiveShadow = true;
        group.add(plate);
        // cáncamo en la cabeza del poste
        const eye = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 18), steel);
        eye.position.copy(top);
        eye.lookAt(new THREE.Vector3(cx * S, top.y, -cy * S));
        eye.castShadow = true;
        group.add(eye);
      }

      // herraje de esquina: tensor entre el punto de tela y el punto de anclaje.
      // Es lo que ocupa la deducción de esquina, así que la vela ya no "flota".
      if (corners && corners[i]) {
        const fab = toScene(corners[i]);
        const dir = new THREE.Vector3().subVectors(top, fab);
        const L = dir.length();
        if (L > 0.02) {
          const n = dir.clone().normalize();
          const p1 = fab.clone().addScaledVector(n, L * 0.18);
          const p2 = fab.clone().addScaledVector(n, L * 0.82);
          const rope = tube(fab, top, 0.011, steel);          // grillete + tensor
          if (rope) { rope.castShadow = true; group.add(rope); }
          const body = tube(p1, p2, 0.026, steel);            // cuerpo del tensor
          if (body) { body.castShadow = true; group.add(body); }
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.013, 8, 20), steel);
          ring.position.copy(fab).addScaledVector(n, 0.05);
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
          ring.castShadow = true;
          group.add(ring);
        }
      }
    });

    // encuadre
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    controls.target.copy(c);
    const d = Math.max(size.x, size.z) * 1.6 + size.y;
    if (!opts.keepCamera) camera.position.set(c.x + d * 0.6, c.y + d * 0.55, c.z + d * 0.85);
    controls.update();
  }

  /** `back` sólo en tejidos bicolor; si no se pasa, ambas caras van del mismo color. */
  function setSailColor(hex, back) {
    sailMat.color = new THREE.Color(hex);
    sailMatBack.color = new THREE.Color(back || hex);
  }

  function setSun(vec, altitude) {
    const L = 60;
    sun.position.set(vec[0] * L, Math.max(vec[2], 0.02) * L, -vec[1] * L);
    sun.target.position.set(0, 0, 0);
    sun.target.updateMatrixWorld();
    const day = Math.max(0, Math.min(1, (altitude + 6) / 30));
    sun.intensity = 0.25 + 2.3 * day;
    hemi.intensity = 0.35 + 0.9 * day;
    const warm = new THREE.Color().setHSL(0.09 - 0.05 * day, 0.55 - 0.35 * day, 0.5 + 0.35 * day);
    sun.color = warm;
  }

  function setShadows(on) {
    renderer.shadowMap.enabled = on;
    shadowCatcher.material.opacity = on ? 0.42 : 0;
    if (sailMesh) sailMesh.castShadow = on;
    scene.traverse((o) => { if (o.isMesh && o.material?.needsUpdate !== undefined) o.material.needsUpdate = true; });
  }

  /** Encaja la foto de fondo por "cover": llena el visor sin deformarse. */
  function fitBackground() {
    if (!photoTex?.image) return;
    const view = container.clientWidth / Math.max(container.clientHeight, 1);
    const img = photoTex.image.width / photoTex.image.height;
    photoTex.matrixAutoUpdate = true;
    if (img > view) {                       // foto más apaisada: se recorta a los lados
      const k = view / img;
      photoTex.repeat.set(k, 1); photoTex.offset.set((1 - k) / 2, 0);
    } else {                                // foto más alta: se recorta arriba y abajo
      const k = img / view;
      photoTex.repeat.set(1, k); photoTex.offset.set(0, (1 - k) / 2);
    }
    photoTex.needsUpdate = true;
  }

  function setPhoto(url) {
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      photoTex?.dispose?.();
      photoTex = t;
      scene.background = t;
      fitBackground();
      ground.visible = false;
      grid.visible = false;
      shadowCatcher.visible = true;
      hemi.groundColor = new THREE.Color(0x9a9186);   // rebote cálido del suelo real
    });
  }

  function clearPhoto() {
    scene.background = null;
    photoTex?.dispose?.(); photoTex = null;
    ground.visible = true; grid.visible = true; shadowCatcher.visible = false;
    hemi.groundColor = new THREE.Color(0x36302a);
  }

  function setFov(f) { camera.fov = f; camera.updateProjectionMatrix(); }
  const hasPhoto = () => !!photoTex;

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    fitBackground();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

  function snapshot() {           // fuerza un fotograma antes de capturar
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }

  return { update, setSun, setSailColor, setPhoto, clearPhoto, setFov, setShadows, hasPhoto, resize, snapshot, renderer, camera, scene };
}
