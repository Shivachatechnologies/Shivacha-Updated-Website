import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const q = new URLSearchParams(location.search);
const W = +(q.get("w") || 1600), H = +(q.get("h") || 1200), name = q.get("s");
const canvas = document.getElementById("c"); canvas.width = W; canvas.height = H; canvas.style.width = W + "px"; canvas.style.height = H + "px";
const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.setSize(W, H, false);
r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.92; r.outputColorSpace = THREE.SRGBColorSpace;
r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.75;
const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);

const BLUE = 0x0195ff, DEEP = 0x0a4fa3, CYAN = 0x22d3ee, TEAL = 0x14c8b0, INDIGO = 0x6b7cff, NAVY = 0x07162b;
const glass = (color = 0xffffff, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.06, transmission: 0.96, thickness: 1.4, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.04, attenuationColor: new THREE.Color(color), attenuationDistance: 1.1, specularIntensity: 0.9, ...o });
const solid = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2, ...o });
const metal = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 1, clearcoat: 0.3, ...o });
const glow = (color, i = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i });

function lights({ key = [5, 8, 6], shadow = true, fill = 0.6 } = {}) {
  const k = new THREE.DirectionalLight(0xffffff, 2.2); k.position.set(...key); k.castShadow = shadow;
  k.shadow.mapSize.set(2048, 2048); k.shadow.radius = 8; k.shadow.bias = -0.0005; Object.assign(k.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
  scene.add(k); scene.add(new THREE.HemisphereLight(0xdfefff, 0x1b2a44, fill));
  const rim = new THREE.DirectionalLight(0x7cc4ff, 1.4); rim.position.set(-6, 3, -5); scene.add(rim);
}
function ground(y = 0, opacity = 0.18) {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity })); g.rotation.x = -Math.PI / 2; g.position.y = y; g.receiveShadow = true; scene.add(g);
}
function bg(top = "#0b2447", bottom = "#030b18") {
  const c = document.createElement("canvas"); c.width = 4; c.height = 512; const x = c.getContext("2d"); const gr = x.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, top); gr.addColorStop(1, bottom); x.fillStyle = gr; x.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
/** Fit the camera to everything except the ground, keeping its current direction. */
function frame(target = new THREE.Vector3(), margin = 1.12, exclude = []) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3(); scene.traverse((o) => { if (o.isMesh && !exclude.includes(o) && !(o.material instanceof THREE.ShadowMaterial)) box.expandByObject(o); });
  const sphere = box.getBoundingSphere(new THREE.Sphere()); const c = sphere.center.clone().add(target);
  const dir = cam.position.clone().sub(c).normalize(); const fov = (cam.fov * Math.PI) / 180; const fitH = sphere.radius / Math.sin(fov / 2); const fitW = fitH / Math.min(1, cam.aspect);
  cam.position.copy(c.clone().add(dir.multiplyScalar(Math.max(fitH, fitW) * margin))); cam.lookAt(c);
}
const add = (m, cast = true) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = true; } }); scene.add(m); return m; };
const texture = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
function rr(x, a, b, w, h, rad) { x.beginPath(); x.roundRect(a, b, w, h, rad); }

const scenes = {
  /* Glass blockchain: linked blocks with glowing cores */
  blockchain() {
    lights(); ground(-0.9, 0.16);
    cam.position.set(7.5, 5.2, 9); cam.lookAt(0, 0.2, 0);
    const pos = [[-3.2, 0, 0.6], [0, 0.35, 0], [3.2, 0, -0.6]];
    pos.forEach((p, i) => {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.8, 1.8, 6, 0.22), glass(i === 1 ? 0x5fb4ff : 0x8fd0ff));
      const core = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.85, 0.85, 4, 0.12), i === 1 ? glow(BLUE, 1.6) : solid(i ? CYAN : INDIGO, { emissive: i ? CYAN : INDIGO, emissiveIntensity: 0.35 }));
      g.add(shell, core); g.position.set(...p); g.rotation.y = 0.35; add(g);
    });
    for (let i = 0; i < 2; i++) {
      const a = new THREE.Vector3(...pos[i]), b = new THREE.Vector3(...pos[i + 1]);
      const mid = a.clone().lerp(b, 0.5); const len = a.distanceTo(b) - 1.9;
      const link = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, len, 8, 16), glow(0x5cc8ff, 2.2));
      link.position.copy(mid); link.lookAt(b); link.rotateX(Math.PI / 2); add(link, false);
      for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), glow(0xffffff, 3)); d.position.copy(a.clone().lerp(b, 0.35 + k * 0.15)); scene.add(d); }
    }
    for (let i = 0; i < 26; i++) { const s = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.18, 0.18, 2, 0.04), glass(0x8fd0ff)); s.position.set((Math.random() - 0.5) * 9, Math.random() * 3 - 0.2, (Math.random() - 0.5) * 4 - 1); s.rotation.set(Math.random(), Math.random(), 0); add(s); }
  },

  /* FinTech: premium card, coins and a glass balance panel */
  fintech() {
    lights({ key: [4, 9, 7] }); ground(-1.2, 0.18);
    cam.position.set(0.6, 4.2, 10.5); cam.lookAt(0, 0.2, 0);
    const face = texture(1024, 640, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, "#0a6fd1"); g.addColorStop(0.55, "#0195ff"); g.addColorStop(1, "#14c8b0"); x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.globalAlpha = 0.12; for (let i = 0; i < 14; i++) { x.strokeStyle = "#fff"; x.lineWidth = 2; x.beginPath(); x.arc(w * 0.9, h * 1.1, 120 + i * 40, 0, Math.PI * 2); x.stroke(); } x.globalAlpha = 1;
      const cg = x.createLinearGradient(80, 250, 200, 350); cg.addColorStop(0, "#f7e2a0"); cg.addColorStop(1, "#c9a048"); x.fillStyle = cg; rr(x, 80, 250, 130, 100, 16); x.fill();
      x.strokeStyle = "rgba(0,0,0,.25)"; x.lineWidth = 3; x.strokeRect(118, 262, 54, 76);
      x.fillStyle = "#fff"; x.font = "600 58px Arial"; x.fillText("SHIVACHA", 80, 150); x.font = "500 44px monospace"; x.fillText("••••  ••••  ••••  4821", 80, 470); x.globalAlpha = 0.8; x.font = "500 28px Arial"; x.fillText("VIRTUAL · PROGRAM A", 80, 540);
      x.globalAlpha = 0.9; x.beginPath(); x.arc(w - 170, h - 110, 46, 0, Math.PI * 2); x.fillStyle = "rgba(255,255,255,.55)"; x.fill(); x.beginPath(); x.arc(w - 110, h - 110, 46, 0, Math.PI * 2); x.fillStyle = "rgba(255,255,255,.3)"; x.fill();
    });
    const card = new THREE.Mesh(new RoundedBoxGeometry(4.2, 2.65, 0.08, 6, 0.18), [solid(0x0a6fd1), solid(0x0a6fd1), solid(0x0a6fd1), solid(0x0a6fd1), new THREE.MeshPhysicalMaterial({ map: face, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.4 }), solid(0x0b3a73)]);
    card.position.set(-0.9, 1.1, 0.4); card.rotation.set(-0.35, 0.35, 0.12); add(card);
    const coinMat = metal(0xe8c46a, { roughness: 0.28 }), coinBlue = metal(0x7fb8ff, { roughness: 0.25 });
    for (let s = 0; s < 3; s++) for (let i = 0; i < [6, 9, 4][s]; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.13, 64), s === 1 ? coinMat : coinBlue); c.position.set(1.6 + s * 1.2, -1.13 + i * 0.14, 1.2 - s * 0.9); c.rotation.y = i * 0.3; add(c);
    }
    const panel = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.7, 0.12, 6, 0.14), glass(0xa9d8ff, { thickness: 0.4, roughness: 0.2 }));
    panel.position.set(2.7, 1.9, -1.2); panel.rotation.set(-0.1, -0.35, 0); add(panel);
    const bars = [0.35, 0.55, 0.45, 0.75, 0.62, 0.95];
    bars.forEach((b, i) => { const m = new THREE.Mesh(new RoundedBoxGeometry(0.22, b, 0.08, 2, 0.04), glow(i === 5 ? TEAL : BLUE, 0.8)); m.position.set(1.95 + i * 0.3, 1.3 + b / 2, -1.05 - i * 0.1); m.rotation.y = -0.35; add(m); });
  },

  /* AI: layered neural network with a glowing core */
  ai() {
    lights({ shadow: false }); bg("#101a4a", "#050a1c");
    cam.position.set(6.5, 3.2, 10.5); cam.lookAt(0, -0.2, 0);
    const layers = [4, 7, 9, 7, 4]; const nodes = [];
    layers.forEach((n, li) => { const arr = []; for (let i = 0; i < n; i++) { const p = new THREE.Vector3((li - 2) * 2.3, (i - (n - 1) / 2) * 0.85, Math.sin(i + li) * 0.8); arr.push(p);
      const isCore = li === 2 && i === 4; const s = new THREE.Mesh(new THREE.SphereGeometry(isCore ? 0.42 : 0.17, 48, 48), isCore ? glow(0x9fb0ff, 2.5) : new THREE.MeshPhysicalMaterial({ color: li % 2 ? 0x8fa2ff : 0x5cc8ff, emissive: li % 2 ? INDIGO : BLUE, emissiveIntensity: 0.9, roughness: 0.2, clearcoat: 1 })); s.position.copy(p); scene.add(s); } nodes.push(arr); });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x7c9bff, transparent: true, opacity: 0.22 });
    for (let l = 0; l < nodes.length - 1; l++) for (const a of nodes[l]) for (const b of nodes[l + 1]) { if (Math.random() < 0.55) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat)); }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.015, 16, 128), glow(0x9fb0ff, 1.5)); halo.rotation.x = 1.2; halo.position.copy(nodes[2][4]); scene.add(halo);
    const halo2 = halo.clone(); halo2.scale.setScalar(1.5); halo2.rotation.set(1.6, 0.4, 0); scene.add(halo2);
    const pts = new THREE.BufferGeometry(); const arr = []; for (let i = 0; i < 700; i++) arr.push((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8 - 3);
    pts.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); scene.add(new THREE.Points(pts, new THREE.PointsMaterial({ color: 0x9fc6ff, size: 0.035, transparent: true, opacity: 0.6 })));
  },

  /* Cloud: server stack with LEDs under a glass cloud */
  cloud() {
    lights(); ground(-1.6, 0.2);
    cam.position.set(7, 5, 10); cam.lookAt(0, 0.4, 0);
    const bladeFace = texture(512, 96, (x, w, h) => { x.fillStyle = "#0e1c30"; x.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++) { x.fillStyle = "#16283f"; x.fillRect(150 + i * 18, 22, 10, 52); } x.fillStyle = "#34d399"; x.beginPath(); x.arc(40, 48, 9, 0, 7); x.fill(); x.fillStyle = "#0195ff"; x.beginPath(); x.arc(70, 48, 9, 0, 7); x.fill(); x.fillStyle = "#5cc8ff"; x.fillRect(90, 42, 40, 12); });
    for (let t = 0; t < 2; t++) for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.42, 1.6, 4, 0.06), [solid(0x1a2b45), solid(0x1a2b45), solid(0x22385a), solid(0x1a2b45), new THREE.MeshStandardMaterial({ map: bladeFace, emissiveMap: bladeFace, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 }), solid(0x1a2b45)]);
      b.position.set(t ? 1.5 : -1.5, -1.35 + i * 0.47 + (t ? 0 : 0.23), t ? -0.6 : 0.4); add(b);
    }
    const cloud = new THREE.Group(); [[0, 0, 0, 1.3], [-1.2, -0.3, 0.1, 0.95], [1.25, -0.25, 0, 1.0], [0.55, 0.45, -0.2, 0.9], [-0.55, 0.35, 0.2, 0.85]].forEach(([x, y, z, s]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 64, 64), glass(0x7cc4ff, { thickness: 2, attenuationDistance: 1.6 })); m.position.set(x, y, z); cloud.add(m); });
    cloud.position.set(0.2, 3.2, -0.3); add(cloud);
    for (let i = 0; i < 4; i++) { const line = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 12), glow(0x5cc8ff, 2)); line.position.set(-1.5 + i, 1.9, -0.2); add(line, false); }
  },

  /* Digital: laptop + phone with product UI */
  digital() {
    lights({ key: [3, 9, 8] }); ground(-0.02, 0.2);
    cam.position.set(5.5, 4.6, 9.5); cam.lookAt(0.3, 1.2, 0);
    const ui = (w, h, mobile) => texture(w, h, (x) => {
      x.fillStyle = "#f6f8fb"; x.fillRect(0, 0, w, h);
      if (!mobile) { x.fillStyle = "#0b1424"; x.fillRect(0, 0, 190, h); x.fillStyle = "#0195ff"; rr(x, 30, 30, 34, 34, 8); x.fill(); for (let i = 0; i < 6; i++) { x.fillStyle = i === 0 ? "#0195ff" : "#26344d"; rr(x, 30, 110 + i * 46, 130, 14, 7); x.fill(); } }
      const ox = mobile ? 28 : 230; x.fillStyle = "#0b1424"; x.font = `700 ${mobile ? 34 : 30}px Arial`; x.fillText(mobile ? "Balance" : "Revenue overview", ox, mobile ? 90 : 70);
      const cards = mobile ? 1 : 3; for (let i = 0; i < cards; i++) { const cw = mobile ? w - 56 : 200; x.fillStyle = "#fff"; rr(x, ox + i * 220, mobile ? 120 : 100, cw, mobile ? 150 : 110, 16); x.fill(); x.fillStyle = ["#0195ff", "#14c8b0", "#6b7cff"][i]; rr(x, ox + 20 + i * 220, mobile ? 160 : 140, mobile ? 200 : 110, mobile ? 28 : 22, 8); x.fill(); }
      const cy = mobile ? 310 : 240, ch = mobile ? 260 : h - 280; x.fillStyle = "#fff"; rr(x, ox, cy, (mobile ? w - 56 : w - ox - 40), ch, 16); x.fill();
      x.strokeStyle = "#0195ff"; x.lineWidth = mobile ? 6 : 5; x.beginPath(); const pts = 12; for (let i = 0; i <= pts; i++) { const px = ox + 20 + i * ((mobile ? w - 96 : w - ox - 80) / pts), py = cy + ch - 30 - (Math.sin(i * 0.8) * 0.25 + i / pts * 0.6) * (ch - 60); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
      if (mobile) for (let i = 0; i < 4; i++) { x.fillStyle = "#fff"; rr(x, 28, 600 + i * 100, w - 56, 80, 14); x.fill(); x.fillStyle = "#dbe6f3"; x.beginPath(); x.arc(70, 640 + i * 100, 20, 0, 7); x.fill(); x.fillStyle = "#c5d1e0"; rr(x, 110, 630 + i * 100, 180, 18, 9); x.fill(); }
    });
    const lap = new THREE.Group();
    const base = new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.16, 3.4, 4, 0.08), metal(0xc7cfdb, { roughness: 0.35 })); base.position.y = 0.08; lap.add(base);
    const lid = new THREE.Group(); const back = new THREE.Mesh(new RoundedBoxGeometry(5.2, 3.3, 0.12, 4, 0.1), metal(0xc7cfdb, { roughness: 0.35 })); lid.add(back);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 3.0), new THREE.MeshBasicMaterial({ map: ui(1280, 784) })); screen.position.z = 0.065; lid.add(screen);
    lid.position.set(0, 1.75, -1.62); lid.rotation.x = -0.12; lap.add(lid); lap.position.set(-0.8, 0, 0); lap.rotation.y = 0.28; add(lap);
    const phone = new THREE.Group(); const body = new THREE.Mesh(new RoundedBoxGeometry(1.45, 2.95, 0.14, 6, 0.2), metal(0x1b2433, { roughness: 0.25 })); phone.add(body);
    const ps = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.8), new THREE.MeshBasicMaterial({ map: ui(420, 900, true) })); ps.position.z = 0.075; phone.add(ps);
    phone.position.set(2.9, 1.52, 1.2); phone.rotation.set(-0.08, -0.45, 0.02); add(phone);
  },

  /* Globe: dotted sphere with arcs between Gurgaon, Dallas and London */
  globe() {
    bg("#0b2447", "#030b18");
    cam.position.set(0, 0.2, 12.5); cam.lookAt(0, 0, 0);
    const R = 2.9, group = new THREE.Group(); scene.add(group);
    const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.98, 96, 96), new THREE.MeshBasicMaterial({ color: 0x06203f })); group.add(core);
    const N = 9000, geo = new THREE.BufferGeometry(), a = [], col = [];
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = Math.PI * (3 - Math.sqrt(5)) * i; const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      // Pseudo-landmass pattern: layered noise so the sphere reads as a globe, not a ball.
      const n = Math.sin(x * 3.1 + y * 1.7) + Math.sin(y * 4.3 - z * 2.2) * 0.8 + Math.sin(z * 5.1 + x * 2.9) * 0.6;
      if (n > 0.35) { a.push(x * R, y * R, z * R); const c = new THREE.Color(0x5cc8ff).lerp(new THREE.Color(0x9fb0ff), Math.random() * 0.4); col.push(c.r, c.g, c.b); } }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.055, vertexColors: true, transparent: true, opacity: 1 })));
    const grid = new THREE.Mesh(new THREE.SphereGeometry(R * 1.001, 36, 18), new THREE.MeshBasicMaterial({ color: 0x1b4f8f, wireframe: true, transparent: true, opacity: 0.18 })); group.add(grid);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 64, 64), new THREE.ShaderMaterial({ transparent: true, side: THREE.BackSide, uniforms: {}, vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }", fragmentShader: "varying vec3 n; void main(){ float i = pow(0.66 - dot(n, vec3(0,0,1.)), 4.0); gl_FragColor = vec4(0.05,0.55,1.0,1.0)*i*0.9; }" })); scene.add(atm);
    const ll = (lat, lon, r = R) => { const p = (90 - lat) * Math.PI / 180, t = (lon + 180) * Math.PI / 180; return new THREE.Vector3(-r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)); };
    const cities = { gurgaon: [28.46, 77.03], dallas: [32.78, -96.8], london: [51.51, -0.13] };
    Object.values(cities).forEach(([la, lo]) => { const p = ll(la, lo); const pin = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffffff })); pin.position.copy(p); group.add(pin);
      [0.16, 0.26].forEach((rr, k) => { const ring = new THREE.Mesh(new THREE.RingGeometry(rr, rr + 0.025, 64), new THREE.MeshBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: k ? 0.35 : 0.9, side: THREE.DoubleSide })); ring.position.copy(p.clone().multiplyScalar(1.002)); ring.lookAt(p.clone().multiplyScalar(2)); group.add(ring); });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.8 })); beam.position.copy(p.clone().multiplyScalar(1.1)); beam.lookAt(p.clone().multiplyScalar(3)); beam.rotateX(Math.PI / 2); group.add(beam); });
    const arc = (A, B, color) => { const a = ll(...A), b = ll(...B); const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * 1.5); const c = new THREE.QuadraticBezierCurve3(a, mid, b); group.add(new THREE.Mesh(new THREE.TubeGeometry(c, 128, 0.02, 8, false), new THREE.MeshBasicMaterial({ color }))); group.add(new THREE.Mesh(new THREE.TubeGeometry(c, 128, 0.06, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 }))); };
    arc(cities.gurgaon, cities.london, 0x5cc8ff); arc(cities.london, cities.dallas, 0x22d3ee); arc(cities.gurgaon, cities.dallas, 0x8fa2ff);
    // Face the Atlantic–India band so all three offices are visible.
    group.rotation.set(0.95, -1.35, 0.1);
    group.updateMatrixWorld(true); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    window.pins = Object.fromEntries(Object.entries(cities).map(([k, [la, lo]]) => { const v = ll(la, lo).applyMatrix4(group.matrixWorld).project(cam); return [k, [+((v.x + 1) * 50).toFixed(1), +((1 - v.y) * 50).toFixed(1)]]; }));
    const stars = new THREE.BufferGeometry(); const sa = []; for (let i = 0; i < 500; i++) sa.push((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, -8 - Math.random() * 6);
    stars.setAttribute("position", new THREE.Float32BufferAttribute(sa, 3)); scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0x9fc6ff, size: 0.03, transparent: true, opacity: 0.5 })));
  },

  /* Tokenization: glass tokens orbiting a document */
  tokens() {
    lights(); ground(-1.3, 0.16);
    cam.position.set(6, 4.2, 9); cam.lookAt(0, 0.4, 0);
    const doc = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.9, 0.12, 4, 0.1), solid(0xffffff, { roughness: 0.5 })); doc.position.set(-0.4, 0.4, 0); doc.rotation.set(-0.15, 0.35, 0.05); add(doc);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new RoundedBoxGeometry(1.4 - (i % 2) * 0.4, 0.12, 0.04, 2, 0.03), solid(i ? 0xc5d1e0 : BLUE)); l.position.set(-0.55, 1.35 - i * 0.35, 0.09); l.rotation.copy(doc.rotation); l.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0); scene.add(l); }
    [[1.8, 1.4, 1.0, CYAN], [2.4, -0.3, 0.2, BLUE], [1.2, -0.9, 1.6, INDIGO], [-2.4, 1.6, -0.6, TEAL]].forEach(([x, y, z, c]) => { const t = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 6), glass(0x9ad5ff, { thickness: 0.6 })); disc.rotation.x = Math.PI / 2; const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 6), glow(c, 1.4)); inner.rotation.x = Math.PI / 2; t.add(disc, inner); t.position.set(x, y, z); t.rotation.set(0.2, -0.6, 0.1); add(t); });
  },
  /* Security: glass shield with a metal lock */
  security() {
    lights(); ground(-1.8, 0.16);
    cam.position.set(4, 3, 10); cam.lookAt(0, 0, 0);
    const sh = new THREE.Shape(); sh.moveTo(0, 1.9); sh.bezierCurveTo(0.9, 1.5, 1.5, 1.55, 1.7, 1.45); sh.bezierCurveTo(1.75, 0.2, 1.3, -1.2, 0, -2); sh.bezierCurveTo(-1.3, -1.2, -1.75, 0.2, -1.7, 1.45); sh.bezierCurveTo(-1.5, 1.55, -0.9, 1.5, 0, 1.9);
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 8, curveSegments: 48 }), glass(0x5fb4ff)); shield.position.z = -0.2; add(shield);
    const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 48 }), solid(DEEP, { emissive: BLUE, emissiveIntensity: 0.25 })); inner.scale.setScalar(0.72); inner.position.z = 0.02; add(inner);
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.95, 0.4, 4, 0.12), metal(0xe9eef6, { roughness: 0.2 })); body.position.set(0, -0.35, 0.55); add(body);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 24, 64, Math.PI), metal(0xcfd8e3, { roughness: 0.18 })); shackle.position.set(0, 0.12, 0.55); add(shackle);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 32), solid(0x0b1424)); hole.rotation.x = Math.PI / 2; hole.position.set(0, -0.3, 0.77); scene.add(hole);
    for (let i = 0; i < 3; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6 + i * 0.5, 0.012, 8, 160), glow(0x5cc8ff, 1.2)); ring.rotation.x = 1.35; ring.position.y = -1.2; scene.add(ring); }
  },

  /* Exchange: 3D candlestick chart on a glass slab */
  exchange() {
    lights(); ground(-0.25, 0.16);
    cam.position.set(6, 5, 9); cam.lookAt(0, 0.8, 0);
    const slab = new THREE.Mesh(new RoundedBoxGeometry(7, 0.18, 3, 4, 0.08), glass(0xa9d8ff, { thickness: 0.3 })); slab.position.y = -0.12; add(slab);
    let p = 0.25; for (let i = 0; i < 12; i++) { const d = (Math.sin(i * 1.7) + 0.35) * 0.45; const o = p, c = p + d; p = c; const up = c >= o; const h = Math.max(0.12, Math.abs(c - o));
      const body = new THREE.Mesh(new RoundedBoxGeometry(0.32, h, 0.32, 2, 0.05), solid(up ? TEAL : 0xf06a6a, { emissive: up ? TEAL : 0xf06a6a, emissiveIntensity: 0.25 })); body.position.set(-3 + i * 0.55, Math.min(o, c) + h / 2, 0); add(body);
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h + 0.5, 8), solid(0x9aa5b8)); wick.position.copy(body.position); add(wick, false); }
    const pts = []; p = 0.25; for (let i = 0; i < 12; i++) { p += (Math.sin(i * 1.7) + 0.35) * 0.45; pts.push(new THREE.Vector3(-3 + i * 0.55, p + 0.6, -0.8)); }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.04, 8), glow(BLUE, 1.8)), false);
  },

  /* API: integration hub connected to modules */
  api() {
    lights(); ground(-0.6, 0.16);
    cam.position.set(6, 6, 8); cam.lookAt(0, 0, 0);
    const hub = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.9, 1.8, 6, 0.25), solid(0x0e1c30, { roughness: 0.3 })); add(hub);
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.08, 1.2, 4, 0.04), glow(BLUE, 1.2)); top.position.y = 0.47; add(top);
    const mods = [[-3, 0, -1.2, TEAL], [3, 0, -1.2, INDIGO], [-2.6, 0, 2, CYAN], [2.6, 0, 2, 0x5cc8ff], [0, 0, -3.2, BLUE]];
    mods.forEach(([x, y, z, c]) => { const m = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.55, 1.1, 5, 0.18), glass(0xbfe2ff)); m.position.set(x, y, z); add(m);
      const core = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.25, 0.5, 3, 0.08), glow(c, 1.1)); core.position.set(x, y, z); scene.add(core);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(x * 0.5, -0.45, z * 0.5), new THREE.Vector3(x, -0.2, z)]);
      add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.06, 12), solid(0x22385a)), true);
      add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.025, 8), glow(c, 2)), false); });
  },
};

scenes[name]();
if (!["globe", "ai"].includes(name)) frame(undefined, +(q.get("m") || 0.92));
r.render(scene, cam);
window.done = true;
