/**
 * Headless-тест геометрії розгорток без браузера.
 *
 * Запуск із кореня проєкту:  node tools/test-unfold.mjs
 *
 * Витягає чисті геометричні функції з src/app.js (вони не залежать від DOM),
 * будує контролер розгортки для кожної підтримуваної фігури з реальними
 * розмірами моделей і перевіряє:
 *   - кількість граней;
 *   - відсутність NaN у bounding box на прогресі 0 / 0.5 / 1;
 *   - що при прогресі 1 фігура повністю плоска (height ≈ 0);
 *   - що розгортка не провалюється під площину Y=0 у крайніх станах.
 */
import * as THREE from "../assets/vendor/three/three.module.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(projectRoot, "src", "app.js"), "utf8");

/** Вирізає оголошення функції за іменем через підрахунок фігурних дужок. */
function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Функцію не знайдено в app.js: ${name}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i + 1);
}

const names = [
  "createFaceTransform",
  "createTriangleFaceGeometry",
  "createUnfoldFace",
  "createUnfoldControllerFromFaces",
  "getPolygonEdgeDirection",
  "createRegularPolygonGeometry",
  "buildRegularPyramidUnfoldController",
  "buildRegularPrismUnfoldController",
  "createMorphLateralFace",
  "buildCylinderUnfoldController",
  "buildConeUnfoldController",
  "buildCubeUnfoldController",
  "buildSquarePyramidUnfoldController",
];

const code = names.map(extract).join("\n\n");
const unfoldState = { progress: 0 };
const factory = new Function("THREE", "unfoldState", `${code}
return { buildRegularPyramidUnfoldController, buildRegularPrismUnfoldController,
  buildCylinderUnfoldController, buildConeUnfoldController,
  buildCubeUnfoldController, buildSquarePyramidUnfoldController };`);
const builders = factory(THREE, unfoldState);

let failures = 0;

function checkController(label, controller, expectedFaces) {
  const problems = [];
  if (!controller) {
    console.log(`${label}: FAIL — контролер null`);
    failures += 1;
    return;
  }
  if (expectedFaces != null && controller.faces.length !== expectedFaces) {
    problems.push(`граней=${controller.faces.length}, очікувалось=${expectedFaces}`);
  }
  for (const p of [0, 0.5, 1]) {
    controller.setProgress(p);
    const box = new THREE.Box3().setFromObject(controller.group);
    const size = box.getSize(new THREE.Vector3());
    if ([size.x, size.y, size.z, box.min.y].some((v) => !Number.isFinite(v))) {
      problems.push(`p=${p}: NaN у bounding box`);
    }
    if (p === 1 && size.y > 0.05) problems.push(`p=1 не плоска: height=${size.y.toFixed(3)}`);
    if (p === 1 && box.min.y < -0.05) problems.push(`p=1 під площиною: minY=${box.min.y.toFixed(3)}`);
  }
  controller.dispose();
  if (problems.length) {
    failures += 1;
    console.log(`${label}: FAIL — ${problems.join("; ")}`);
  } else {
    console.log(`${label}: OK`);
  }
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);
// Розміри відповідають реальним моделям з assets/models після нормалізації.
checkController("cube (6 граней)", builders.buildCubeUnfoldController(v(2, 2, 2)), 6);
checkController("pyramid-tri (4)", builders.buildRegularPyramidUnfoldController(3, v(1.732, 2, 1.5)), 4);
checkController("pyramid-sq (5)", builders.buildSquarePyramidUnfoldController(v(2, 2, 2)), 5);
checkController("prism-3 (5)", builders.buildRegularPrismUnfoldController(3, v(1.732, 2, 1.5)), 5);
checkController("prism-6 (8)", builders.buildRegularPrismUnfoldController(6, v(1.732, 2, 2)), 8);
checkController("cylinder (3)", builders.buildCylinderUnfoldController(v(2, 2, 2)), 3);
checkController("cone (2)", builders.buildConeUnfoldController(v(2, 2, 2)), 2);

if (failures) {
  console.error(`\n${failures} перевірок провалено.`);
  process.exit(1);
}
console.log("\nУсі розгортки пройшли перевірку.");
