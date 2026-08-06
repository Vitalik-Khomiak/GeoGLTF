# ARCHITECTURE.md — технічна карта GeoGLTF Viewer

Мета документа: щоб агент або розробник зрозумів проект БЕЗ повного читання `src/app.js` (~3.9k рядків).
Орієнтири дано за іменами функцій (не за номерами рядків — вони дрейфують). Пошук: `grep -n "function ІМʼЯ" src/app.js`.

## 1. Загальна модель

Один HTML-документ, два «екрани», перемикаються CSS-класом на `#appShell`:

- `app-mode-library` — бібліотека моделей (сітка карток з прев'ю);
- `app-mode-viewer` — повноекранний 3D-перегляд з док-панеллю інструментів.

Перемикання: `switchToLibraryMode()` / `switchToViewerMode()`. Жодного роутера, жодного фреймворка.
Один WebGL-канвас `#sceneCanvas`, один рендерер на все (основна сцена + mini-gizmo через viewport/scissor).

## 2. src/app.js — порядок блоків у файлі

Модуль виконується згори вниз. Порядок важливий (див. §8, правило про TDZ).

| # | Блок | Ключові функції / стан |
|---|------|------------------------|
| 1 | DOM-посилання і базовий стан | `canvas`, `fileInput`, всі toggle; `scene`, `renderer`, `camera`, `controls`, `mathStyle`, `axisColors`, `gridHelper`, `axesHelper` |
| 2 | Стан моделі та розгортки | `activeModelRoot`, `activeAsset(Id)`, `publishedAssets[]`, `sessionAssets[]`, `unfoldState{enabled,progress,targetProgress,isPlaying}` |
| 3 | **Ініціалізація (виконується одразу)** | `initializeScene()`, `bindEvents()`, `renderAssetLibraries()`, `loadPublishedLibrary()`, `requestAnimationFrame(animate)` — САМЕ через RAF, не прямий виклик |
| 4 | Сцена/камера/gizmo | `createRenderer/Camera/Controls`, `initializeViewGizmo`, `createGizmoAxis`, `createSceneAxesHelper` |
| 5 | Дата оновлення | `updateProjectUpdatedLabel` → GitHub API або `document.lastModified` |
| 6 | Події UI + drag-and-drop | `bindEvents`, `onDrop`, `registerSessionFiles` |
| 7 | Бібліотека моделей | `loadPublishedLibrary` (fetch library.json), `normalizePublishedAsset`, `renderAssetLibraries`, `renderAssetList`, `renderLibraryError` |
| 8 | Прев'ю (thumbnails) | окремий `thumbnailRenderer` + черга: `enqueueThumbnail` → `processThumbnailQueue` → `createAssetThumbnail` |
| 9 | Завантаження моделі | `loadAsset` (оркестратор) → `resolveAssetArrayBuffer` → `parseModelBuffer` → `prepareModel`, `normalizeModelTransform` |
| 10 | Кадрування камери | `frameCurrentModel`, `getFitCameraDistance` (вписування bbox у FOV по кутах), `updateSavedCameraState`/`applySavedCameraState` (збереження ракурсу між моделями), `updateGridScale` |
| 11 | Розгортки (unfold) | див. §4 |
| 12 | Режими подачі | `applyMathStyleMode` (заливка + суцільні/штрихові ребра через `ensureMathEdgeHelpers`), `applyWireframeMode`, `syncRenderModeControls` (взаємовиключність) |
| 13 | Статистика/статус | `collectModelStats`, `updateStats`, `setStatus` |
| 14 | Очищення ресурсів | `disposeActiveModel`, `disposeThreeObject`, `disposeMaterial` |
| 15 | Layout/мобільний viewport | `resizeRenderer`, `syncViewerLayout` (потрійний resize: RAF+140ms+320ms), `syncMobileViewportHeight`, `waitForStableViewport`, `bindViewportResizeObserver` |
| 16 | Цикл рендеру | `animate` → `updateUnfoldAnimation`, `controls.update`, `maintainSpatialTools`, рендер сцени, `renderViewGizmo` (scissor у куті) |
| 17 | Розширення інтерфейсу | `setNamedView` (front/top/side/iso), `toggleFullscreen`, `captureScreenshot`, `shareCurrentModel` + `openModelFromQuery` (deep link `?model=slug`), `updateModelInfoCard` + `pickModelQuestion` (`MODEL_QUESTIONS`) |
| 18 | **Просторові інструменти** (константи оголошені ТУТ, у низу) | див. §5 |
| 19 | Довідка/оверлей завантаження | `bindHelpAndLoading`, `showLoadingOverlay` |
| 20 | Реєстрація service worker | тільки на `http(s)` |

## 3. Життєвий цикл моделі

```
клік по картці / drop файлу / ?model=slug
  → loadAsset(asset)
      activeAsset = asset; disposeActiveModel(); updateModelInfoCard(); resetSpatialTools()
      → resolveAssetArrayBuffer (fetch для published / FileReader для session)
      → parseModelBuffer: GLTFLoader.parse
          containsRenderableMesh?  ні → reject
          prepareModel (DoubleSide, зберігає node.userData.originalMaterial)
          normalizeModelTransform (центр по X/Z, низ на Y=0)
          scene.add; refreshUnfoldController(); apply режими; collectModelStats; updateEulerInfo()
      → waitForStableViewport → syncViewerLayout → frameCurrentModel
```

Ассет — обʼєкт `{id, source: "published"|"session", title, description, filePath|file, sizeLabel, thumbnail*}`.
`getAllAssets()` = published + session; по цьому списку працює `loadNextAsset()` (кнопка «Наступна»).

## 4. Підсистема розгорток

Патерн — **контролер**: `{ group, faces[], maxBounds, setProgress(p), dispose() }`.
Оригінальна модель ховається (`syncUnfoldVisibility`), замість неї в сцену йде абстрактна побудована фігура.

- Вибір типу: `getSupportedUnfoldType(asset)` — за ключовими словами в назві/шляху файла.
  Типи: `cube`, `pyramid`, `prism-3`, `prism-6`, `cylinder`, `cone`; `null` для cube_slice і sphere.
- Диспетчер: `buildUnfoldController(type, modelRoot)` — міряє bbox і кличе конкретний білдер.
  Для `pyramid` авто-детект основи: `z/x ≈ √3/2` → трикутна, інакше квадратна.
- Два механізми руху граней:
  1. **Трансформний** (многогранники): кожна грань має `folded` і `flat` трансформи (`createFaceTransform` — позиція + кватерніон з базису), `setProgress` робить lerp/slerp. Будуються через `createUnfoldControllerFromFaces(faceDefinitions)`.
  2. **Морфний** (тіла обертання): `createMorphLateralFace(foldedPositions, flatPositions, indices)` — два масиви вершин, `setProgress` лерпить позиції в BufferGeometry (+ переобчислення нормалей і bbox). Передається другим аргументом: `createUnfoldControllerFromFaces(caps, [lateralFace])`. У морф-граней `edgeLines === null` — всі споживачі мають guard.
- Білдери: `buildCubeUnfoldController` (хрест, ланцюжок півотів), `buildSquarePyramidUnfoldController`, `buildRegularPyramidUnfoldController(n, size)`, `buildRegularPrismUnfoldController(n, size)` («пелюстки» навколо нижньої основи + верхня основа за переднім прямокутником), `buildCylinderUnfoldController` (прямокутник 2πr×h), `buildConeUnfoldController` (сектор радіуса l=√(r²+h²), кут 2πr/l).
- Геометрія-хелпери: `getPolygonEdgeDirection(n, i)` (ребро 0 дивиться на +Z), `createRegularPolygonGeometry` (CircleGeometry з thetaStart, узгодженим із напрямками ребер), `createTriangleFaceGeometry` (основа по X, вершина по +Y локально).
- Анімація: `unfoldState` + `updateUnfoldAnimation(dt)` у циклі рендеру; UI — `updateUnfoldUiState`.
- `frameCurrentModel` у режимі розгортки кадрує по `controller.maxBounds` (обʼєднання folded+flat), щоб камера не стрибала.

## 5. Просторові інструменти (низ файла)

Константи блоку (`sectionState`, `clipPlanes`, `labelsGroup`, `measureGroup`…) оголошені тут же — тому нічого з ініціалізаційного блоку (§2 п.3) не сміє чіпати їх синхронно.

- **Переріз** (`sectionState{enabled, axis, position, tiltDeg, showPlane}`):
  `computeSectionGeometry` → нормаль (вісь + нахил) і точка; `buildSectionVisual` →
  clipping (`applyModelClipping` вішає `clipPlanes` на всі матеріали, включно з original/math),
  контур (`collectModelTriangles` + `intersectTriangleWithPlane`),
  заливка `buildSectionFillGeometry` (сорт точок за кутом у площині + fan-тріангуляція; попутно рахує **площу і периметр** → `updateSectionInfo` пише в `#sectionInfo`).
  Обмеження: для НЕопуклих перерізів кутове сортування дає неточну заливку/площу.
  `maintainSpatialTools()` в animate-циклі перевішує clipping (матеріали могли змінитися режимами).
- **Підписи вершин**: `gatherCornerVertices` (унікальні вершини з `EdgesGeometry(geo, 25°)`, кеш `cachedCornerVertices`), `assignVertexLabels` (нижнє кільце A,B,C…, верхнє A₁,B₁…, одинична верхівка S; зіставлення кілець за найближчою XZ-проєкцією), `makeLabelSprite` (canvas-спрайт). Ліміт ≤20 вершин — тільки многогранники.
- **Підсвітка грані**: `highlightFaceAt` — raycast, потім збирає ВСІ компланарні трикутники меша (нормаль збігається і лежать у площині дотику) → підсвічена логічна грань, не трикутник.
- **Лінійка**: `handleMeasureTap` (2 тапи → маркери, лінія, спрайт-підпис відстані), `snapToNearestVertex` (прилипання в радіусі 14% від радіуса моделі), `makeTextSprite`. Стан: `measureStartPoint`, група `measureGroup`.
- **Ейлер**: `computePolyhedronStats` — В з кутових вершин, Р з унікальних сегментів EdgesGeometry, Г групуванням трикутників за (нормаль, константа площини); `updateEulerInfo` пише в `.info-euler` картки. Тільки 4–24 вершини.
- **GeoGebra**: `exportVerticesToGeoGebra` — ті самі вершини+підписи → рядки `A=(x,y,z)` (₁→_1) → clipboard, fallback `window.prompt`.
- **Авто-обертання**: `setAutoRotateEnabled` → `controls.autoRotate`.
- Роздільник тапів у `bindSpatialToolEvents`: pointerup з рухом <7px і <500ms = «тап»; пріоритет — лінійка, потім підсвітка.
- `resetSpatialTools()` викликається при кожному `loadAsset`: вимикає переріз/підписи/підсвітку/лінійку, скидає кеш вершин.

## 6. Гарячі клавіші

`f/t/s/i` — види; `r` — скинути камеру; `c` — переріз; `l` — підписи; `m` — лінійка; `a` — авто-обертання; `h`/`?`/`Esc` — довідка.
Реєструються в трьох місцях: `bindEvents` (r), `bindEnhancementEvents` (види), `bindSpatialToolEvents` (c/l/m/a), `bindHelpAndLoading` (h).

## 7. PWA / офлайн

- `sw.js`: `PRECACHE` (код + вендор + всі моделі) на install; на fetch — cache-first + фонове оновлення кеша (stale-while-revalidate). Стара версія видаляється по зміні імені `CACHE`.
- `manifest.webmanifest`, іконка `assets/icon.svg`.
- Сторож запуску (inline-скрипт в `<head>` index.html): якщо через 4.5с `window.__geogltfReady !== true` — показує оверлей з поясненням (file:// або не завантажився three.js) і командою запуску сервера.

## 8. Відомі підводні камені

1. **TDZ**: константи §5 внизу файла; ініціалізаційний блок вгорі не має права викликати те, що їх читає (історичний краш `animate()`).
2. **SW-кеш**: зміни невидимі без підняття `CACHE` версії (і навіть тоді — потрібне перезавантаження після активації нового SW).
3. **Морф + bbox**: без `computeBoundingBox()` після зміни атрибутів `Box3.setFromObject` бреше (камера кадрує неправильно).
4. **`edgeLines` може бути null** (морф-грані) — у `applyUnfoldRenderStyle` і `dispose` стоять guard-и; не прибирати.
5. **OneDrive**: проект лежить у синхронізованій папці; файли можуть бути «в хмарі» — сторож запуску про це попереджає.
6. **Прихована вкладка**: RAF заморожений → сцена не рендериться, скріншоти виснуть (актуально для автотестів через browser-панель).
7. **Кутове сортування контуру перерізу** некоректне для неопуклих перерізів (відомий компроміс).
8. **`updateStats`** мапить значення на `<dd>` за ІНДЕКСОМ — порядок `<div><dt><dd>` у `#modelStats` фіксований: Статус, Назва, Розмір, Вершини, Полігони.
9. **`loadPublishedLibrary`** викликається також на `window.focus` — список карток може перерендеритись у будь-який момент (тому стан прев'ю живе в обʼєкті ассета, не в DOM).

## 9. Як додавати типові речі

- **Нова фігура з розгорткою**: модель+library.json+PRECACHE (див. §7 — підняти версію `CACHE`) → ключові слова в `getSupportedUnfoldType` → гілка в `buildUnfoldController` → білдер (для правильних призм/пірамід достатньо наявних generic-білдерів) → рядок у `tools/test-unfold.mjs` → PROGRAM_FUNCTIONS.md §3/§8.
- **Новий інструмент аналізу**: toggle в `index.html` (док-рядок 2) → стан+функції в блоці §5 → бінд у `bindSpatialToolEvents` → скидання в `resetSpatialTools` → рядок у `#helpOverlay` → PROGRAM_FUNCTIONS.md §2/§7.12.
- **Нове навчальне запитання**: масив `MODEL_QUESTIONS` (ключові слова → текст).
