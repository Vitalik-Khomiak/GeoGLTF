import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#sceneCanvas");
const fileInput = document.querySelector("#modelInput");
const resetViewButton = document.querySelector("#resetViewButton");
const mathModeToggle = document.querySelector("#mathModeToggle");
const gridToggle = document.querySelector("#gridToggle");
const axesToggle = document.querySelector("#axesToggle");
const wireframeToggle = document.querySelector("#wireframeToggle");
const statusText = document.querySelector("#statusText");
const dropZone = document.querySelector("#dropZone");
const modelStats = document.querySelector("#modelStats");
const publishedLibrary = document.querySelector("#publishedLibrary");
const sessionLibrary = document.querySelector("#sessionLibrary");
const sceneHint = document.querySelector("#sceneHint");
const closeHintButton = document.querySelector("#closeHintButton");
const viewGizmo = document.querySelector("#viewGizmo");
const appShell = document.querySelector("#appShell");
const backToLibraryButton = document.querySelector("#backToLibraryButton");
const viewerResetButton = document.querySelector("#viewerResetButton");
const quickResetButton = document.querySelector("#quickResetButton");
const unfoldModeToggle = document.querySelector("#unfoldModeToggle");
const unfoldPlayButton = document.querySelector("#unfoldPlayButton");
const unfoldProgressSlider = document.querySelector("#unfoldProgressSlider");
const nextModelButton = document.querySelector("#nextModelButton");
const viewerTitle = document.querySelector("#viewerTitle");
const projectUpdated = document.querySelector("#projectUpdated");
const viewerPanel = document.querySelector(".viewer-panel");

const scene = new THREE.Scene();
const renderer = createRenderer(canvas);
const camera = createCamera();
const controls = createControls(camera, renderer.domElement);
const loader = new GLTFLoader();
const thumbnailLoader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const animationClock = new THREE.Clock();
const mathStyle = {
  faceColor: new THREE.Color(0xc58f66),
  faceOpacity: 0.68,
  visibleEdgeColor: 0x964b00,
  hiddenEdgeColor: 0x964b00,
  hiddenOpacity: 0.65,
  dashSize: 0.18,
  gapSize: 0.12,
};
const HINT_STORAGE_KEY = "geogltf-scene-hint-hidden";
const gizmoScene = new THREE.Scene();
const gizmoCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 10);
const gizmoRoot = new THREE.Group();
const gizmoViewport = { x: 0, y: 0, width: 96, height: 96 };
const thumbnailCanvas = document.createElement("canvas");
const thumbnailRenderer = new THREE.WebGLRenderer({
  canvas: thumbnailCanvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
thumbnailRenderer.setPixelRatio(1);
thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
const thumbnailQueue = [];
let isProcessingThumbnailQueue = false;

const gridHelper = new THREE.GridHelper(20, 20, 0x507dbc, 0x8aa1b1);
gridHelper.position.y = -0.0001;
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(8);
scene.add(axesHelper);

let activeModelRoot = null;
let activeAssetId = null;
let currentModelFrameSize = 1;
let savedCameraState = null;
const publishedAssets = [];
const sessionAssets = [];
let activeAsset = null;
let activeUnfoldController = null;
const unfoldState = {
  enabled: false,
  progress: 0,
  targetProgress: 0,
  isPlaying: false,
  playbackDirection: 1,
};

initializeScene();
updateProjectUpdatedLabel();
bindEvents();
renderAssetLibraries();
loadPublishedLibrary();
animate();
setStatus("Готово до завантаження моделі");

/**
 * Створює WebGL-рендерер з адаптацією під щільність екрана.
 */
function createRenderer(targetCanvas) {
  const nextRenderer = new THREE.WebGLRenderer({
    canvas: targetCanvas,
    antialias: true,
    alpha: true,
  });

  nextRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  nextRenderer.outputColorSpace = THREE.SRGBColorSpace;
  nextRenderer.autoClear = false;
  return nextRenderer;
}

/**
 * Створює перспективну камеру для огляду об'єкта в просторі.
 */
function createCamera() {
  const nextCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  nextCamera.position.set(8, 6, 8);
  return nextCamera;
}

/**
 * Налаштовує OrbitControls для вільного обертання, панорамування та масштабування моделі.
 */
function createControls(targetCamera, domElement) {
  const nextControls = new OrbitControls(targetCamera, domElement);
  nextControls.enableDamping = true;
  nextControls.dampingFactor = 0.08;
  nextControls.rotateSpeed = 0.9;
  nextControls.zoomSpeed = 1.1;
  nextControls.panSpeed = 0.85;
  nextControls.screenSpacePanning = true;
  nextControls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  nextControls.target.set(0, 0, 0);
  return nextControls;
}

/**
 * Додає базове освітлення, фон та стартове підлаштування розміру сцени.
 */
function initializeScene() {
  scene.background = new THREE.Color(0xf3f7fb);

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0x4a6073, 1.25);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
  keyLight.position.set(8, 14, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xbcd7ff, 0.65);
  rimLight.position.set(-8, 6, -10);
  scene.add(rimLight);

  initializeViewGizmo();
  resizeRenderer();
}

/**
 * Створює компактний навігатор орієнтації, який повторює поворот камери.
 */
function initializeViewGizmo() {
  gizmoCamera.position.set(0, 0, 4.2);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
  gizmoScene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(2, 3, 4);
  gizmoScene.add(directionalLight);

  gizmoRoot.add(createGizmoAxis("x", 0xff3b58, new THREE.Vector3(1, 0, 0)));
  gizmoRoot.add(createGizmoAxis("y", 0x7bdc2f, new THREE.Vector3(0, 1, 0)));
  gizmoRoot.add(createGizmoAxis("z", 0x2b7fff, new THREE.Vector3(0, 0, 1)));
  gizmoScene.add(gizmoRoot);
}

/**
 * Створює одну вісь gizmo з лінією, кулькою та текстовою міткою.
 */
function createGizmoAxis(label, color, direction) {
  const axisGroup = new THREE.Group();

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      direction.clone().multiplyScalar(0.9),
    ]),
    new THREE.LineBasicMaterial({ color }),
  );
  axisGroup.add(line);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 18),
    new THREE.MeshPhongMaterial({ color }),
  );
  sphere.position.copy(direction).multiplyScalar(1.02);
  axisGroup.add(sphere);

  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createAxisLabelTexture(label.toUpperCase(), color),
      transparent: true,
      depthTest: false,
    }),
  );
  labelSprite.scale.set(0.46, 0.46, 0.46);
  labelSprite.position.copy(direction).multiplyScalar(1.38);
  axisGroup.add(labelSprite);

  return axisGroup;
}

/**
 * Генерує маленьку текстуру для підпису осі без зовнішніх шрифтів або DOM-накладок.
 */
function createAxisLabelTexture(text, color) {
  const size = 96;
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = size;
  labelCanvas.height = size;
  const context = labelCanvas.getContext("2d");

  context.clearRect(0, 0, size, size);
  context.beginPath();
  context.arc(size / 2, size / 2, 28, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.stroke();
  context.fillStyle = "#132238";
  context.font = "bold 40px Trebuchet MS";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, size / 2, size / 2 + 1);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Оновлює дату останнього оновлення коду з GitHub, а локально використовує дату зміни файлу як fallback.
 */
async function updateProjectUpdatedLabel() {
  if (!projectUpdated) {
    return;
  }

  projectUpdated.textContent = "Оновлення коду: перевірка...";

  try {
    const repoInfo = resolveGitHubRepoInfo();

    if (!repoInfo) {
      throw new Error("GitHub repo info unavailable");
    }

    const response = await fetch(
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/commits?per_page=1`,
    );

    if (!response.ok) {
      throw new Error(`GitHub API responded with ${response.status}`);
    }

    const [latestCommit] = await response.json();
    const isoDate = latestCommit?.commit?.committer?.date ?? latestCommit?.commit?.author?.date;

    if (!isoDate) {
      throw new Error("Commit date missing");
    }

    projectUpdated.textContent = `Оновлення коду: ${formatDisplayDate(isoDate)}`;
  } catch {
    projectUpdated.textContent = `Оновлення коду: ${getLocalFallbackDate()}`;
  }
}

/**
 * Визначає owner/repo для GitHub Pages URL, щоб можна було підтягнути дату останнього коміту.
 */
function resolveGitHubRepoInfo() {
  const { hostname, pathname } = window.location;
  const pathParts = pathname.split("/").filter(Boolean);

  if (hostname.endsWith(".github.io") && pathParts.length > 0) {
    return {
      owner: hostname.replace(".github.io", ""),
      repo: pathParts[0],
    };
  }

  return null;
}

/**
 * Форматує дату у звичний короткий вигляд для українського інтерфейсу.
 */
function formatDisplayDate(dateInput) {
  return new Date(dateInput).toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Повертає локальний fallback, якщо GitHub API недоступний.
 */
function getLocalFallbackDate() {
  return formatDisplayDate(document.lastModified || new Date());
}

/**
 * Підписує UI-елементи, drag-and-drop і клавіатуру на дії переглядача.
 */
function bindEvents() {
  window.addEventListener("resize", resizeRenderer);
  window.addEventListener("focus", loadPublishedLibrary);
  window.addEventListener("orientationchange", () => {
    syncViewerLayout({ reframeModel: true, preserveView: true });
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      syncViewerLayout({ reframeModel: true, preserveView: true });
    });
  }

  fileInput.addEventListener("change", onFileInputChange);
  resetViewButton.addEventListener("click", frameCurrentModel);
  viewerResetButton.addEventListener("click", frameCurrentModel);
  quickResetButton.addEventListener("click", frameCurrentModel);
  unfoldModeToggle.addEventListener("change", () => {
    setUnfoldModeEnabled(unfoldModeToggle.checked);
  });
  unfoldPlayButton.addEventListener("click", toggleUnfoldPlayback);
  unfoldProgressSlider.addEventListener("input", onUnfoldProgressInput);
  closeHintButton.addEventListener("click", hideSceneHint);
  backToLibraryButton.addEventListener("click", switchToLibraryMode);
  nextModelButton.addEventListener("click", loadNextAsset);
  mathModeToggle.addEventListener("change", () => {
    if (mathModeToggle.checked && wireframeToggle.checked) {
      wireframeToggle.checked = false;
    }

    syncRenderModeControls();
    applyMathStyleMode(mathModeToggle.checked);
    applyWireframeMode(wireframeToggle.checked);
    applyUnfoldRenderStyle();
  });
  gridToggle.addEventListener("change", () => {
    gridHelper.visible = gridToggle.checked;
  });
  axesToggle.addEventListener("change", () => {
    axesHelper.visible = axesToggle.checked;
  });
  wireframeToggle.addEventListener("change", () => {
    if (wireframeToggle.checked && mathModeToggle.checked) {
      mathModeToggle.checked = false;
      applyMathStyleMode(false);
    }

    syncRenderModeControls();
    applyWireframeMode(wireframeToggle.checked);
    applyUnfoldRenderStyle();
  });
  controls.addEventListener("change", updateSavedCameraState);

  dropZone.addEventListener("dragenter", onDragEnter);
  dropZone.addEventListener("dragover", onDragOver);
  dropZone.addEventListener("dragleave", onDragLeave);
  dropZone.addEventListener("drop", onDrop);

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r") {
      frameCurrentModel();
    }
  });

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  syncRenderModeControls();
  restoreSceneHintState();
  updateUnfoldUiState();
}

/**
 * Підвантажує модель із локального input-елемента.
 */
function onFileInputChange(event) {
  const files = [...(event.target.files ?? [])];
  event.target.value = "";

  if (!files.length) {
    return;
  }
  registerSessionFiles(files);
}

/**
 * Підсвічує область дропа, коли користувач переносить файл на сцену.
 */
function onDragEnter(event) {
  event.preventDefault();
  dropZone.classList.add("drag-active");
}

/**
 * Дозволяє browser drop подію для файлів у canvas-зоні.
 */
function onDragOver(event) {
  event.preventDefault();
  dropZone.classList.add("drag-active");
}

/**
 * Прибирає стилі drag-and-drop, коли користувач виходить із зони.
 */
function onDragLeave(event) {
  event.preventDefault();

  if (event.target === dropZone) {
    dropZone.classList.remove("drag-active");
  }
}

/**
 * Обробляє drop локального .glb файлу просто на сцену.
 */
function onDrop(event) {
  event.preventDefault();
  dropZone.classList.remove("drag-active");

  const files = [...(event.dataTransfer?.files ?? [])];
  if (!files.length) {
    return;
  }
  registerSessionFiles(files);
}

/**
 * Реєструє локальні файли в сесійній бібліотеці та одразу відкриває першу модель.
 */
function registerSessionFiles(files) {
  const validFiles = files.filter((file) => isGlbFile(file.name));

  if (!validFiles.length) {
    setStatus("Підтримуються лише файли .glb");
    return;
  }

  const newlyAddedAssets = [];

  validFiles.forEach((file) => {
    const fileKey = createSessionFileKey(file);
    const existingAsset = sessionAssets.find((asset) => asset.fileKey === fileKey);

    if (existingAsset) {
      newlyAddedAssets.push(existingAsset);
      return;
    }

    const asset = {
      id: `session-${sessionAssets.length + 1}-${Date.now()}`,
      source: "session",
      title: file.name,
      description: "Локальний файл з поточної сесії",
      sizeLabel: formatFileSize(file.size),
      file,
      fileKey,
    };

    sessionAssets.push(asset);
    newlyAddedAssets.push(asset);
  });

  renderAssetLibraries();

  if (newlyAddedAssets.length) {
    setStatus(`Додано локальних моделей: ${newlyAddedAssets.length}`);
  }
}

/**
 * Завантажує каталог опублікованих моделей, доступних для всіх користувачів сайту.
 */
async function loadPublishedLibrary() {
  try {
    const response = await fetch("./assets/library.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Не вдалося прочитати каталог моделей (${response.status}).`);
    }

    const payload = await response.json();
    const assets = Array.isArray(payload.assets) ? payload.assets : [];

    publishedAssets.splice(
      0,
      publishedAssets.length,
      ...assets
        .map((entry, index) => normalizePublishedAsset(entry, index))
        .filter(Boolean),
    );
    renderAssetLibraries();
  } catch (error) {
    console.error(error);
    publishedAssets.length = 0;
    renderAssetLibraries();
  }
}

/**
 * Уніфікує структуру запису з JSON-каталогу перед показом у UI.
 */
function normalizePublishedAsset(entry, index) {
  if (!entry || typeof entry.file !== "string" || !isGlbFile(entry.file)) {
    return null;
  }

  return {
    id: `published-${index + 1}`,
    source: "published",
    title: entry.title?.trim() || `Модель ${index + 1}`,
    description: entry.description?.trim() || "Опублікована модель для спільного доступу",
    filePath: entry.file,
    sizeLabel: typeof entry.sizeLabel === "string" ? entry.sizeLabel : null,
  };
}

/**
 * Перемальовує обидва списки моделей і виділяє поточну активну.
 */
function renderAssetLibraries() {
  renderAssetList(publishedLibrary, publishedAssets, "Опублікованих моделей поки немає.");
  renderAssetList(sessionLibrary, sessionAssets, "Локальних моделей поки не додано.");
  updateViewerActions();
}

/**
 * Рендерить один список асетів як набір карток-кнопок.
 */
function renderAssetList(container, assets, emptyMessage) {
  container.replaceChildren();

  if (!assets.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "asset-card-empty";
    emptyState.textContent = emptyMessage;
    container.append(emptyState);
    return;
  }

  assets.forEach((asset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `asset-card${asset.id === activeAssetId ? " active" : ""}`;
    button.addEventListener("click", () => {
      loadAsset(asset, { switchMode: true });
    });

    const preview = document.createElement("div");
    preview.className = "asset-card-preview";

    if (asset.thumbnailDataUrl) {
      const image = document.createElement("img");
      image.className = "asset-card-image";
      image.src = asset.thumbnailDataUrl;
      image.alt = `Прев'ю моделі ${asset.title}`;
      preview.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "asset-card-placeholder";
      placeholder.textContent =
        asset.thumbnailStatus === "error" ? "No preview" : "Preview";
      preview.append(placeholder);
      enqueueThumbnail(asset);
    }

    const title = document.createElement("span");
    title.className = "asset-card-title";
    title.textContent = asset.title;

    const meta = document.createElement("span");
    meta.className = "asset-card-meta";
    meta.textContent = `${asset.source === "published" ? "Сайт" : "Сесія"} • ${asset.description}`;

    button.append(preview, title, meta);
    container.append(button);
  });
}

/**
 * Завантажує модель із вибраного джерела: локального файлу або JSON-каталогу.
 */
async function loadAsset(asset, options = {}) {
  const { switchMode = true, preserveView = false } = options;
  activeAsset = asset;
  unfoldState.progress = 0;
  unfoldState.targetProgress = 0;
  unfoldState.isPlaying = false;
  activeAssetId = asset.id;
  renderAssetLibraries();
  disposeActiveModel();
  updateViewerHeader(asset.title);

  if (switchMode) {
    switchToViewerMode();
  }

  setStatus(`Завантаження моделі: ${asset.title}`);
  updateStats({
    status: "Завантаження...",
    name: asset.title,
    size: asset.sizeLabel ?? "-",
    vertices: "-",
    polygons: "-",
  });

  try {
    const arrayBuffer = await resolveAssetArrayBuffer(asset);
    await parseModelBuffer(arrayBuffer, asset, { preserveView });
    syncViewerLayout({ reframeModel: true, preserveView });
  } catch (error) {
    handleLoadError(asset, error);
  }
}

/**
 * Ставить генерацію прев'ю в чергу, щоб не створювати надто багато рендерів одночасно.
 */
function enqueueThumbnail(asset) {
  if (asset.thumbnailStatus === "queued" || asset.thumbnailStatus === "loading" || asset.thumbnailDataUrl) {
    return;
  }

  asset.thumbnailStatus = "queued";
  thumbnailQueue.push(asset);
  processThumbnailQueue();
}

/**
 * Послідовно генерує thumbnails для моделей у бібліотеці.
 */
async function processThumbnailQueue() {
  if (isProcessingThumbnailQueue) {
    return;
  }

  isProcessingThumbnailQueue = true;

  while (thumbnailQueue.length) {
    const asset = thumbnailQueue.shift();
    asset.thumbnailStatus = "loading";

    try {
      const arrayBuffer = await resolveAssetArrayBuffer(asset);
      asset.thumbnailDataUrl = await createAssetThumbnail(arrayBuffer);
      asset.thumbnailStatus = "loaded";
    } catch (error) {
      console.error(error);
      asset.thumbnailStatus = "error";
    }

    renderAssetLibraries();
  }

  isProcessingThumbnailQueue = false;
}

/**
 * Створює data URL прев'ю моделі для картки бібліотеки.
 */
function createAssetThumbnail(arrayBuffer) {
  return new Promise((resolve, reject) => {
    thumbnailLoader.parse(
      arrayBuffer.slice(0),
      "",
      (gltf) => {
        const thumbnailScene = new THREE.Scene();
        thumbnailScene.background = new THREE.Color(0xe8eef6);

        const ambientLight = new THREE.HemisphereLight(0xffffff, 0x8aa1b1, 1.3);
        thumbnailScene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
        keyLight.position.set(3, 4, 5);
        thumbnailScene.add(keyLight);

        const previewModel = gltf.scene;
        if (!containsRenderableMesh(previewModel)) {
          reject(new Error("Model has no renderable geometry."));
          return;
        }

        prepareThumbnailModel(previewModel);
        normalizeModelTransform(previewModel);
        thumbnailScene.add(previewModel);

        const previewCamera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 100);
        frameThumbnailCamera(previewCamera, previewModel);

        thumbnailRenderer.setSize(640, 400, false);
        thumbnailRenderer.clear();
        thumbnailRenderer.render(thumbnailScene, previewCamera);

        const imageDataUrl = thumbnailRenderer.domElement.toDataURL("image/png");
        disposeThreeObject(previewModel);
        resolve(imageDataUrl);
      },
      (error) => {
        reject(error);
      },
    );
  });
}

/**
 * Підготовлює міні-модель до короткого статичного рендера у бібліотеці.
 */
function prepareThumbnailModel(modelRoot) {
  modelRoot.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.material = new THREE.MeshPhongMaterial({
      color: 0xb78155,
      side: THREE.DoubleSide,
      shininess: 14,
    });
  });
}

/**
 * Підбирає камеру так, щоб thumbnail заповнював картку і добре читався.
 */
function frameThumbnailCamera(previewCamera, modelRoot) {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const safeDimension = Math.max(size.x, size.y, size.z) || 1;
  const distance = safeDimension * 1.35;

  previewCamera.position.set(
    center.x + distance,
    center.y + distance * 0.8,
    center.z + distance,
  );
  previewCamera.lookAt(center);
  previewCamera.near = 0.01;
  previewCamera.far = safeDimension * 20;
  previewCamera.updateProjectionMatrix();
}

/**
 * Повертає єдиний список моделей для циклічного переходу між ними.
 */
function getAllAssets() {
  return [...publishedAssets, ...sessionAssets];
}

/**
 * Завантажує наступну модель по колу відносно поточної активної.
 */
function loadNextAsset() {
  const allAssets = getAllAssets();

  if (!allAssets.length) {
    return;
  }

  const activeIndex = allAssets.findIndex((asset) => asset.id === activeAssetId);
  const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % allAssets.length : 0;
  loadAsset(allAssets[nextIndex], { switchMode: true, preserveView: true });
}

/**
 * Перемикає застосунок у режим бібліотеки моделей.
 */
function switchToLibraryMode() {
  appShell.classList.remove("app-mode-viewer");
  appShell.classList.add("app-mode-library");
  loadPublishedLibrary();
}

/**
 * Перемикає застосунок у режим повноекранного перегляду моделі.
 */
function switchToViewerMode() {
  appShell.classList.remove("app-mode-library");
  appShell.classList.add("app-mode-viewer");
  window.scrollTo(0, 0);
  syncViewerLayout({
    reframeModel: Boolean(activeModelRoot),
    preserveView: false,
  });
}

/**
 * Оновлює заголовок активної моделі у viewer-toolbar.
 */
function updateViewerHeader(title) {
  viewerTitle.textContent = title || "Перегляд моделі";
}

/**
 * Актуалізує стан кнопок навігації у viewer залежно від наявності моделей.
 */
function updateViewerActions() {
  nextModelButton.disabled = getAllAssets().length === 0;
  updateUnfoldUiState();
}

/**
 * Повертає поточне дерево об'єктів, яке користувач бачить у сцені.
 */
function getCurrentDisplayRoot() {
  if (unfoldState.enabled && activeUnfoldController) {
    return activeUnfoldController.group;
  }

  return activeModelRoot;
}

/**
 * Запам'ятовує поточний ракурс камери відносно активної моделі.
 */
function updateSavedCameraState() {
  if (!activeModelRoot) {
    return;
  }

  const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const distance = offset.length();

  if (!distance) {
    return;
  }

  savedCameraState = {
    direction: offset.normalize().clone(),
    distanceFactor: distance / Math.max(currentModelFrameSize, 1),
  };
}

/**
 * Переносить збережений ракурс на нову модель, зберігаючи кут і масштаб огляду.
 */
function applySavedCameraState(modelCenter, modelSize, minimumDistance = 0) {
  const distance = Math.max(
    Math.max(modelSize, 1) * savedCameraState.distanceFactor,
    minimumDistance,
  );
  const offset = savedCameraState.direction.clone().multiplyScalar(distance);

  controls.target.copy(modelCenter);
  camera.position.copy(modelCenter).add(offset);
}

/**
 * Обчислює безпечну дистанцію камери, щоб модель повністю вміщалась навіть на вузькому екрані.
 */
function getFitCameraDistance(bounds, viewDirection) {
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = viewDirection.clone().normalize();
  const fallbackUp = Math.abs(direction.y) > 0.96
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(fallbackUp, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.1));
  const tanVertical = Math.max(Math.tan(verticalHalfFov), 0.1);
  const tanHorizontal = Math.max(Math.tan(horizontalHalfFov), 0.1);
  const boxMin = bounds.min;
  const boxMax = bounds.max;
  const corners = [
    new THREE.Vector3(boxMin.x, boxMin.y, boxMin.z),
    new THREE.Vector3(boxMin.x, boxMin.y, boxMax.z),
    new THREE.Vector3(boxMin.x, boxMax.y, boxMin.z),
    new THREE.Vector3(boxMin.x, boxMax.y, boxMax.z),
    new THREE.Vector3(boxMax.x, boxMin.y, boxMin.z),
    new THREE.Vector3(boxMax.x, boxMin.y, boxMax.z),
    new THREE.Vector3(boxMax.x, boxMax.y, boxMin.z),
    new THREE.Vector3(boxMax.x, boxMax.y, boxMax.z),
  ];

  let requiredDistance = 1;

  corners.forEach((corner) => {
    const relative = corner.clone().sub(center);
    const alongDirection = relative.dot(direction);
    const horizontalOffset = Math.abs(relative.dot(right));
    const verticalOffset = Math.abs(relative.dot(up));
    const distanceForHorizontalFit = alongDirection + horizontalOffset / tanHorizontal;
    const distanceForVerticalFit = alongDirection + verticalOffset / tanVertical;

    requiredDistance = Math.max(
      requiredDistance,
      distanceForHorizontalFit,
      distanceForVerticalFit,
    );
  });

  return requiredDistance * 1.16;
}

/**
 * Читає локальний файл як ArrayBuffer для подальшого парсингу GLB.
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new Error("Файл не вдалося прочитати як ArrayBuffer."));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Помилка читання локального файлу."));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Отримує ArrayBuffer опублікованої моделі з папки проєкту.
 */
async function fetchAssetArrayBuffer(filePath) {
  const response = await fetch(filePath);

  if (!response.ok) {
    throw new Error(`Не вдалося завантажити файл моделі (${response.status}).`);
  }

  return response.arrayBuffer();
}

/**
 * Уніфікує отримання буфера моделі для viewer і для генерації прев'ю.
 */
async function resolveAssetArrayBuffer(asset) {
  return asset.source === "published"
    ? fetchAssetArrayBuffer(asset.filePath)
    : readFileAsArrayBuffer(asset.file);
}

/**
 * Парсить буфер моделі та оновлює сцену й статистику після успішного імпорту.
 */
function parseModelBuffer(arrayBuffer, asset, options = {}) {
  const { preserveView = false } = options;

  return new Promise((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      "",
      (gltf) => {
        if (!containsRenderableMesh(gltf.scene)) {
          reject(new Error("Модель не містить геометрії для відображення."));
          return;
        }

        activeModelRoot = gltf.scene;
        prepareModel(activeModelRoot);
        normalizeModelTransform(activeModelRoot);
        scene.add(activeModelRoot);
        refreshUnfoldController();
        applyMathStyleMode(mathModeToggle.checked);
        applyWireframeMode(wireframeToggle.checked);
        applyUnfoldRenderStyle();
        frameCurrentModel({ preserveView });

        const stats = collectModelStats(activeModelRoot);
        updateStats({
          status: "Модель успішно завантажена",
          name: asset.title,
          size: asset.sizeLabel ?? formatFileSize(arrayBuffer.byteLength),
          vertices: stats.vertices.toLocaleString("uk-UA"),
          polygons: stats.triangles.toLocaleString("uk-UA"),
        });
        setStatus(`Модель ${asset.title} готова до аналізу`);
        resolve();
      },
      (error) => {
        reject(error);
      },
    );
  });
}

/**
 * Перевіряє, чи містить сцена хоча б один mesh із геометрією.
 */
function containsRenderableMesh(root) {
  let hasMesh = false;

  root?.traverse((node) => {
    if (hasMesh) {
      return;
    }

    if (node.isMesh && node.geometry) {
      hasMesh = true;
    }
  });

  return hasMesh;
}

/**
 * Готує матеріали та тіні моделі, щоб вона коректно читалась у сцені.
 */
function prepareModel(modelRoot) {
  modelRoot.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.castShadow = true;
    node.receiveShadow = true;
    node.userData.originalMaterial = node.material;

    if (Array.isArray(node.material)) {
      node.material.forEach((material) => {
        material.side = THREE.DoubleSide;
      });
      return;
    }

    node.material.side = THREE.DoubleSide;
  });
}

/**
 * Центрує модель по X/Z і ставить її на площину Y=0 для стабільної навчальної сцени.
 */
function normalizeModelTransform(modelRoot) {
  modelRoot.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const center = bounds.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -bounds.min.y, -center.z);

  modelRoot.position.add(offset);
  modelRoot.updateMatrixWorld(true);
}

/**
 * Підбирає позицію камери й масштаб сітки під поточну модель.
 */
function frameCurrentModel(options = {}) {
  const { preserveView = false } = options;
  const displayRoot = getCurrentDisplayRoot();

  if (!displayRoot) {
    controls.target.set(0, 0, 0);
    camera.position.set(8, 6, 8);
    controls.update();
    return;
  }

  const bounds = unfoldState.enabled && activeUnfoldController?.maxBounds
    ? activeUnfoldController.maxBounds.clone()
    : new THREE.Box3().setFromObject(displayRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const safeDimension = maxDimension || 1;
  const defaultDirection = new THREE.Vector3(1, 0.7, 1).normalize();
  const fitDirection = preserveView && savedCameraState
    ? savedCameraState.direction
    : defaultDirection;
  const fitDistance = getFitCameraDistance(bounds, fitDirection);
  currentModelFrameSize = safeDimension;

  if (preserveView && savedCameraState) {
    applySavedCameraState(center, safeDimension, fitDistance);
  } else {
    camera.position.copy(center).add(defaultDirection.multiplyScalar(fitDistance));
    controls.target.copy(center);
  }

  camera.near = Math.max(safeDimension / 100, 0.01);
  camera.far = safeDimension * 100;
  camera.updateProjectionMatrix();

  controls.maxDistance = safeDimension * 20;
  controls.update();
  updateGridScale(safeDimension, center);
  updateSavedCameraState();
}

/**
 * Масштабує координатну сітку так, щоб вона не губилась поруч із моделлю.
 */
function updateGridScale(modelSize, modelCenter) {
  const gridSize = Math.max(10, Math.ceil(modelSize * 2));
  const divisions = Math.max(10, Math.ceil(gridSize));

  gridHelper.geometry.dispose();
  gridHelper.geometry = new THREE.GridHelper(
    gridSize,
    divisions,
    0x507dbc,
    0x8aa1b1,
  ).geometry;
  gridHelper.position.set(0, -0.0001, 0);

  axesHelper.position.set(0, 0, 0);
  axesHelper.scale.setScalar(Math.max(1.5, modelSize * 0.35));
}

/**
 * Вмикає або вимикає каркасний режим для всіх мешів моделі.
 */
/**
 * Перебудовує допоміжну сцену розгортки для активної моделі, якщо вона підтримується.
 */
function refreshUnfoldController() {
  disposeUnfoldController();

  if (!activeModelRoot || !activeAsset) {
    updateUnfoldUiState();
    return;
  }

  const unfoldType = getSupportedUnfoldType(activeAsset);
  if (!unfoldType) {
    unfoldState.enabled = false;
    unfoldState.isPlaying = false;
    unfoldModeToggle.checked = false;
    updateUnfoldUiState();
    return;
  }

  activeUnfoldController = buildUnfoldController(unfoldType, activeModelRoot);

  if (!activeUnfoldController) {
    updateUnfoldUiState();
    return;
  }

  activeUnfoldController.setProgress(unfoldState.progress);
  scene.add(activeUnfoldController.group);
  applyUnfoldRenderStyle();
  syncUnfoldVisibility();
  updateUnfoldUiState();
}

/**
 * Видаляє побудовану сцену розгортки та звільняє її ресурси.
 */
function disposeUnfoldController() {
  if (!activeUnfoldController) {
    return;
  }

  scene.remove(activeUnfoldController.group);
  activeUnfoldController.dispose();
  activeUnfoldController = null;
}

/**
 * Визначає, для яких навчальних фігур доступний режим розгортки.
 */
function getSupportedUnfoldType(asset) {
  const source = [
    asset?.title ?? "",
    asset?.filePath ?? "",
    asset?.file?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (source.includes("cube_slice") || source.includes("зріз")) {
    return null;
  }

  if (source.includes("cube.glb") || source.includes("куб")) {
    return "cube";
  }

  if (source.includes("piramide") || source.includes("пірамід") || source.includes("pyramid")) {
    return "square-pyramid";
  }

  return null;
}

/**
 * Синхронізує видимість звичайної моделі та її навчальної розгортки.
 */
function syncUnfoldVisibility() {
  const isUnfoldVisible = unfoldState.enabled && Boolean(activeUnfoldController);

  if (activeModelRoot) {
    activeModelRoot.visible = !isUnfoldVisible;
  }

  if (activeUnfoldController) {
    activeUnfoldController.group.visible = isUnfoldVisible;
  }
}

/**
 * Вмикає або вимикає режим розгортки для поточної підтримуваної фігури.
 */
function setUnfoldModeEnabled(isEnabled) {
  if (!isEnabled) {
    unfoldState.enabled = false;
    unfoldState.isPlaying = false;
    unfoldModeToggle.checked = false;
    syncUnfoldVisibility();
    frameCurrentModel({ preserveView: false });
    updateUnfoldUiState();
    return;
  }

  if (!activeModelRoot || !activeAsset) {
    unfoldModeToggle.checked = false;
    updateUnfoldUiState();
    return;
  }

  if (!activeUnfoldController) {
    refreshUnfoldController();
  }

  if (!activeUnfoldController) {
    unfoldModeToggle.checked = false;
    setStatus("Розгортка зараз доступна для куба і піраміди.");
    updateUnfoldUiState();
    return;
  }

  unfoldState.enabled = true;
  unfoldState.isPlaying = false;
  unfoldModeToggle.checked = true;
  applyUnfoldRenderStyle();
  syncUnfoldVisibility();
  frameCurrentModel({ preserveView: false });
  updateUnfoldUiState();
}

/**
 * Керує автоматичним розгортанням або згортанням навчальної фігури.
 */
function toggleUnfoldPlayback() {
  if (!unfoldState.enabled || !activeUnfoldController) {
    return;
  }

  if (unfoldState.isPlaying) {
    unfoldState.isPlaying = false;
    updateUnfoldUiState();
    return;
  }

  if (unfoldState.progress >= 0.999) {
    unfoldState.playbackDirection = -1;
    unfoldState.targetProgress = 0;
  } else {
    unfoldState.playbackDirection = 1;
    unfoldState.targetProgress = 1;
  }

  unfoldState.isPlaying = true;
  updateUnfoldUiState();
}

/**
 * Дає змогу вручну зупинити розгортку на будь-якому проміжному етапі.
 */
function onUnfoldProgressInput(event) {
  if (!activeUnfoldController) {
    return;
  }

  const nextProgress = Number(event.target.value) / 100;
  unfoldState.progress = nextProgress;
  unfoldState.targetProgress = nextProgress;
  unfoldState.isPlaying = false;
  activeUnfoldController.setProgress(nextProgress);
  updateUnfoldUiState();
}

/**
 * Плавно анімує перехід між складеною фігурою та її розгорткою.
 */
function updateUnfoldAnimation(deltaSeconds) {
  if (!unfoldState.enabled || !activeUnfoldController || !unfoldState.isPlaying) {
    return;
  }

  const step = Math.min(deltaSeconds * 0.7, 1);
  const direction = unfoldState.targetProgress >= unfoldState.progress ? 1 : -1;
  const nextProgress = unfoldState.progress + direction * step;
  const didReachTarget = direction > 0
    ? nextProgress >= unfoldState.targetProgress
    : nextProgress <= unfoldState.targetProgress;

  unfoldState.progress = didReachTarget
    ? unfoldState.targetProgress
    : nextProgress;

  activeUnfoldController.setProgress(unfoldState.progress);

  if (didReachTarget) {
    unfoldState.isPlaying = false;
  }

  updateUnfoldUiState();
}

/**
 * Підлаштовує вигляд граней розгортки під активні режими подачі.
 */
function applyUnfoldRenderStyle() {
  if (!activeUnfoldController) {
    return;
  }

  const showWireframe = wireframeToggle.checked && !mathModeToggle.checked;
  const isMathMode = mathModeToggle.checked;
  const baseColor = new THREE.Color(0xc58f66);

  activeUnfoldController.faces.forEach((face) => {
    face.material.color.copy(isMathMode ? mathStyle.faceColor : baseColor);
    face.material.transparent = true;
    face.material.opacity = showWireframe ? 0.98 : isMathMode ? mathStyle.faceOpacity : 0.92;
    face.material.wireframe = showWireframe;
    face.edgeLines.visible = !showWireframe;
    face.edgeMaterial.color.set(isMathMode ? mathStyle.visibleEdgeColor : 0x6c4021);
    face.edgeMaterial.opacity = isMathMode ? 0.98 : 0.84;
  });
}

/**
 * Синхронізує доступність кнопок і стан повзунка розгортки.
 */
function updateUnfoldUiState() {
  const isSupported = Boolean(activeUnfoldController);
  const canInteract = isSupported && unfoldState.enabled;

  unfoldModeToggle.disabled = !isSupported;
  unfoldModeToggle.checked = canInteract;
  unfoldPlayButton.disabled = !canInteract;
  unfoldProgressSlider.disabled = !canInteract;
  unfoldProgressSlider.value = `${Math.round(unfoldState.progress * 100)}`;

  if (!isSupported) {
    unfoldPlayButton.textContent = "Недоступно";
    return;
  }

  if (!unfoldState.enabled) {
    unfoldPlayButton.textContent = "Розгорнути";
    return;
  }

  if (unfoldState.isPlaying) {
    unfoldPlayButton.textContent = "Пауза";
    return;
  }

  unfoldPlayButton.textContent = unfoldState.progress >= 0.999
    ? "Згорнути"
    : "Розгорнути";
}

/**
 * Будує контролер розгортки для конкретного типу фігури.
 */
function buildUnfoldController(unfoldType, modelRoot) {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());

  if (unfoldType === "cube") {
    return buildCubeUnfoldController(size);
  }

  if (unfoldType === "square-pyramid") {
    return buildSquarePyramidUnfoldController(size);
  }

  return null;
}

/**
 * Створює розгортку куба у вигляді хреста на площині.
 */
function buildCubeUnfoldController(size) {
  const side = Math.max(size.x, size.y, size.z, 1);
  const group = new THREE.Group();
  group.name = "unfoldGroup";
  const faces = [];
  const createSquareFace = () => {
    const face = createUnfoldFace(new THREE.PlaneGeometry(side, side));
    faces.push(face);
    return face;
  };

  const baseFace = createSquareFace();
  baseFace.mesh.rotation.x = -Math.PI / 2;
  group.add(baseFace.mesh);

  const northPivot = new THREE.Group();
  northPivot.position.set(0, 0, -side / 2);
  group.add(northPivot);

  const northFace = createSquareFace();
  northFace.mesh.position.set(0, side / 2, 0);
  northPivot.add(northFace.mesh);

  const topPivot = new THREE.Group();
  topPivot.position.set(0, side / 2, 0);
  northFace.mesh.add(topPivot);

  const topFace = createSquareFace();
  topFace.mesh.position.set(0, side / 2, 0);
  topPivot.add(topFace.mesh);

  const southPivot = new THREE.Group();
  southPivot.position.set(0, 0, side / 2);
  group.add(southPivot);

  const southFace = createSquareFace();
  southFace.mesh.position.set(0, side / 2, 0);
  southFace.mesh.rotation.y = Math.PI;
  southPivot.add(southFace.mesh);

  const westPivot = new THREE.Group();
  westPivot.position.set(-side / 2, 0, 0);
  group.add(westPivot);

  const westFace = createSquareFace();
  westFace.mesh.position.set(0, side / 2, 0);
  westFace.mesh.rotation.y = -Math.PI / 2;
  westPivot.add(westFace.mesh);

  const eastPivot = new THREE.Group();
  eastPivot.position.set(side / 2, 0, 0);
  group.add(eastPivot);

  const eastFace = createSquareFace();
  eastFace.mesh.position.set(0, side / 2, 0);
  eastFace.mesh.rotation.y = Math.PI / 2;
  eastPivot.add(eastFace.mesh);

  const setProgress = (progress) => {
    northPivot.rotation.x = -Math.PI / 2 * progress;
    southPivot.rotation.x = Math.PI / 2 * progress;
    westPivot.rotation.z = Math.PI / 2 * progress;
    eastPivot.rotation.z = -Math.PI / 2 * progress;
    topPivot.rotation.x = Math.PI / 2 * (1 - progress);
    group.updateMatrixWorld(true);
  };

  setProgress(0);
  const foldedBounds = new THREE.Box3().setFromObject(group);
  setProgress(1);
  const flatBounds = new THREE.Box3().setFromObject(group);
  setProgress(unfoldState.progress);

  return {
    group,
    faces,
    maxBounds: foldedBounds.union(flatBounds),
    setProgress,
    dispose() {
      faces.forEach((face) => {
        face.edgeLines.geometry.dispose();
        face.edgeMaterial.dispose();
        face.mesh.geometry.dispose();
        face.material.dispose();
      });
    },
  };
}

/**
 * Створює розгортку квадратної піраміди: основа плюс чотири трикутні грані.
 */
function buildSquarePyramidUnfoldController(size) {
  const baseSide = Math.max(size.x, size.z, 1);
  const height = Math.max(size.y, baseSide * 0.6);
  const slantHeight = Math.hypot(baseSide / 2, height);
  const groundTransform = createFaceTransform(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, -1),
  );
  const faceDefinitions = [
    {
      geometry: new THREE.PlaneGeometry(baseSide, baseSide),
      folded: groundTransform,
      flat: groundTransform,
    },
    {
      geometry: createTriangleFaceGeometry(baseSide, slantHeight),
      folded: createFaceTransform(
        new THREE.Vector3(0, 0, baseSide / 2),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, height, -baseSide / 2),
      ),
      flat: createFaceTransform(
        new THREE.Vector3(0, 0, baseSide / 2),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
      ),
    },
    {
      geometry: createTriangleFaceGeometry(baseSide, slantHeight),
      folded: createFaceTransform(
        new THREE.Vector3(0, 0, -baseSide / 2),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, height, baseSide / 2),
      ),
      flat: createFaceTransform(
        new THREE.Vector3(0, 0, -baseSide / 2),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ),
    },
    {
      geometry: createTriangleFaceGeometry(baseSide, slantHeight),
      folded: createFaceTransform(
        new THREE.Vector3(-baseSide / 2, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(baseSide / 2, height, 0),
      ),
      flat: createFaceTransform(
        new THREE.Vector3(-baseSide / 2, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-1, 0, 0),
      ),
    },
    {
      geometry: createTriangleFaceGeometry(baseSide, slantHeight),
      folded: createFaceTransform(
        new THREE.Vector3(baseSide / 2, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(-baseSide / 2, height, 0),
      ),
      flat: createFaceTransform(
        new THREE.Vector3(baseSide / 2, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(1, 0, 0),
      ),
    },
  ];

  return createUnfoldControllerFromFaces(faceDefinitions);
}

/**
 * Створює універсальний контролер для набору граней із двома наборами трансформів.
 */
function createUnfoldControllerFromFaces(faceDefinitions) {
  const group = new THREE.Group();
  group.name = "unfoldGroup";
  const faces = faceDefinitions.map((definition) => {
    const face = createUnfoldFace(definition.geometry);
    face.folded = definition.folded;
    face.flat = definition.flat;
    group.add(face.mesh);
    return face;
  });

  const setProgress = (progress) => {
    faces.forEach((face) => {
      face.mesh.position.copy(face.folded.position).lerp(face.flat.position, progress);
      face.mesh.quaternion.copy(face.folded.quaternion).slerp(face.flat.quaternion, progress);
    });
    group.updateMatrixWorld(true);
  };

  setProgress(0);
  const foldedBounds = new THREE.Box3().setFromObject(group);
  setProgress(1);
  const flatBounds = new THREE.Box3().setFromObject(group);
  setProgress(unfoldState.progress);

  return {
    group,
    faces,
    maxBounds: foldedBounds.union(flatBounds),
    setProgress,
    dispose() {
      faces.forEach((face) => {
        face.edgeLines.geometry.dispose();
        face.edgeMaterial.dispose();
        face.mesh.geometry.dispose();
        face.material.dispose();
      });
    },
  };
}

/**
 * Створює одну грань розгортки з окремою заливкою та контурами.
 */
function createUnfoldFace(geometry) {
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    color: 0xc58f66,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x6c4021,
    transparent: true,
    opacity: 0.84,
  });
  const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
  edgeLines.renderOrder = 2;
  mesh.add(edgeLines);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    material,
    edgeLines,
    edgeMaterial,
  };
}

/**
 * Створює трикутну грань для піраміди з базовою лінією вздовж локальної осі X.
 */
function createTriangleFaceGeometry(baseWidth, height) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -baseWidth / 2, 0, 0,
        baseWidth / 2, 0, 0,
        0, height, 0,
      ],
      3,
    ),
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Будує позицію та орієнтацію грані за локальними напрямками її осей.
 */
function createFaceTransform(position, xDirection, yDirection) {
  const xAxis = xDirection.clone().normalize();
  const yAxis = yDirection
    .clone()
    .sub(xAxis.clone().multiplyScalar(yDirection.dot(xAxis)))
    .normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);

  return {
    position: position.clone(),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
  };
}

function applyWireframeMode(isWireframe) {
  if (!activeModelRoot) {
    return;
  }

  activeModelRoot.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (mathModeToggle.checked) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material.forEach((material) => {
        material.wireframe = isWireframe;
      });
      return;
    }

    node.material.wireframe = isWireframe;
  });
}

/**
 * Вмикає навчальний стиль подачі: заливка спереду та штрихові приховані ребра позаду.
 */
function applyMathStyleMode(isEnabled) {
  if (!activeModelRoot) {
    return;
  }

  activeModelRoot.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (isEnabled) {
      enableMathStyle(node);
      return;
    }

    disableMathStyle(node);
  });
}

/**
 * Синхронізує математичний режим і wireframe, щоб режими не конфліктували між собою.
 */
function syncRenderModeControls() {
  const shouldDisableWireframe = mathModeToggle.checked && wireframeToggle.checked;

  if (shouldDisableWireframe && activeModelRoot) {
    activeModelRoot.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      const originalMaterial = node.userData.originalMaterial;
      const materials = Array.isArray(originalMaterial)
        ? originalMaterial
        : [originalMaterial];

      materials.forEach((material) => {
        if (material) {
          material.wireframe = false;
        }
      });
    });
  }
}

/**
 * Замінює стандартний матеріал на навчальну заливку й додає ребра.
 */
function enableMathStyle(mesh) {
  const originalMaterial = mesh.userData.originalMaterial ?? mesh.material;

  if (!mesh.userData.mathMaterial) {
    mesh.userData.mathMaterial = createMathFaceMaterial(originalMaterial);
  }

  mesh.material = mesh.userData.mathMaterial;
  mesh.renderOrder = 1;
  ensureMathEdgeHelpers(mesh);
}

/**
 * Повертає оригінальні матеріали та прибирає допоміжні ребра математичного режиму.
 */
function disableMathStyle(mesh) {
  if (mesh.userData.originalMaterial) {
    mesh.material = mesh.userData.originalMaterial;
  }

  mesh.renderOrder = 0;

  if (mesh.userData.mathEdgeGroup) {
    mesh.userData.mathEdgeGroup.visible = false;
  }
}

/**
 * Створює пласку напівпрозору заливку для стилю, наближеного до підручників і GeoGebra.
 */
function createMathFaceMaterial(sourceMaterial) {
  const baseColor = Array.isArray(sourceMaterial)
    ? sourceMaterial[0]?.color
    : sourceMaterial?.color;

  return new THREE.MeshPhongMaterial({
    color: baseColor?.clone?.() ?? mathStyle.faceColor.clone(),
    transparent: true,
    opacity: mathStyle.faceOpacity,
    shininess: 10,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * Додає два шари ребер: видимі суцільні та приховані штрихові.
 */
function ensureMathEdgeHelpers(mesh) {
  if (mesh.userData.mathEdgeGroup) {
    mesh.userData.mathEdgeGroup.visible = true;
    return;
  }

  const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 1);
  const visibleEdges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: mathStyle.visibleEdgeColor,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    }),
  );
  visibleEdges.renderOrder = 3;

  const hiddenEdges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineDashedMaterial({
      color: mathStyle.hiddenEdgeColor,
      transparent: true,
      opacity: mathStyle.hiddenOpacity,
      dashSize: mathStyle.dashSize,
      gapSize: mathStyle.gapSize,
      depthWrite: false,
    }),
  );
  hiddenEdges.computeLineDistances();
  hiddenEdges.material.depthFunc = THREE.GreaterDepth;
  hiddenEdges.renderOrder = 2;

  const edgeGroup = new THREE.Group();
  edgeGroup.name = "mathEdgeGroup";
  edgeGroup.add(hiddenEdges, visibleEdges);

  mesh.add(edgeGroup);
  mesh.userData.mathEdgeGroup = edgeGroup;
}

/**
 * Підраховує базову геометричну статистику моделі для навчального UI.
 */
function collectModelStats(modelRoot) {
  let vertices = 0;
  let triangles = 0;

  modelRoot.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    const positionAttribute = node.geometry.getAttribute("position");
    vertices += positionAttribute ? positionAttribute.count : 0;

    if (node.geometry.index) {
      triangles += node.geometry.index.count / 3;
    } else if (positionAttribute) {
      triangles += positionAttribute.count / 3;
    }
  });

  return { vertices, triangles };
}

/**
 * Оновлює блок статистики без зайвого дублювання DOM-коду.
 */
function updateStats({ status, name, size, vertices, polygons }) {
  const values = [status, name, size, vertices, polygons];
  modelStats.querySelectorAll("dd").forEach((element, index) => {
    element.textContent = values[index];
  });
}

/**
 * Показує короткий стан програми у верхній панелі.
 */
function setStatus(message) {
  statusText.textContent = message;
}

/**
 * Ховає підказку на сцені та запам'ятовує вибір користувача в localStorage.
 */
function hideSceneHint() {
  sceneHint.classList.add("is-hidden");
  window.localStorage.setItem(HINT_STORAGE_KEY, "true");
}

/**
 * Відновлює стан підказки між перезавантаженнями сторінки.
 */
function restoreSceneHintState() {
  const isHidden = window.localStorage.getItem(HINT_STORAGE_KEY) === "true";

  if (isHidden) {
    sceneHint.classList.add("is-hidden");
    return;
  }

  sceneHint.classList.remove("is-hidden");
}

/**
 * Форматує розмір файлу в зручний для інтерфейсу вигляд.
 */
function formatFileSize(byteCount) {
  if (!Number.isFinite(byteCount) || byteCount <= 0) {
    return "0 KB";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(byteCount) / Math.log(1024)), units.length - 1);
  const value = byteCount / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

/**
 * Перевіряє, чи є файл або шлях GLB-моделлю.
 */
function isGlbFile(fileName) {
  return typeof fileName === "string" && fileName.toLowerCase().endsWith(".glb");
}

/**
 * Формує стабільний ключ локального файлу, щоб не дублювати його в сесійній бібліотеці.
 */
function createSessionFileKey(file) {
  return [file.name, file.size, file.lastModified].join("__");
}

/**
 * Коректно звільняє ресурси попередньої моделі, щоб не накопичувати пам'ять.
 */
function disposeActiveModel() {
  disposeUnfoldController();

  if (!activeModelRoot) {
    return;
  }

  scene.remove(activeModelRoot);
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();

  activeModelRoot.traverse((node) => {
    if (node.geometry && !disposedGeometries.has(node.geometry)) {
      disposedGeometries.add(node.geometry);
      node.geometry.dispose();
    }

    const candidateMaterials = [];

    if (node.material) {
      candidateMaterials.push(...(Array.isArray(node.material) ? node.material : [node.material]));
    }

    if (node.userData.originalMaterial) {
      candidateMaterials.push(
        ...(Array.isArray(node.userData.originalMaterial)
          ? node.userData.originalMaterial
          : [node.userData.originalMaterial]),
      );
    }

    if (node.userData.mathMaterial) {
      candidateMaterials.push(node.userData.mathMaterial);
    }

    candidateMaterials.forEach((material) => {
      if (!material || disposedMaterials.has(material)) {
        return;
      }

      disposedMaterials.add(material);
      disposeMaterial(material);
    });
  });

  activeModelRoot = null;
  updateUnfoldUiState();
}

/**
 * Звільняє геометрії та матеріали тимчасового дерева об'єктів.
 */
function disposeThreeObject(root) {
  root.traverse((node) => {
    node.geometry?.dispose?.();

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (material) {
        disposeMaterial(material);
      }
    });
  });
}

/**
 * Звільняє текстури та матеріали конкретного меша.
 */
function disposeMaterial(material) {
  if (!material) {
    return;
  }

  Object.values(material).forEach((value) => {
    if (value && typeof value === "object" && "isTexture" in value) {
      value.dispose();
    }
  });
  material.dispose();
}

/**
 * Підлаштовує renderer та камеру під реальні розміри контейнера.
 */
function resizeRenderer() {
  syncMobileViewportHeight();

  const wrapper = dropZone;
  const bounds = wrapper.getBoundingClientRect();
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);

  if (!width || !height) {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  const gizmoBounds = viewGizmo.getBoundingClientRect();
  const canvasBounds = renderer.domElement.getBoundingClientRect();
  gizmoViewport.width = Math.round(gizmoBounds.width);
  gizmoViewport.height = Math.round(gizmoBounds.height);
  gizmoViewport.x = Math.round(gizmoBounds.left - canvasBounds.left);
  gizmoViewport.y = Math.round(canvasBounds.bottom - gizmoBounds.bottom);
  gizmoCamera.aspect = gizmoViewport.width / gizmoViewport.height;
  gizmoCamera.updateProjectionMatrix();
}

/**
 * На телефоні підлаштовує висоту canvas під реальну видиму частину екрана після всіх панелей.
 */
function syncMobileViewportHeight() {
  const isMobileViewport = window.matchMedia("(max-width: 720px)").matches;
  const isViewerMode = appShell.classList.contains("app-mode-viewer");

  if (!isMobileViewport || !isViewerMode) {
    dropZone.style.height = "";
    viewerPanel.style.minHeight = "";
    return;
  }

  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const panelBounds = viewerPanel.getBoundingClientRect();
  const wrapperBounds = dropZone.getBoundingClientRect();
  const bottomInset = 12;
  const availableHeight = Math.max(
    280,
    Math.floor(viewportHeight - wrapperBounds.top - bottomInset),
  );
  const panelHeight = Math.max(
    Math.floor(viewportHeight - panelBounds.top - bottomInset),
    availableHeight,
  );

  viewerPanel.style.minHeight = `${panelHeight}px`;
  dropZone.style.height = `${availableHeight}px`;
}

/**
 * Повторно синхронізує layout viewer після зміни режиму, що особливо важливо на мобільних браузерах.
 */
function syncViewerLayout(options = {}) {
  const { reframeModel = false, preserveView = false } = options;

  resizeRenderer();

  requestAnimationFrame(() => {
    resizeRenderer();

    if (reframeModel && activeModelRoot) {
      frameCurrentModel({ preserveView });
    }
  });

  window.setTimeout(() => {
    resizeRenderer();

    if (reframeModel && activeModelRoot) {
      frameCurrentModel({ preserveView });
    }
  }, 140);
}

/**
 * Єдина точка обробки помилки імпорту, щоб користувач бачив причину в UI.
 */
function handleLoadError(file, error) {
  console.error(error);

  const rawMessage =
    error instanceof Error ? error.message : "Невідома помилка під час імпорту.";
  const safeMessage = rawMessage || "Невідома помилка під час імпорту.";
  const assetName = file.title ?? file.name ?? "Невідома модель";
  const assetSize =
    file.sizeLabel ??
    (typeof file.size === "number" ? formatFileSize(file.size) : "-");

  setStatus(`Не вдалося завантажити модель: ${safeMessage}`);
  updateStats({
    status: "Помилка завантаження",
    name: assetName,
    size: assetSize,
    vertices: "-",
    polygons: "-",
  });
}

/**
 * Готує координати вказівника; за потреби тут легко додати інструмент вимірювань.
 */
function onPointerMove(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

/**
 * Постійно оновлює контролер і рендерить сцену.
 */
function animate() {
  requestAnimationFrame(animate);
  const deltaSeconds = animationClock.getDelta();
  updateUnfoldAnimation(deltaSeconds);
  controls.update();
  gizmoRoot.quaternion.copy(camera.quaternion).invert();
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.render(scene, camera);
  renderViewGizmo();
}

/**
 * Дорендерює mini-gizmo поверх головної сцени у куті viewport.
 */
function renderViewGizmo() {
  if (!gizmoViewport.width || !gizmoViewport.height) {
    return;
  }

  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setViewport(
    gizmoViewport.x,
    gizmoViewport.y,
    gizmoViewport.width,
    gizmoViewport.height,
  );
  renderer.setScissor(
    gizmoViewport.x,
    gizmoViewport.y,
    gizmoViewport.width,
    gizmoViewport.height,
  );
  renderer.render(gizmoScene, gizmoCamera);
  renderer.setScissorTest(false);
}
