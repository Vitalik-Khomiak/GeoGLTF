/**
 * Генератор навчальних моделей бібліотеки.
 *
 * Запуск із кореня проєкту:  node tools/make-models.mjs
 *
 * Пише .glb напряму, без Blender і без залежностей. Причина саме така:
 * геометрія тіл входить в умови навчальних завдань, тому вона має бути точною
 * і відтворюваною, а не «намальованою на око». Усі розміри нижче — свідомі,
 * пояснення в коментарях біля кожного тіла.
 *
 * Домовленості бібліотеки: вісь Y — вертикаль, габарит близько 2 одиниць,
 * тіло відцентроване відносно початку координат. Нормалі пишуться завжди:
 * без них фігура рендериться чорним силуетом.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(projectRoot, "assets", "models");

/* ===================== ЗАПИС GLB ===================== */

/**
 * Грань — список вершин проти годинникової стрілки, якщо дивитись зовні.
 * Нормаль рахується з перших трьох вершин; для гладких поверхонь можна
 * передати `normals` — по одній на вершину.
 */
function faceToTriangles(face, positions, normals, indices) {
  const verts = face.vertices;
  const base = positions.length / 3;
  const n = face.normals ?? null;

  let flat = null;
  if (!n) {
    const [a, b, c] = verts;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    flat = [nx / len, ny / len, nz / len];
  }

  verts.forEach((p, i) => {
    positions.push(p[0], p[1], p[2]);
    const nv = n ? n[i] : flat;
    normals.push(nv[0], nv[1], nv[2]);
  });

  // Віяльна тріангуляція — грані тут опуклі, цього достатньо.
  for (let i = 1; i + 1 < verts.length; i += 1) {
    indices.push(base, base + i, base + i + 1);
  }
}

function buildMesh(name, faces) {
  const positions = [];
  const normals = [];
  const indices = [];
  faces.forEach((face) => faceToTriangles(face, positions, normals, indices));
  return { name, positions, normals, indices };
}

function alignTo4(n) {
  return (4 - (n % 4)) % 4;
}

function writeGlb(filePath, meshes, materialColor = [0.72, 0.52, 0.32, 1]) {
  const accessors = [];
  const bufferViews = [];
  const chunks = [];
  let offset = 0;

  const pushView = (buf, target) => {
    const pad = alignTo4(offset);
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    chunks.push(buf);
    offset += buf.length;
    return bufferViews.length - 1;
  };

  const gltfMeshes = meshes.map((mesh) => {
    const pos = Float32Array.from(mesh.positions);
    const nrm = Float32Array.from(mesh.normals);
    const idx = Uint16Array.from(mesh.indices);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k], pos[i + k]);
        max[k] = Math.max(max[k], pos[i + k]);
      }
    }

    const posView = pushView(Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength), 34962);
    const nrmView = pushView(Buffer.from(nrm.buffer, nrm.byteOffset, nrm.byteLength), 34962);
    const idxView = pushView(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength), 34963);

    accessors.push({ bufferView: posView, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
    accessors.push({ bufferView: nrmView, componentType: 5126, count: nrm.length / 3, type: "VEC3" });
    accessors.push({ bufferView: idxView, componentType: 5123, count: idx.length, type: "SCALAR" });

    const a = accessors.length;
    return {
      name: mesh.name,
      primitives: [{
        attributes: { POSITION: a - 3, NORMAL: a - 2 },
        indices: a - 1,
        material: 0,
        mode: 4,
      }],
    };
  });

  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: "2.0", generator: "GeoGLTF tools/make-models.mjs" },
    scene: 0,
    scenes: [{ nodes: gltfMeshes.map((_, i) => i) }],
    nodes: gltfMeshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes: gltfMeshes,
    materials: [{
      name: "geogltf",
      pbrMetallicRoughness: { baseColorFactor: materialColor, metallicFactor: 0, roughnessFactor: 0.9 },
      doubleSided: true,
    }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = Buffer.alloc(alignTo4(jsonBuf.length), 0x20);
  const binPad = Buffer.alloc(alignTo4(bin.length), 0);
  const jsonChunk = Buffer.concat([jsonBuf, jsonPad]);
  const binChunk = Buffer.concat([bin, binPad]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  const out = Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
  writeFileSync(filePath, out);
  return out.length;
}

/* ===================== ГЕОМЕТРИЧНІ ЗАГОТОВКИ ===================== */

/** Прямокутний паралелепіпед із центром у початку координат. */
function boxFaces(sx, sy, sz, cx = 0, cy = 0, cz = 0) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  return [
    { vertices: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] }, // +Z
    { vertices: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] }, // -Z
    { vertices: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] }, // +X
    { vertices: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] }, // -X
    { vertices: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] }, // +Y
    { vertices: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] }, // -Y
  ];
}

/** Правильний n-кутник у площині XZ; ребро 0 дивиться на +Z, як у розгортках. */
function regularPolygon(n, radius, y, cx = 0, cz = 0) {
  const pts = [];
  const start = Math.PI / n;
  for (let i = 0; i < n; i += 1) {
    const a = start + (i * 2 * Math.PI) / n;
    pts.push([cx + radius * Math.sin(a), y, cz + radius * Math.cos(a)]);
  }
  return pts;
}

/** Піраміда: n-кутна основа плюс бічні трикутники. */
function pyramidFaces(n, baseRadius, height, cy, cx = 0, cz = 0) {
  const base = regularPolygon(n, baseRadius, cy, cx, cz);
  const apex = [cx, cy + height, cz];
  const faces = [{ vertices: [...base].reverse() }];
  for (let i = 0; i < n; i += 1) {
    faces.push({ vertices: [base[i], base[(i + 1) % n], apex] });
  }
  return faces;
}

/** Пряма n-кутна призма. */
function prismFaces(n, baseRadius, height, cy, cx = 0, cz = 0) {
  const bottom = regularPolygon(n, baseRadius, cy - height / 2, cx, cz);
  const top = regularPolygon(n, baseRadius, cy + height / 2, cx, cz);
  const faces = [
    { vertices: [...bottom].reverse() },
    { vertices: top },
  ];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push({ vertices: [bottom[i], bottom[j], top[j], top[i]] });
  }
  return faces;
}

/** Циліндр із гладкими нормалями на бічній поверхні. */
function cylinderFaces(radius, height, cx, cyBottom, cz, segments = 32) {
  const faces = [];
  const yb = cyBottom;
  const yt = cyBottom + height;
  const ring = (y) => Array.from({ length: segments }, (_, i) => {
    const a = (i * 2 * Math.PI) / segments;
    return [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
  });
  const bottom = ring(yb);
  const top = ring(yt);
  faces.push({ vertices: [...bottom].reverse() });
  faces.push({ vertices: top });
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    const na = (v) => [(v[0] - cx) / radius, 0, (v[2] - cz) / radius];
    faces.push({
      vertices: [bottom[i], bottom[j], top[j], top[i]],
      normals: [na(bottom[i]), na(bottom[j]), na(top[j]), na(top[i])],
    });
  }
  return faces;
}

/** Конус із гладкими нормалями на бічній поверхні. */
function coneFaces(radius, height, cx, cyBottom, cz, segments = 32) {
  const faces = [];
  const base = Array.from({ length: segments }, (_, i) => {
    const a = (i * 2 * Math.PI) / segments;
    return [cx + radius * Math.cos(a), cyBottom, cz + radius * Math.sin(a)];
  });
  const apex = [cx, cyBottom + height, cz];
  faces.push({ vertices: [...base].reverse() });
  // Нормаль бічної поверхні нахилена: складова вгору = r / l, радіальна = h / l.
  const slant = Math.hypot(radius, height);
  const sideNormal = (v) => {
    const rx = (v[0] - cx) / radius;
    const rz = (v[2] - cz) / radius;
    return [(rx * height) / slant, radius / slant, (rz * height) / slant];
  };
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    const mid = [(base[i][0] + base[j][0]) / 2, 0, (base[i][2] + base[j][2]) / 2];
    const apexNormal = sideNormal([mid[0], 0, mid[2]]);
    faces.push({
      vertices: [base[i], base[j], apex],
      normals: [sideNormal(base[i]), sideNormal(base[j]), apexNormal],
    });
  }
  return faces;
}

/* ===================== МОДЕЛІ ===================== */

const built = [];
const make = (file, meshes, note) => {
  const bytes = writeGlb(join(modelsDir, file), meshes);
  built.push({ file, bytes, note });
};

/*
 * 1. Прямокутний паралелепіпед — три РІЗНІ виміри.
 * Однакові перетворили б його на куб або призму й зробили доведення
 * про рівність діагоналей тривіальним. 2 × 1,2 × 1,6 дає діагональ рівно √8.
 */
make("parallelepiped.glb", [buildMesh("parallelepiped", boxFaces(2, 1.2, 1.6))]);

/*
 * 2. Правильна чотирикутна піраміда.
 * Основа 1,6; висота 2. Половина діагоналі основи — 1,131, тобто помітно
 * менша за висоту. Якби вони збіглися, бічні грані стали б рівносторонніми,
 * а тіло потрібне саме таке, де вони такими НЕ є.
 * Бічне ребро тут 2,298 проти ребра основи 1,6 — грані рівнобедрені.
 */
make("pyramid_square.glb", [buildMesh("pyramid_square", pyramidFaces(4, 1.6 * Math.SQRT1_2, 2, -1))]);

/*
 * 3. Правильний тетраедр — усі шість ребер рівні 2.
 * Висота a·√(2/3) = 1,633. Орієнтація як у Piramide.glb: сторона основи
 * вздовж X, тому z/x = 0,866 і авто-детект основи в getSupportedUnfoldType
 * розпізнає трикутну основу.
 */
{
  const a = 2;
  const R = a / Math.sqrt(3);
  const H = a * Math.sqrt(2 / 3);
  make("tetrahedron.glb", [buildMesh("tetrahedron", pyramidFaces(3, R, H, -H / 2))]);
}

/*
 * 4. Трикутна призма із заготовленим перерізом.
 * Тіло повторює prism_tri.glb (правильна пряма призма, основа √3, висота 2).
 * Січна площина навмисно похила й не збігається з типовими навчальними
 * перерізами цієї призми, щоб модель не підказувала готової відповіді.
 */
{
  const R = 1;                       // радіус описаного кола основи
  const body = prismFaces(3, R, 2, 0);
  const base = regularPolygon(3, R, 0);
  // Площина через три точки на бічних ребрах, на різних висотах.
  const heights = [-0.2, 0.3, 0.6];
  const section = base.map((p, i) => [p[0], heights[i], p[2]]);
  make("prism_tri_slice.glb", [
    buildMesh("prism", body),
    buildMesh("section", [{ vertices: section }]),
  ]);
}

/*
 * 5. Правильна чотирикутна призма — резерв, і НЕ куб.
 * Сторона основи 1,4 при висоті 2: співвідношення 1,43, помітно на око.
 */
make("prism_square.glb", [buildMesh("prism_square", prismFaces(4, 1.4 * Math.SQRT1_2, 2, 0))]);

/*
 * 6. Два циліндри однакової основи й різної висоти.
 * Застосунок показує одну модель за раз, тому порівняння пліч-о-пліч
 * можливе лише всередині однієї моделі. Основи на спільній площині,
 * інакше різниця висот читається неправильно.
 */
make("cylinders_pair.glb", [
  buildMesh("cylinder_h1", cylinderFaces(1, 1, -1.3, -1, 0)),
  buildMesh("cylinder_h2", cylinderFaces(1, 2, 1.3, -1, 0)),
]);

/*
 * 7. Два подібні конуси, k = 2.
 * Малий r = 0,5 h = 1; великий r = 1 h = 2. Основи на спільній площині.
 */
make("cones_similar.glb", [
  buildMesh("cone_small", coneFaces(0.5, 1, -1.3, -1, 0)),
  buildMesh("cone_large", coneFaces(1, 2, 0.8, -1, 0)),
]);

console.log("Створено моделі:\n");
built.forEach(({ file, bytes }) => {
  console.log(`  ${file.padEnd(24)} ${(bytes / 1024).toFixed(2)} KB`);
});
console.log("\nДалі: перевірити геометрію (node tools/check-models.mjs),");
console.log("додати записи в assets/library.json і шляхи в PRECACHE у sw.js.");
