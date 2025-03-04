import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

let scene, camera, renderer, clock;
let island,
	palm,
	shells = [];
let ocean;
let controls;
const ISLAND_RADIUS = 5;
const OCEAN_SIZE = 30;
const SHELL_COUNT = 10;
let score = 0;
let raycaster, mouse;
let character;
let skybox;
let round = 1;

// Добавим глобальные переменные для анимации рук
let leftArm, rightArm;
let isVictoryAnimation = false;

// Добавляем глобальные переменные для анимации камеры
let isCameraMoving = false;
let cameraTarget = new THREE.Vector3();
let originalCameraPosition = new THREE.Vector3();
let cameraAnimationStartTime = 0;
const CAMERA_ANIMATION_DURATION = 1.0; // Длительность анимации камеры в секундах

init();
animate();

function init() {
	// Базовая настройка
	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(
		75,
		window.innerWidth / window.innerHeight,
		0.1,
		1000 // Увеличим до 1000, чтобы видеть дальние объекты
	);
	camera.position.set(0, 8, 12);
	camera.lookAt(0, 0, 0);

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	document.body.appendChild(renderer.domElement);

	clock = new THREE.Clock();

	// Инициализация raycaster и mouse
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();

	// Освещение
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
	scene.add(ambientLight);

	const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
	directionalLight.position.set(10, 20, 10);
	directionalLight.castShadow = true;
	scene.add(directionalLight);

	// Создаем море
	createOcean();

	// Создаем остров
	const islandGeometry = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 1.2, 1, 64, 32);
	const islandMaterial = new THREE.ShaderMaterial({
		uniforms: {
			sandColor: { value: new THREE.Color(0xf7e39c) },
			grassColor: { value: new THREE.Color(0x90af50) },
			time: { value: 0 }
		},
		vertexShader: `
			varying vec2 vUv;
			varying float vElevation;
			
			// Шум Перлина (упрощенная версия)
			float noise(vec2 p) {
				vec2 ip = floor(p);
				vec2 u = fract(p);
				u = u * u * (3.0 - 2.0 * u);
				
				float res = mix(
					mix(dot(vec2(0.5), ip),
						dot(vec2(0.6), ip + vec2(1.0, 0.0)),
						u.x),
					mix(dot(vec2(0.4), ip + vec2(0.0, 1.0)),
						dot(vec2(0.5), ip + vec2(1.0, 1.0)),
						u.x),
					u.y);
				return res * res;
			}
			
			void main() {
				vUv = uv;
				
				// Создаем холмистый рельеф
				float elevation = 0.0;
				vec2 pos = position.xz * 1.5;
				
				// Слои шума разной частоты
				elevation += noise(pos) * 0.5;
				elevation += noise(pos * 2.0) * 0.25;
				elevation += noise(pos * 4.0) * 0.125;
				
				// Сглаживаем края острова
				float distanceFromCenter = length(position.xz) / ${ISLAND_RADIUS.toFixed(1)};
				float edgeWeight = 1.0 - smoothstep(0.7, 1.0, distanceFromCenter);
				elevation *= edgeWeight;
				
				// Применяем высоту
				vec3 newPosition = position;
				newPosition.y += elevation * 0.8;
				
				vElevation = elevation;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 sandColor;
			uniform vec3 grassColor;
			varying float vElevation;
			varying vec2 vUv;
			
			void main() {
				// Смешиваем цвета песка и травы в зависимости от высоты
				float grassWeight = smoothstep(0.1, 0.4, vElevation);
				vec3 color = mix(sandColor, grassColor, grassWeight);
				
				// Добавляем вариации цвета
				float noise = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
				color += noise * 0.02;
				
				gl_FragColor = vec4(color, 1.0);
			}
		`
	});

	island = new THREE.Mesh(islandGeometry, islandMaterial);
	island.receiveShadow = true;
	scene.add(island);

	// Создаем пальму
	createPalm();

	// Создаем ракушки
	createShells();

	// Добавляем счет
	createScoreDisplay();

	// Создаем персонажа
	createCharacter();

	// Управление
	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.dampingFactor = 0.05;
	controls.maxPolarAngle = Math.PI / 3;
	controls.minPolarAngle = Math.PI / 6;
	controls.enableZoom = true;
	controls.minDistance = 8;
	controls.maxDistance = 20;
	controls.enablePan = false;
	controls.rotateSpeed = 0.5;
	controls.zoomSpeed = 0.7;

	// Добавляем обработчик клика
	renderer.domElement.addEventListener('click', onMouseClick);
	window.addEventListener('resize', onWindowResize);

	// Добавляем голубое небо
	createSky();
}

function createSky() {
	// Устанавливаем градиентный фон
	const topColor = new THREE.Color(0x0077ff); // Голубой цвет неба сверху
	const bottomColor = new THREE.Color(0x87ceeb); // Более светлый голубой снизу

	scene.background = new THREE.Color(bottomColor);

	// Добавляем легкую дымку
	scene.fog = new THREE.Fog(bottomColor, 30, 90);
}

function createOcean() {
	const oceanGeometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, 50, 50);
	const oceanMaterial = new THREE.ShaderMaterial({
		uniforms: {
			time: { value: 0 },
			color1: { value: new THREE.Color(0x40e0d0) }, // Бирюзовый
			color2: { value: new THREE.Color(0x20b2aa) } // Темно-бирюзовый
		},
		vertexShader: `
			uniform float time;
			varying vec2 vUv;
			varying float vElevation;

			void main() {
				vUv = uv;
				vec3 pos = position;
				
				float elevation = sin(pos.x * 3.0 + time) * 0.2 
							   + sin(pos.y * 2.0 + time * 0.8) * 0.2;
				pos.z += elevation;
				vElevation = elevation;

				gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 color1;
			uniform vec3 color2;
			varying float vElevation;
			
			void main() {
				vec3 color = mix(color1, color2, vElevation * 2.0 + 0.5);
				gl_FragColor = vec4(color, 0.9); // Немного увеличил прозрачность
			}
		`,
		transparent: true
	});

	ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
	ocean.rotation.x = -Math.PI / 2;
	ocean.position.y = -0.2;
	scene.add(ocean);
}

function createPalm() {
	// Ствол с изгибом
	const points = [];
	for (let i = 0; i <= 10; i++) {
		const t = i / 10;
		points.push(
			new THREE.Vector3(
				Math.sin(t * 0.5) * 0.4, // увеличили изгиб
				t * 5, // увеличили высоту с 3 до 5
				Math.cos(t * 0.3) * 0.3 // увеличили изгиб
			)
		);
	}
	const trunkGeometry = new THREE.TubeGeometry(
		new THREE.CatmullRomCurve3(points),
		20,
		0.2, // увеличили радиус ствола с 0.15 до 0.2
		8,
		false
	);

	// Материал ствола с текстурой
	const trunkMaterial = new THREE.MeshPhongMaterial({
		color: 0x8b4513,
		shininess: 5,
		bumpScale: 0.1
	});

	const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
	trunk.castShadow = true;
	scene.add(trunk);

	// Создаем листья пальмы
	const leafCount = 12;
	const leafSegments = 20;

	for (let i = 0; i < leafCount; i++) {
		const leafPoints = [];
		const length = 2 + Math.random() * 0.5; // Разная длина листьев

		// Создаем изогнутую форму листа
		for (let j = 0; j <= leafSegments; j++) {
			const t = j / leafSegments;
			const bend = Math.sin(t * Math.PI) * 0.5; // изгиб листа
			leafPoints.push(new THREE.Vector3(t * length, Math.sin(t * Math.PI) * 0.2 + bend, 0));
		}

		// Создаем геометрию листа
		const leafShape = new THREE.Shape();
		leafShape.moveTo(0, 0);
		leafShape.lineTo(0, 0.1);
		for (let j = 1; j <= 10; j++) {
			const t = j / 10;
			const width = Math.sin(t * Math.PI) * 0.15; // Форма листа
			leafShape.lineTo(t * length, width);
		}
		for (let j = 10; j >= 0; j--) {
			const t = j / 10;
			const width = Math.sin(t * Math.PI) * -0.15; // Обратная сторона листа
			leafShape.lineTo(t * length, width);
		}
		leafShape.lineTo(0, -0.1);

		const leafGeometry = new THREE.ExtrudeGeometry(leafShape, {
			steps: 1,
			depth: 0.02,
			bevelEnabled: false
		});

		// Материал листьев с градиентом цвета
		const leafMaterial = new THREE.MeshPhongMaterial({
			color: new THREE.Color(0x2d5a27).lerp(new THREE.Color(0x4a9c2d), Math.random() * 0.3),
			shininess: 10,
			side: THREE.DoubleSide
		});

		const leaf = new THREE.Mesh(leafGeometry, leafMaterial);

		// Позиционируем и поворачиваем лист
		leaf.position.set(0, 4.8, 0); // подняли листья с 2.8 до 4.8
		leaf.rotation.z = -Math.PI / 4; // Наклон вниз
		leaf.rotation.y = (i * Math.PI * 2) / leafCount + Math.random() * 0.5; // Распределение по кругу
		leaf.rotation.x = Math.random() * 0.2 - 0.1; // Случайный наклон

		leaf.castShadow = true;
		scene.add(leaf);
	}

	// Добавляем кокосы
	const coconutCount = 3 + Math.floor(Math.random() * 3);
	for (let i = 0; i < coconutCount; i++) {
		const coconutGeometry = new THREE.SphereGeometry(0.15, 12, 12);
		const coconutMaterial = new THREE.MeshPhongMaterial({
			color: 0x4a3728,
			shininess: 20
		});

		const coconut = new THREE.Mesh(coconutGeometry, coconutMaterial);
		const angle = (i * Math.PI * 2) / coconutCount;
		coconut.position.set(
			Math.sin(angle) * 0.3,
			4.7, // подняли кокосы с 2.7 до 4.7
			Math.cos(angle) * 0.3
		);
		coconut.castShadow = true;
		scene.add(coconut);
	}
}

function createShells(isReset = false) {
	// Создаем разные типы ракушек
	const shellTypes = [
		{
			geometry: new THREE.ConeGeometry(0.2, 0.4, 8),
			material: new THREE.MeshPhongMaterial({ color: 0xffa07a }),
			rotation: Math.PI / 2,
			scale: 1
		},
		{
			geometry: new THREE.TorusGeometry(0.15, 0.08, 16, 32),
			material: new THREE.MeshPhongMaterial({ color: 0xffb6c1 }),
			rotation: Math.PI / 3,
			scale: 1.2
		},
		{
			geometry: new THREE.SphereGeometry(0.2, 8, 8, 0, Math.PI),
			material: new THREE.MeshPhongMaterial({
				color: 0xe6d5ac,
				shininess: 100
			}),
			rotation: -Math.PI / 4,
			scale: 1.1
		},
		{
			geometry: new THREE.DodecahedronGeometry(0.15),
			material: new THREE.MeshPhongMaterial({
				color: 0xf0e68c,
				shininess: 80
			}),
			rotation: 0,
			scale: 1.3
		}
	];

	for (let i = 0; i < SHELL_COUNT; i++) {
		const shellType = shellTypes[Math.floor(Math.random() * shellTypes.length)];
		const shell = new THREE.Mesh(shellType.geometry, shellType.material.clone());

		const angle = Math.random() * Math.PI * 2;
		const radius = Math.random() * (ISLAND_RADIUS - 1);
		shell.position.x = Math.cos(angle) * radius;
		shell.position.z = Math.sin(angle) * radius;

		// Всегда устанавливаем targetY
		shell.targetY = 0.5;

		if (isReset) {
			shell.position.y = 20 + Math.random() * 5; // Случайная высота над островом
			shell.velocity = 0;
		} else {
			shell.position.y = shell.targetY; // Сразу ставим на конечную высоту
		}

		// Применяем базовый поворот для типа ракушки
		shell.rotation.x = shellType.rotation;

		// Добавляем случайный поворот для разнообразия
		shell.rotation.y = Math.random() * Math.PI * 2;
		shell.rotation.z = (Math.random() * Math.PI) / 4;

		// Случайный размер в пределах 20% от базового
		const randomScale = shellType.scale * (0.8 + Math.random() * 0.4);
		shell.scale.set(randomScale, randomScale, randomScale);

		shell.castShadow = true;
		shells.push(shell);
		scene.add(shell);
	}
}

function createScoreDisplay() {
	const scoreDiv = document.createElement('div');
	scoreDiv.id = 'score';
	scoreDiv.style.position = 'absolute';
	scoreDiv.style.top = '20px';
	scoreDiv.style.left = '20px';
	scoreDiv.style.color = 'white';
	scoreDiv.style.fontSize = '24px';
	scoreDiv.style.fontFamily = 'Arial';
	document.body.appendChild(scoreDiv); // Сначала добавляем элемент в DOM
	updateScore(); // Затем обновляем счет
}

function updateScore() {
	const scoreDiv = document.getElementById('score');
	scoreDiv.textContent = `Раунд ${round} | Ракушек собрано: ${score}/${SHELL_COUNT}`;
}

function onMouseClick(event) {
	// Преобразуем координаты клика в координаты NDC
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

	// Обновляем raycaster
	raycaster.setFromCamera(mouse, camera);

	// Проверяем пересечения с ракушками
	const intersects = raycaster.intersectObjects(shells);

	if (intersects.length > 0) {
		const shell = intersects[0].object;
		if (shell.visible && shell.position.y === shell.targetY) {
			shell.visible = false;
			score++;
			updateScore();

			if (score === SHELL_COUNT) {
				round++;
				score = 0;

				// Сохраняем текущую позицию камеры
				originalCameraPosition.copy(camera.position);

				// Вычисляем новую позицию камеры
				const characterPosition = character.position.clone();
				cameraTarget.set(
					characterPosition.x - 6 * Math.cos(character.rotation.y),
					8,
					characterPosition.z - 6 * Math.sin(character.rotation.y)
				);

				// Запускаем анимацию камеры
				isCameraMoving = true;
				cameraAnimationStartTime = clock.getElapsedTime();
				controls.enabled = false; // Отключаем управление на время анимации

				// Запускаем анимацию победы
				isVictoryAnimation = true;

				// После завершения анимации возвращаем камеру и создаем новые ракушки
				setTimeout(() => {
					// Возвращаем камеру в исходное положение
					isCameraMoving = true;
					cameraAnimationStartTime = clock.getElapsedTime();
					cameraTarget.copy(originalCameraPosition);

					setTimeout(() => {
						isVictoryAnimation = false;
						isCameraMoving = false;
						controls.enabled = true;
						resetShells();
						updateScore();
					}, CAMERA_ANIMATION_DURATION * 1000);
				}, 2000);
			}
		}
	}
}

function animate() {
	requestAnimationFrame(animate);

	const time = clock.getElapsedTime();

	// Анимация перемещения камеры
	if (isCameraMoving) {
		const progress = Math.min((time - cameraAnimationStartTime) / CAMERA_ANIMATION_DURATION, 1.0);

		// Используем функцию плавности для более естественного движения
		const smoothProgress = 1 - Math.pow(1 - progress, 3);

		camera.position.lerpVectors(originalCameraPosition, cameraTarget, smoothProgress);

		// Плавно поворачиваем камеру к персонажу
		camera.lookAt(character.position);
	}

	if (!isCameraMoving) {
		controls.update();
	}

	// Анимация волн
	if (ocean) {
		ocean.material.uniforms.time.value = time;
	}
	if (island && island.material.uniforms) {
		island.material.uniforms.time.value = time;
	}

	// Анимация падения ракушек
	shells.forEach((shell) => {
		if (shell.position.y > shell.targetY) {
			shell.velocity += 0.01; // Гравитация
			shell.position.y -= shell.velocity;

			// Проверка приземления
			if (shell.position.y <= shell.targetY) {
				shell.position.y = shell.targetY;
				shell.velocity = 0;
			}
		}
	});

	// Обновляем позицию неба относительно камеры
	if (skybox) {
		skybox.position.copy(camera.position);
	}

	renderer.render(scene, camera);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

function createCharacter() {
	// Группа для всего персонажа
	character = new THREE.Group();

	// Материалы
	const skinMaterial = new THREE.MeshPhongMaterial({ color: 0xffcc99 });
	const shirtMaterial = new THREE.MeshPhongMaterial({ color: 0x3366ff });
	const pantsMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });

	// Тело
	const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), shirtMaterial);
	torso.position.y = 1.4;
	character.add(torso);

	// Голова
	const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMaterial);
	head.position.y = 2.25;
	character.add(head);

	// Ноги
	const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), pantsMaterial);
	leftLeg.position.set(-0.2, 0.4, 0);
	character.add(leftLeg);

	const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), pantsMaterial);
	rightLeg.position.set(0.2, 0.4, 0);
	character.add(rightLeg);

	// Руки
	leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), skinMaterial);
	leftArm.position.set(-0.525, 1.6, 0);
	character.add(leftArm);

	rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), skinMaterial);
	rightArm.position.set(0.525, 1.6, 0);
	character.add(rightArm);

	// Позиционируем персонажа на краю острова
	character.position.set(ISLAND_RADIUS * 0.8, 0, 0);
	character.rotation.y = -Math.PI / 2; // Поворачиваем лицом к центру острова

	// Добавляем тени
	character.traverse((object) => {
		if (object instanceof THREE.Mesh) {
			object.castShadow = true;
			object.receiveShadow = true;
		}
	});

	scene.add(character);

	// Анимация покачивания
	function animateCharacter() {
		const time = clock.getElapsedTime();

		if (isVictoryAnimation) {
			// Анимация победы (поднятие рук)
			const progress = (time % 3) / 3; // 3 секунды на полную анимацию

			if (progress < 0.3) {
				// Поднятие рук (0.9 секунды)
				const t = progress / 0.3;
				leftArm.rotation.z = t * Math.PI * 0.8;
				rightArm.rotation.z = -t * Math.PI * 0.8;
			} else if (progress > 0.7) {
				// Опускание рук (0.9 секунды)
				const t = (progress - 0.7) / 0.3;
				leftArm.rotation.z = Math.PI * 0.8 * (1 - t);
				rightArm.rotation.z = -Math.PI * 0.8 * (1 - t);
			}
		} else {
			// Обычная анимация покачивания
			character.position.y = Math.sin(time * 1.5) * 0.1;
			leftArm.rotation.x = Math.sin(time * 1.5) * 0.1;
			rightArm.rotation.x = -Math.sin(time * 1.5) * 0.1;
		}

		requestAnimationFrame(animateCharacter);
	}
	animateCharacter();
}

function resetShells() {
	// Удаляем старые ракушки
	shells.forEach((shell) => {
		scene.remove(shell);
	});
	shells = [];

	// Создаем новые ракушки над островом
	createShells(true);
}
