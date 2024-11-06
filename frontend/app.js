const PI = Math.PI;

const EARTH_TEXTURE_PATH = 'textures/earth_2_0_W400_H119.txt';

class Texture {
    constructor(day, palette = null) {
        this.day = day;
        this.palette = palette;
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
        const html = this.matrix.map(row => {
            return row.map(cell => {
                if (cell.color) {
                    return `<span style="color: ${cell.color}">${cell.char}</span>`;
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
        this.targetCoordsArray = targetCoordsArray; // Array of objects { latitude, longitude }
        this.verticalAngle = 0;
    }

    renderOn(canvas) {
        const light = [0.0, 999999.0, 0.0];
        const [sizeX, sizeY] = canvas.size;

        // Convert target coordinates to radians for points and segments
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
                const luminance = clamp(5 * dot(n, l) + 0.5, 0, 1);

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

                // Check coordinates and set point at target position
                const isTargetPoint = targetPoints.some(point =>
                    Math.abs(theta - point.theta / (2 * PI)) < 0.005 &&
                    Math.abs(phi - point.phi / PI) < 0.005
                );

                // Check if there is a line at the current position
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

        // Limit vertical rotation angle to approximately 80 degrees
        const maxVerticalAngle = Math.PI / 2 - 0.5;
        let newVerticalAngle = this.verticalAngle + deltaY * 0.01;

        // Ensure we don't exceed allowed range
        if (newVerticalAngle > maxVerticalAngle) {
            newVerticalAngle = maxVerticalAngle;
        } else if (newVerticalAngle < -maxVerticalAngle) {
            newVerticalAngle = -maxVerticalAngle;
        }

        const qx = quaternionFromAxisAngle(xAxis, newVerticalAngle - this.verticalAngle);
        const qy = quaternionFromAxisAngle(yAxis, deltaX * 0.01);

        this.rotation = quaternionMultiply(this.rotation, quaternionMultiply(qy, qx));
        this.verticalAngle = newVerticalAngle;
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

// Interpolates between two points to create a line segment
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
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2
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
    setInterval(drawFrame, 16);
}

// Function to display traceroute data in a table
function displayTraceData(traceData) {
    const traceTableContainer = document.getElementById('traceTableContainer');

    // Remove loading message
    traceTableContainer.innerHTML = '';

    // Create table
    let tableHTML = '<table>';
    tableHTML += '<tr><th>#</th><th>IP</th><th>Host</th><th>RTT</th><th>Country/City</th></tr>';

    traceData.forEach((hop, index) => {
        tableHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${hop.ip || '*'}</td>
                <td>${hop.host || '-'}</td>
                <td>${hop.rtt || '-'}</td>
                <td>${hop.location || '-'}</td>
            </tr>
        `;
    });

    tableHTML += '</table>';
    traceTableContainer.innerHTML = tableHTML;
}

// Load Earth texture and start rendering the globe
fetch(EARTH_TEXTURE_PATH)
    .then(response => response.text())
    .then(textureData => {
        // Initialize globe with empty coordinates array
        globeConfig = new GlobeConfig()
            .withCamera({ x: 0, y: 0, z: 50 })
            .withRadius(30)
            .withTexture(textureData)
            .withInitialRotation(280, 120)
            .build(targetCoordsArray);

        startRendering();

        // Load traceroute data
        fetch('/trace')
            .then(response => response.json())
            .then(traceData => {
                // Process data to extract coordinates
                traceData.forEach(hop => {
                    if (hop.coordinates) {
                        const coords = hop.coordinates.split(',').map(coord => coord.trim());
                        const lat = parseFloat(coords[0]);
                        const lng = parseFloat(coords[1]);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            hop.latitude = lat;
                            hop.longitude = lng;
                        }
                    }
                });

                // Update coordinates array
                targetCoordsArray = traceData
                    .filter(hop => hop.latitude != null && hop.longitude != null)
                    .map(hop => ({
                        latitude: hop.latitude,
                        longitude: hop.longitude
                    }));

                // Update globe with new data
                globeConfig.targetCoordsArray = targetCoordsArray;

                // Display data in table
                displayTraceData(traceData);
            })
            .catch(err => {
                console.error('Error loading traceroute data:', err);
                const traceTableContainer = document.getElementById('traceTableContainer');
                traceTableContainer.innerHTML = '<div style="color: red;">Error loading traceroute data</div>';
            });
    })
    .catch(err => {
        console.error('Error loading Earth texture:', err);
        document.getElementById('globeDisplay').innerText = 'Error loading Earth texture';
    });

// Mouse event handlers
document.addEventListener("mousedown", (event) => {
    isDragging = true;
    previousMouseX = event.clientX;
    previousMouseY = event.clientY;

    isAutoRotating = false;
});

document.addEventListener("mousemove", (event) => {
    if (isDragging) {
        const deltaX = event.clientX - previousMouseX;
        const deltaY = event.clientY - previousMouseY;

        globeConfig.setRotation(deltaX, deltaY);

        previousMouseX = event.clientX;
        previousMouseY = event.clientY;
    }
});

document.addEventListener("mouseup", () => {
    isDragging = false;
});

document.addEventListener("wheel", (event) => {
    distance += event.deltaY * 0.05;
    distance = clamp(distance, 40, 80);
    globeConfig.setZoom(distance);
});



