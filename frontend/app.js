const PI = Math.PI;
const EARTH_TEXTURE_PATH = 'textures/earth_2_0_W400_H119.txt'; // Путь к текстуре Земли

class Texture {
    constructor(day, palette = null) {
        this.day = day;
    }

    getSize() {
        return [this.day[0].length - 1, this.day.length - 1];
    }
}

class Canvas {
    constructor(x, y) {
        this.size = [x, y];
        this.matrix = Array.from({ length: y }, () => Array(x).fill({ char: ' ', color: null }));
    }

    clear() {
        this.matrix = this.matrix.map(row => row.map(() => ({ char: ' ', color: null })));
    }

    drawPoint(a, b, c, color = null) {
        if (a >= this.size[0] || b >= this.size[1] || a < 0 || b < 0) return;
        this.matrix[b][a] = { char: c, color: color };
    }

    render() {
        const isDesktop = window.innerWidth >= 769;
        const html = this.matrix.map(row => {
            return row.map(cell => {
                if (cell.color === 'red' && isDesktop) {
                    return `<span class="red-point">${cell.char}</span>`;
                } else {
                    return cell.char;
                }
            }).join('');
        }).join('<br/>');
        document.getElementById('globeDisplay').innerHTML = html;
    }

    renderOverlay(overlayMatrix) {
        for (let y = 0; y < this.size[1]; y++) {
            for (let x = 0; x < this.size[0]; x++) {
                const overlay = overlayMatrix[y][x];
                if (overlay.char !== ' ') {
                    this.matrix[y][x] = { char: overlay.char, color: overlay.color };
                }
            }
        }
    }
}

class Globe {
    constructor(camera, radius, texture, initialRotation, targetCoordsArray) {
        this.camera = camera;
        this.radius = radius;
        this.texture = texture;
        this.rotation = initialRotation;
        this.targetCoordsArray = targetCoordsArray; // Массив координат { latitude, longitude }
    }

    renderOn(canvas) {
        const light = [0.0, 999999.0, 0.0];
        const [sizeX, sizeY] = canvas.size;

        // Конвертация координат цели в радианы для точек и сегментов
        const targetPoints = this.targetCoordsArray.map(coord => ({
            theta: (coord.longitude + 180) * (PI / 180),
            phi: (90 - coord.latitude) * (PI / 180)
        }));

        const lineSegments = this.getLineSegments(targetPoints);

        const overlayMatrix = Array.from({ length: sizeY }, () => Array(sizeX).fill({ char: ' ', color: null }));

        for (let yi = 0; yi < sizeY; yi++) {
            for (let xi = 0; xi < sizeX; xi++) {
                const o = [this.camera.x, this.camera.y, this.camera.z];
                let u = [
                    -(xi - sizeX / 2 + 0.5) / (sizeX / 2),
                    (yi - sizeY / 2 + 0.5) / (sizeY / 2),
                    -1.0
                ];

                normalize(u);
                const dotUO = dot(u, o);
                const discriminant = dotUO ** 2 - dot(o, o) + this.radius ** 2;
                if (discriminant < 0) continue;

                const distance = -Math.sqrt(discriminant) - dotUO;
                const inter = o.map((_, i) => o[i] + distance * u[i]);

                let n = inter.slice();
                normalize(n);

                const l = [];
                vector(l, inter, light);
                normalize(l);
                clamp(5 * dot(n, l) + 0.5, 0, 1);
                const rotated = applyQuaternion(inter, this.rotation);

                let phi = -rotated[2] / this.radius / 2 + 0.5;
                const minCompressionZone = 0.85;
                if (phi > minCompressionZone) {
                    phi = minCompressionZone + (phi - minCompressionZone) * 0.94;
                }

                let theta = Math.atan2(rotated[1], rotated[0]) / PI + 0.5;
                theta -= Math.floor(theta);

                const [texX, texY] = this.texture.getSize();
                const earthX = Math.floor(theta * texX);
                const earthY = Math.floor(phi * texY);

                if (earthX < texX && earthY < texY && earthX >= 0 && earthY >= 0) {
                    const pixel = this.texture.day[earthY][earthX];
                    canvas.drawPoint(xi, yi, pixel);
                }

                const isTargetPoint = targetPoints.some(point =>
                    Math.abs(theta - point.theta / (2 * PI)) < 0.005 &&
                    Math.abs(phi - point.phi / PI) < 0.005
                );

                const isLinePoint = lineSegments.some(line =>
                    Math.abs(theta - line.theta / (2 * PI)) < 0.005 &&
                    Math.abs(phi - line.phi / PI) < 0.005
                );

                if (isTargetPoint) {
                    overlayMatrix[yi][xi] = { char: '●', color: 'red' };
                } else if (isLinePoint) {
                    overlayMatrix[yi][xi] = { char: '.', color: 'red' };
                }
            }
        }

        canvas.renderOverlay(overlayMatrix);
    }

    setRotation(deltaX, deltaY) {
        const xAxis = [1, 0, 0];
        const yAxis = [0, 1, 0];
        const qx = quaternionFromAxisAngle(xAxis, deltaY * 0.01);
        const qy = quaternionFromAxisAngle(yAxis, deltaX * 0.01);
        this.rotation = quaternionMultiply(this.rotation, quaternionMultiply(qy, qx));
    }

    setZoom(distance) {
        this.camera.z = clamp(distance, 30, 100);
    }

    applyAutoRotation(speed) {
        const yAxis = [0, 1, 0];
        const rotationIncrement = quaternionFromAxisAngle(yAxis, speed);
        this.rotation = quaternionMultiply(this.rotation, rotationIncrement);
    }

    getLineSegments(targetPoints) {
        const segments = [];
        for (let i = 0; i < targetPoints.length - 1; i++) {
            const start = targetPoints[i];
            const end = targetPoints[i + 1];
            const linePoints = interpolatePoints(start, end);
            segments.push(...linePoints);
        }
        return segments;
    }
}

function interpolatePoints(start, end, numPoints = 100) {
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
        const theta = start.theta + (end.theta - start.theta) * (i / numPoints);
        const phi = start.phi + (end.phi - start.phi) * (i / numPoints);
        points.push({ theta, phi });
    }
    return points;
}

function quaternionFromAxisAngle(axis, angle) {
    const halfAngle = angle / 2;
    const s = Math.sin(halfAngle);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(halfAngle)];
}

function quaternionMultiply(q1, q2) {
    const [x1, y1, z1, w1] = q1;
    const [x2, y2, z2, w2] = q2;
    return [
        w1*x2 + x1*w2 + y1*z2 - z1*y2,
        w1*y2 - x1*z2 + y1*w2 + z1*x2,
        w1*z2 + x1*y2 - y1*x2 + z1*w2,
        w1*w2 - x1*x2 - y1*y2 - z1*z2,
    ];
}

function applyQuaternion(v, q) {
    const [x, y, z] = v;
    const [qx, qy, qz, qw] = q;

    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;

    return [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx
    ];
}

function normalize(v) {
    const len = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
    if (len === 0) return;
    for (let i = 0; i < v.length; i++) {
        v[i] /= len;
    }
}

function vector(result, from, to) {
    for (let i = 0; i < from.length; i++) {
        result[i] = to[i] - from[i];
    }
}

function dot(a, b) {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

class GlobeConfig {
    constructor() {
        this.camera_cfg = { x: 0, y: 0, z: 50 };
        this.radius = 30;
        this.texture = null;
    }

    withCamera(config) {
        this.camera_cfg = config;
        return this;
    }

    withRadius(r) {
        this.radius = r;
        return this;
    }

    withTexture(texture, palette = null) {
        const day = texture.split('\n').map(line => line.split(''));
        this.texture = new Texture(day, null, palette);
        return this;
    }

    withInitialRotation(angleX, angleY) {
        this.initialRotation = quaternionMultiply(
            quaternionFromAxisAngle([1, 0, 0], angleX * PI / 180),
            quaternionFromAxisAngle([0, 1, 0], angleY * PI / 180)
        );
        return this;
    }

    build(targetCoordsArray) {
        return new Globe(this.camera_cfg, this.radius, this.texture, this.initialRotation, targetCoordsArray);
    }
}

const canvasElement = document.getElementById('globeDisplay');
const canvas = new Canvas(90, 45);
let globeConfig;
let isDragging = false;
let previousMouseX, previousMouseY;
let distance = 50;
let isAutoRotating = true;
let targetCoordsArray = [];

function startRendering() {
    function drawFrame() {
        canvas.clear();

        if (isAutoRotating) {
            globeConfig.applyAutoRotation(-0.003);
        }

        globeConfig.renderOn(canvas);
        canvas.render();
    }

    function renderLoop() {
        drawFrame();
        requestAnimationFrame(renderLoop);
    }
    renderLoop();
}

function displayTraceDataRow(hop) {
    const traceTableContainer = document.getElementById('traceTableContainer');
    if (!document.querySelector('#traceTableContainer table')) {
        traceTableContainer.innerHTML = '<table><tr><th>#</th><th>IP</th><th>Host</th><th>RTT</th><th>Country/City</th></tr></table>';
    }

    const table = traceTableContainer.querySelector('table');
    const row = `
        <tr>
            <td>${hop.number}</td>
            <td>${hop.ip || '*'}</td>
            <td>${hop.host || '-'}</td>
            <td>${hop.rtt || '-'}</td>
            <td>${hop.location || '-'}</td>
        </tr>
    `;
    table.insertAdjacentHTML('beforeend', row);
}

function processHopData(hop) {
    if (hop.coordinates) {
        const coords = hop.coordinates.split(',').map(coord => coord.trim());
        const lat = parseFloat(coords[0]);
        const lng = parseFloat(coords[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
            targetCoordsArray.push({ latitude: lat, longitude: lng });
            globeConfig.targetCoordsArray = targetCoordsArray; // Обновляем массив координат
        }
    }
    displayTraceDataRow(hop); // Отображаем новую строку в таблице
}

function startSSE() {
    const eventSource = new EventSource('/trace'); // Убедитесь, что URL правильный

    eventSource.onmessage = function(event) {
        const hop = JSON.parse(event.data);
        processHopData(hop);
    };

    eventSource.onerror = function(event) {
        console.error('Ошибка в SSE-соединении:', event);
        eventSource.close();
    };
}

fetch(EARTH_TEXTURE_PATH)
    .then(response => response.text())
    .then(textureData => {
        globeConfig = new GlobeConfig()
            .withCamera({ x: 0, y: 0, z: 50 })
            .withRadius(30)
            .withTexture(textureData)
            .withInitialRotation(280, 120)
            .build(targetCoordsArray);

        startRendering();

        startSSE();
    })
    .catch(err => {
        console.error('Ошибка загрузки текстуры Земли:', err);
        document.getElementById('globeDisplay').innerText = 'Ошибка загрузки текстуры Земли';
    });

function isPointerInCanvas(x, y) {
    const rect = canvasElement.getBoundingClientRect();
    return (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
    );
}

function rotateGlobe(deltaX, deltaY) {
    globeConfig.setRotation(deltaX, deltaY);
}

document.addEventListener("mousedown", (event) => {
    if (isPointerInCanvas(event.clientX, event.clientY)) {
        isDragging = true;
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
        isAutoRotating = false;
    }
});

document.addEventListener("mousemove", (event) => {
    if (isDragging) {
        const deltaX = event.clientX - previousMouseX;
        const deltaY = event.clientY - previousMouseY;
        rotateGlobe(deltaX, deltaY);
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    }
});

document.addEventListener("mouseup", () => {
    isDragging = false;
});

document.addEventListener("touchstart", (event) => {
    if (isPointerInCanvas(event.touches[0].clientX, event.touches[0].clientY)) {
        isDragging = true;
        previousMouseX = event.touches[0].clientX;
        previousMouseY = event.touches[0].clientY;
        isAutoRotating = false;
    }
});

document.addEventListener("touchmove", (event) => {
    if (isDragging) {
        const deltaX = event.touches[0].clientX - previousMouseX;
        const deltaY = event.touches[0].clientY - previousMouseY;
        rotateGlobe(deltaX, deltaY);
        previousMouseX = event.touches[0].clientX;
        previousMouseY = event.touches[0].clientY;
    }
});

document.addEventListener("touchend", () => {
    isDragging = false;
});

document.addEventListener("wheel", (event) => {
    distance += event.deltaY * 0.05;
    distance = clamp(distance, 40, 80);
    globeConfig.setZoom(distance);
});

window.addEventListener('resize', () => {
    globeConfig.renderOn(canvas);
    canvas.render();
});


// Mouse event handlers for rotating and zooming the globe
document.addEventListener("mousedown", (event) => {
    if (isMouseInCanvas(event)) {
        isDragging = true;
        isInCanvas = true;
        previousMouseX = event.clientX;
        previousMouseY = event.clientY;

        isAutoRotating = false; // Stop auto-rotation when dragging starts
    }
});

document.addEventListener("mousemove", (event) => {
    if (isDragging && isInCanvas) {
        const deltaX = event.clientX - previousMouseX;
        const deltaY = event.clientY - previousMouseY;

        globeConfig.setRotation(deltaX, deltaY);

        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    }
});

document.addEventListener("mouseup", () => {
    isDragging = false;
    isInCanvas = false;
});

// Zoom the globe using the mouse wheel
document.addEventListener("wheel", (event) => {
    distance += event.deltaY * 0.05;
    distance = clamp(distance, 40, 80);
    globeConfig.setZoom(distance);
});


