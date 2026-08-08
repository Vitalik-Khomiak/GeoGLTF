/**
 * Перевірка фактичної геометрії моделей бібліотеки.
 *
 * Запуск із кореня проєкту:  node tools/check-models.mjs
 *
 * Читає .glb напряму й рахує те, що входить в умови завдань: довжини ребер,
 * габарити, характеристику Ейлера. Назва моделі не є доказом того, що тіло
 * правильне — саме тому перевірка окрема від генератора.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelsDir = join(projectRoot, "assets", "models");

const EPS = 1e-4;

function readGlb(file) {
  const buf = readFileSync(join(modelsDir, file));
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jsonLength).toString("utf8"));
  const binOffset = 20 + jsonLength + 8;

  const readAccessor = (index) => {
    const acc = json.accessors[index];
    const view = json.bufferViews[acc.bufferView];
    const start = binOffset + (view.byteOffset || 0) + (acc.byteOffset || 0);
    const comps = { SCALAR: 1, VEC3: 3 }[acc.type];
    const total = acc.count * comps;
    if (acc.componentType === 5126) return Array.from(new Float32Array(buf.buffer, buf.byteOffset + start, total));
    if (acc.componentType === 5123) return Array.from(new Uint16Array(buf.buffer, buf.byteOffset + start, total));
    if (acc.componentType === 5125) return Array.from(new Uint32Array(buf.buffer, buf.byteOffset + start, total));
    throw new Error(`Невідомий componentType ${acc.componentType}`);
  };

  const meshes = json.meshes.map((mesh) => {
    const prim = mesh.primitives[0];
    return {
      name: mesh.name,
      positions: readAccessor(prim.attributes.POSITION),
      normals: prim.attributes.NORMAL !== undefined ? readAccessor(prim.attributes.NORMAL) : null,
      indices: readAccessor(prim.indices),
    };
  });
  return { json, meshes, bytes: buf.length };
}

/** Зводить збіжні вершини за координатами — у файлі вони продубльовані по гранях. */
function weld(positions, indices) {
  const key = (i) => [0, 1, 2].map((k) => positions[i * 3 + k].toFixed(4)).join(",");
  const map = new Map();
  const unique = [];
  const remap = [];
  for (let i = 0; i < positions.length / 3; i += 1) {
    const k = key(i);
    if (!map.has(k)) {
      map.set(k, unique.length);
      unique.push([positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]]);
    }
    remap[i] = map.get(k);
  }
  return { vertices: unique, triangles: indices.map((i) => remap[i]) };
}

/** Ребра многогранника: пари вершин, що лежать на межі логічної грані. */
function topology(mesh) {
  const { vertices, triangles } = weld(mesh.positions, mesh.indices);

  // Групуємо трикутники в плоскі грані за (нормаль, константа площини).
  const planeKey = new Map();
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [vertices[triangles[t]], vertices[triangles[t + 1]], vertices[triangles[t + 2]]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((x) => x / len);
    const d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    const k = `${n.map((x) => x.toFixed(3)).join(",")}|${d.toFixed(3)}`;
    if (!planeKey.has(k)) planeKey.set(k, []);
    planeKey.get(k).push(t);
  }

  // Ребро грані — те, що трапляється в її трикутниках рівно раз.
  const edges = new Set();
  for (const tris of planeKey.values()) {
    const count = new Map();
    for (const t of tris) {
      for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
        const p = triangles[t + x], q = triangles[t + y];
        const k = p < q ? `${p}-${q}` : `${q}-${p}`;
        count.set(k, (count.get(k) || 0) + 1);
      }
    }
    for (const [k, c] of count) if (c === 1) edges.add(k);
  }

  return { vertices, faces: planeKey.size, edges: [...edges] };
}

function edgeLengths(vertices, edges) {
  const lens = edges.map((e) => {
    const [i, j] = e.split("-").map(Number);
    const [a, b] = [vertices[i], vertices[j]];
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  });
  const groups = new Map();
  lens.forEach((l) => {
    const k = l.toFixed(3);
    groups.set(k, (groups.get(k) || 0) + 1);
  });
  return [...groups.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
}

function bbox(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}

/* ===================== ОЧІКУВАННЯ ===================== */

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

function report(file, fn) {
  const model = readGlb(file);
  console.log(`\n${file}  (${(model.bytes / 1024).toFixed(2)} KB, мешів: ${model.meshes.length})`);
  for (const mesh of model.meshes) {
    if (!mesh.normals) {
      failures += 1;
      console.log(`  FAIL ${mesh.name}: немає атрибута NORMAL`);
    }
  }
  fn(model);
}

report("parallelepiped.glb", (m) => {
  const t = topology(m.meshes[0]);
  const box = bbox(m.meshes[0].positions);
  const lens = edgeLengths(t.vertices, t.edges);
  const diag = Math.hypot(...box.size);
  check("8 вершин, 12 ребер, 6 граней", t.vertices.length === 8 && t.edges.length === 12 && t.faces === 6,
    `В=${t.vertices.length} Р=${t.edges.length} Г=${t.faces}`);
  check("В−Р+Г = 2", t.vertices.length - t.edges.length + t.faces === 2);
  check("три РІЗНІ виміри", new Set(box.size.map((v) => v.toFixed(3))).size === 3,
    box.size.map((v) => v.toFixed(2)).join(" × "));
  check("діагональ = √8 ≈ 2.828", Math.abs(diag - Math.sqrt(8)) < 1e-3, diag.toFixed(4));
  console.log(`       довжини ребер: ${lens.map(([l, c]) => `${l}×${c}`).join(", ")}`);
});

report("pyramid_square.glb", (m) => {
  const t = topology(m.meshes[0]);
  const box = bbox(m.meshes[0].positions);
  const lens = edgeLengths(t.vertices, t.edges);
  check("5 вершин, 8 ребер, 5 граней", t.vertices.length === 5 && t.edges.length === 8 && t.faces === 5,
    `В=${t.vertices.length} Р=${t.edges.length} Г=${t.faces}`);
  check("В−Р+Г = 2", t.vertices.length - t.edges.length + t.faces === 2);
  check("основа квадрат", Math.abs(box.size[0] - box.size[2]) < EPS, `${box.size[0].toFixed(3)} × ${box.size[2].toFixed(3)}`);
  check("два різні розміри ребер (грані НЕ рівносторонні)", lens.length === 2,
    lens.map(([l, c]) => `${l}×${c}`).join(", "));
  const halfDiagonal = (box.size[0] * Math.SQRT2) / 2;
  check("висота помітно ≠ півдіагоналі основи", Math.abs(box.size[1] - halfDiagonal) > 0.3,
    `h=${box.size[1].toFixed(3)} проти d/2=${halfDiagonal.toFixed(3)}`);
});

report("tetrahedron.glb", (m) => {
  const t = topology(m.meshes[0]);
  const box = bbox(m.meshes[0].positions);
  const lens = edgeLengths(t.vertices, t.edges);
  check("4 вершини, 6 ребер, 4 грані", t.vertices.length === 4 && t.edges.length === 6 && t.faces === 4,
    `В=${t.vertices.length} Р=${t.edges.length} Г=${t.faces}`);
  check("В−Р+Г = 2", t.vertices.length - t.edges.length + t.faces === 2);
  check("ВСІ шість ребер рівні", lens.length === 1 && lens[0][1] === 6,
    lens.map(([l, c]) => `${l}×${c}`).join(", "));
  check("z/x ≈ 0.866 (авто-детект трикутної основи)", Math.abs(box.size[2] / box.size[0] - Math.sqrt(3) / 2) < 5e-3,
    (box.size[2] / box.size[0]).toFixed(4));
});

report("prism_tri_slice.glb", (m) => {
  check("два меші: тіло і переріз", m.meshes.length === 2, m.meshes.map((x) => x.name).join(" + "));
  const t = topology(m.meshes[0]);
  const lens = edgeLengths(t.vertices, t.edges);
  check("тіло: 6 вершин, 9 ребер, 5 граней", t.vertices.length === 6 && t.edges.length === 9 && t.faces === 5,
    `В=${t.vertices.length} Р=${t.edges.length} Г=${t.faces}`);
  check("основа рівностороння a = √3", Math.abs(Number(lens[0][0]) - Math.sqrt(3)) < 2e-3,
    lens.map(([l, c]) => `${l}×${c}`).join(", "));
  const s = topology(m.meshes[1]);
  check("переріз — трикутник", s.vertices.length === 3, `вершин: ${s.vertices.length}`);
  const sy = s.vertices.map((v) => v[1]);
  check("переріз похилий (вершини на різних висотах)", new Set(sy.map((y) => y.toFixed(3))).size === 3,
    sy.map((y) => y.toFixed(2)).join(", "));
  check("переріз усередині тіла", Math.min(...sy) > -1 && Math.max(...sy) < 1);
});

report("prism_square.glb", (m) => {
  const t = topology(m.meshes[0]);
  const box = bbox(m.meshes[0].positions);
  check("8 вершин, 12 ребер, 6 граней", t.vertices.length === 8 && t.edges.length === 12 && t.faces === 6,
    `В=${t.vertices.length} Р=${t.edges.length} Г=${t.faces}`);
  check("основа квадрат", Math.abs(box.size[0] - box.size[2]) < EPS, `${box.size[0].toFixed(3)} × ${box.size[2].toFixed(3)}`);
  check("це НЕ куб", Math.abs(box.size[1] - box.size[0]) > 0.3,
    box.size.map((v) => v.toFixed(2)).join(" × "));
});

report("cylinders_pair.glb", (m) => {
  check("два меші", m.meshes.length === 2);
  const boxes = m.meshes.map((x) => bbox(x.positions));
  check("однакові основи", Math.abs(boxes[0].size[0] - boxes[1].size[0]) < EPS,
    `${boxes[0].size[0].toFixed(2)} і ${boxes[1].size[0].toFixed(2)}`);
  check("висоти 1 і 2", Math.abs(boxes[0].size[1] - 1) < EPS && Math.abs(boxes[1].size[1] - 2) < EPS,
    `${boxes[0].size[1].toFixed(2)} і ${boxes[1].size[1].toFixed(2)}`);
  check("основи на спільній площині", Math.abs(boxes[0].min[1] - boxes[1].min[1]) < EPS,
    `y = ${boxes[0].min[1].toFixed(2)} і ${boxes[1].min[1].toFixed(2)}`);
  check("тіла не перетинаються", boxes[0].max[0] < boxes[1].min[0],
    `проміжок ${(boxes[1].min[0] - boxes[0].max[0]).toFixed(2)}`);
});

report("cones_similar.glb", (m) => {
  check("два меші", m.meshes.length === 2);
  const boxes = m.meshes.map((x) => bbox(x.positions));
  const k = boxes[1].size[0] / boxes[0].size[0];
  check("коефіцієнт подібності по основі k = 2", Math.abs(k - 2) < EPS, k.toFixed(4));
  const kh = boxes[1].size[1] / boxes[0].size[1];
  check("той самий k по висоті", Math.abs(kh - 2) < EPS, kh.toFixed(4));
  check("основи на спільній площині", Math.abs(boxes[0].min[1] - boxes[1].min[1]) < EPS);
  check("тіла не перетинаються", boxes[0].max[0] < boxes[1].min[0],
    `проміжок ${(boxes[1].min[0] - boxes[0].max[0]).toFixed(2)}`);
});

if (failures) {
  console.error(`\n${failures} перевірок провалено.`);
  process.exit(1);
}
console.log("\nУся геометрія відповідає умовам завдань.");
