/**
 * Перевірка математики перерізу на реальній геометрії бібліотеки.
 *
 * Запуск із теки Github:  node tools/check-sections.mjs
 *
 * Вирізає з src/app.js чисті функції перерізу (вони не залежать від DOM
 * і від модульного стану) і проганяє їх по .glb. Назва фігури нічого не
 * доводить — числа звіряються з геометрією.
 */
import * as THREE from "../assets/vendor/three/three.module.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(projectRoot, "src", "app.js"), "utf8");

/** Вирізає оголошення функції за іменем через підрахунок фігурних дужок. */
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Функцію не знайдено в app.js: ${name}`);
  let i = source.indexOf("{", start);
  let depth = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(start, i + 1);
}

const NAMES = ["computeSectionNormal", "stitchSectionLoops"];
const factory = new Function("THREE", `${NAMES.map(extract).join("\n")}
  return { ${NAMES.join(", ")} };`);
const app = factory(THREE);

let failures = 0;
function check(label, ok, actual) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ок  " : "ПАДІННЯ"}  ${label}${actual === undefined ? "" : `  (${actual})`}`);
}

console.log("Нормаль площини");
{
  const n = app.computeSectionNormal("y", 0, 0);
  check("вісь Y без нахилу -> (0,1,0)", n.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-6,
    `${n.x.toFixed(3)}, ${n.y.toFixed(3)}, ${n.z.toFixed(3)}`);
}
{
  // Правильний шестикутник у кубі лежить у площині з нормаллю (1,1,1).
  // Без другого кута ця нормаль недосяжна — найкраще наближення хибить на 35,3°.
  const n = app.computeSectionNormal("y", 54.7, 45);
  const target = new THREE.Vector3(1, 1, 1).normalize();
  check("нахил 54,7° + азимут 45° -> (1,1,1)", n.angleTo(target) < 0.001,
    `відхилення ${(n.angleTo(target) * 180 / Math.PI).toFixed(3)}°`);
}

console.log("Зшивання контурів");
{
  const square = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(1, 0, 1), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0)],
  ];
  const loops = app.stitchSectionLoops(square);
  check("чотири відрізки -> один замкнений контур", loops.length === 1 && loops[0].closed, `контурів: ${loops.length}`);
  check("контур має 4 точки", loops[0]?.points.length === 4, `${loops[0]?.points.length}`);
}
{
  // Два незалежні квадрати не сміють злитися в один контур:
  // саме на цьому ламалися парні моделі.
  const shift = (v) => new THREE.Vector3(v.x + 10, v.y, v.z);
  const one = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 1)],
    [new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0)],
  ];
  const two = one.map((s) => s.map(shift));
  const loops = app.stitchSectionLoops([...one, ...two]);
  check("два окремі тіла -> два контури", loops.length === 2, `контурів: ${loops.length}`);
  check("обидва замкнені", loops.every((l) => l.closed));
}

if (failures) {
  console.error(`\n${failures} перевірок провалено.`);
  process.exit(1);
}
console.log("\nМатематика перерізу відповідає очікуванням.");
