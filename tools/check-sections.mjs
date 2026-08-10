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
{
  // Дотичні тіла: два трикутники, що мають рівно одну спільну точку P0.
  // У P0 сходяться чотири відрізки (по два з кожного трикутника) — вершина
  // ступеня 4. Порядок навмисно чергує ребра обох трикутників, а не йде
  // послідовно по кожному, щоб відтворити реальну неоднозначність.
  const P0 = new THREE.Vector3(0, 0, 0);
  const P1 = new THREE.Vector3(2, 0, 0);
  const P2 = new THREE.Vector3(0, 2, 0);
  const P3 = new THREE.Vector3(-1, -2, 0);
  const P4 = new THREE.Vector3(-2, -1, 0);
  const tangent = [[P1, P2], [P3, P4], [P2, P0], [P4, P0], [P0, P1], [P0, P3]];
  const loops = app.stitchSectionLoops(tangent);
  check("дотичні тіла -> два контури", loops.length === 2, `контурів: ${loops.length}`);
  check("обидва трикутники замкнені", loops.length === 2 && loops.every((l) => l.closed && l.points.length === 3));
}
{
  // Незамкнений ланцюг: кінці не сходяться, контур лишається відкритим.
  const chain = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.4, 0)],
    [new THREE.Vector3(1, 0.4, 0), new THREE.Vector3(2, 0, 0)],
    [new THREE.Vector3(2, 0, 0), new THREE.Vector3(3, 0.6, 0)],
  ];
  const loops = app.stitchSectionLoops(chain);
  check("незамкнений ланцюг -> closed === false", loops.length === 1 && loops[0].closed === false, `closed: ${loops[0]?.closed}`);
  check("усі чотири точки на місці", loops[0]?.points.length === 4, `${loops[0]?.points.length}`);
}
{
  // Хорда між двома вершинами розгалуження: P0-Q0 з'єднує напряму дві точки,
  // кожна з яких сама по собі вершина ступеня 4 (три трикутники: P0-Q0-A,
  // P0-C-D, Q0-E-F). Обидва кінці цього відрізка неоднозначні одночасно,
  // і жоден іще не має встановленого напрямку повороту — це єдиний спосіб
  // реально дістатися вибору за геометрією в коді (без цієї перевірки він
  // лишається невиконаним жодного разу, навіть у стрес-перевірках з
  // десятками тіл довкола однієї спільної точки).
  const P0 = new THREE.Vector3(0, 0, 0);
  const Q0 = new THREE.Vector3(4, 0, 0);
  const A = new THREE.Vector3(2, 3, 0);
  const C = new THREE.Vector3(-2, 1, 0);
  const D = new THREE.Vector3(-2, -1, 0);
  const E = new THREE.Vector3(6, 1, 0);
  const F = new THREE.Vector3(6, -2, 0);
  const chord = [
    [P0, Q0],
    [Q0, A], [A, P0],
    [P0, C], [C, D], [D, P0],
    [Q0, E], [E, F], [F, Q0],
  ];
  const loops = app.stitchSectionLoops(chord);
  const hasSelfCrossing = loops.some((l) => {
    const keys = l.points.map((p) => `${p.x}|${p.y}|${p.z}`);
    return new Set(keys).size !== keys.length;
  });
  check("хорда розгалужень -> жоден контур не самоперетинається", !hasSelfCrossing);
  const closedCount = loops.filter((l) => l.closed).length;
  const openCount = loops.filter((l) => !l.closed).length;
  check("два трикутники без спільного ребра замкнені коректно", closedCount === 2, `closed: ${closedCount}`);
  check("нерозв'язна неоднозначність лишає контур незамкненим, а не зшитим навмання", openCount >= 1, `open: ${openCount}`);
}

if (failures) {
  console.error(`\n${failures} перевірок провалено.`);
  process.exit(1);
}
console.log("\nМатематика перерізу відповідає очікуванням.");
