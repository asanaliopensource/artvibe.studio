        // Core Application State
        const state = {
            width: 1920,
            height: 1080,
            zoom: 1,
            panX: 0,
            panY: 0,
            isPanning: false,
            panStartX: 0,
            panStartY: 0,

            activeTool: 'brush', // brush, eraser, bucket, shape, symmetry, text, eyedropper, pan
            brushSize: 12,
            brushOpacity: 1.0,
            brushType: 'round', // round, soft, marker, neon, calligraphy, spray, pixel
            smoothing: 0.4,

            primaryColor: '#6366f1',
            secondaryColor: '#ffffff',

            shapeFill: false,
            shapeType: 'line', // line, rectangle, circle, star, arrow
            symmetryCount: 4,

            layers: [],
            activeLayerId: null,
            nextLayerId: 1,

            history: [],
            historyIndex: -1,
            maxHistory: 20,

            isDrawing: false,
            lastX: 0,
            lastY: 0,
            points: [],

            gridVisible: false,
            backgroundColor: '#ffffff',
            backgroundTransparent: false,
            recentColors: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6']
        };

        // DOM Element References
        const viewport = document.getElementById('viewport');
        const canvasContainer = document.getElementById('canvas-container');
        const layersStack = document.getElementById('layers-stack');
        const bgCanvas = document.getElementById('background-canvas');
        const bgCtx = bgCanvas.getContext('2d');
        const overlayCanvas = document.getElementById('overlay-canvas');
        const overlayCtx = overlayCanvas.getContext('2d');
        const cursorPreview = document.getElementById('cursor-preview');

        function showToast(message, icon = 'fa-circle-info') {
            const toast = document.getElementById('toast');
            const toastMsg = document.getElementById('toast-msg');
            const toastIcon = document.getElementById('toast-icon');

            toastMsg.textContent = message;
            toastIcon.className = `fa-solid ${icon} text-indigo-400`;

            toast.classList.remove('opacity-0', 'pointer-events-none');
            toast.classList.add('opacity-100');

            setTimeout(() => {
                toast.classList.remove('opacity-100');
                toast.classList.add('opacity-0', 'pointer-events-none');
            }, 2500);
        }

        // Layer Class definition
        class Layer {
            constructor(id, name, width, height) {
                this.id = id;
                this.name = name;
                this.visible = true;
                this.opacity = 1.0;
                this.blendMode = 'source-over';

                this.canvas = document.createElement('canvas');
                this.canvas.width = width;
                this.canvas.height = height;
                this.canvas.className = 'absolute inset-0 rounded-sm';
                this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            }
        }

        function initCanvas(width, height, bgColor = '#ffffff', transparent = false) {
            state.width = width;
            state.height = height;
            state.backgroundColor = bgColor;
            state.backgroundTransparent = transparent;

            canvasContainer.style.width = `${width}px`;
            canvasContainer.style.height = `${height}px`;

            bgCanvas.width = width;
            bgCanvas.height = height;
            overlayCanvas.width = width;
            overlayCanvas.height = height;

            renderBackground();

            // Reset layers
            layersStack.innerHTML = '';
            state.layers = [];
            state.nextLayerId = 1;

            addLayer('Слой 1');
            saveHistoryState();
            updateStatusDims();
            centerCanvas();
        }

        function renderBackground() {
            bgCtx.clearRect(0, 0, state.width, state.height);
            if (!state.backgroundTransparent) {
                bgCtx.fillStyle = state.backgroundColor;
                bgCtx.fillRect(0, 0, state.width, state.height);
            }
        }

        function addLayer(name) {
            const id = state.nextLayerId++;
            const layerName = name || `Слой ${id}`;
            const layer = new Layer(id, layerName, state.width, state.height);

            state.layers.unshift(layer); // top layer first in list
            layersStack.appendChild(layer.canvas);
            state.activeLayerId = id;

            renderLayersList();
            updateLayerStyles();
            return layer;
        }

        function getActiveLayer() {
            return state.layers.find(l => l.id === state.activeLayerId);
        }

        function updateLayerStyles() {
            state.layers.forEach(layer => {
                layer.canvas.style.display = layer.visible ? 'block' : 'none';
                layer.canvas.style.opacity = layer.opacity;
                layer.canvas.style.mixBlendMode = layer.blendMode;
            });
        }

        function renderLayersList() {
            const listEl = document.getElementById('layers-list');
            listEl.innerHTML = '';

            state.layers.forEach(layer => {
                const isActive = layer.id === state.activeLayerId;
                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all border ${
                    isActive ? 'bg-indigo-600/30 border-indigo-500 text-white' : 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10'
                }`;

                item.innerHTML = `
                    <div class="flex items-center space-x-2 truncate">
                        <button class="btn-toggle-vis text-gray-400 hover:text-white p-1" data-id="${layer.id}">
                            <i class="fa-solid ${layer.visible ? 'fa-eye text-indigo-400' : 'fa-eye-slash text-gray-600'}"></i>
                        </button>
                        <span class="font-medium truncate">${layer.name}</span>
                    </div>
                    <span class="text-[10px] font-mono opacity-60">${Math.round(layer.opacity * 100)}%</span>
                `;

                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.btn-toggle-vis')) {
                        state.activeLayerId = layer.id;
                        renderLayersList();
                        updateLayerPropertiesInputs();
                        audio.playClick();
                    }
                });

                const visBtn = item.querySelector('.btn-toggle-vis');
                visBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    layer.visible = !layer.visible;
                    updateLayerStyles();
                    renderLayersList();
                });

                listEl.appendChild(item);
            });
        }

        function updateLayerPropertiesInputs() {
            const active = getActiveLayer();
            if (!active) return;
            document.getElementById('input-layer-opacity').value = Math.round(active.opacity * 100);
            document.getElementById('layer-opacity-val').textContent = `${Math.round(active.opacity * 100)}%`;
            document.getElementById('select-layer-blend').value = active.blendMode;
        }

        function centerCanvas() {
            const vpWidth = viewport.clientWidth;
            const vpHeight = viewport.clientHeight;
            if (!vpWidth || !vpHeight) return;

            const padding = 40;
            const availW = Math.max(100, vpWidth - padding);
            const availH = Math.max(100, vpHeight - padding);

            const scaleX = availW / state.width;
            const scaleY = availH / state.height;

            // Fit smoothly into viewport preserving aspect ratio
            state.zoom = Math.min(scaleX, scaleY);
            state.zoom = Math.min(Math.max(0.1, state.zoom), 2.0);

            state.panX = Math.round((vpWidth - state.width * state.zoom) / 2);
            state.panY = Math.round((vpHeight - state.height * state.zoom) / 2);

            applyTransform();
        }

        function applyTransform() {
            canvasContainer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
            const zoomVal = Math.round(state.zoom * 100);
            document.getElementById('zoom-level').textContent = `${zoomVal}%`;
        }

        function applyTransform() {
            canvasContainer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
            document.getElementById('zoom-level').textContent = `${Math.round(state.zoom * 100)}%`;
        }

        function getCanvasCoordinates(e) {
            const rect = canvasContainer.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const x = (clientX - rect.left) / state.zoom;
            const y = (clientY - rect.top) / state.zoom;

            return { x, y };
        }

        function startDrawing(e) {
            if (state.activeTool === 'pan' || e.button === 1 || e.spaceKey) {
                state.isPanning = true;
                state.panStartX = e.clientX - state.panX;
                state.panStartY = e.clientY - state.panY;
                viewport.style.cursor = 'grabbing';
                return;
            }

            const activeLayer = getActiveLayer();
            if (!activeLayer || !activeLayer.visible) return;

            const coords = getCanvasCoordinates(e);
            state.isDrawing = true;
            state.lastX = coords.x;
            state.lastY = coords.y;
            state.points = [coords];

            if (state.activeTool === 'bucket') {
                floodFill(activeLayer.ctx, Math.round(coords.x), Math.round(coords.y), state.primaryColor);
                saveHistoryState();
                state.isDrawing = false;
                return;
            }

            if (state.activeTool === 'eyedropper') {
                pickColor(coords.x, coords.y);
                state.isDrawing = false;
                return;
            }

            if (state.activeTool === 'text') {
                addTextToCanvas(activeLayer.ctx, coords.x, coords.y);
                saveHistoryState();
                state.isDrawing = false;
                return;
            }

            drawPoint(activeLayer.ctx, coords.x, coords.y);
        }

        function draw(e) {
            const coords = getCanvasCoordinates(e);
            document.getElementById('status-coords').innerHTML = `<i class="fa-solid fa-location-crosshairs mr-1"></i> X: ${Math.round(coords.x)}, Y: ${Math.round(coords.y)}`;

            // Position custom brush circle preview
            cursorPreview.style.left = `${e.clientX}px`;
            cursorPreview.style.top = `${e.clientY}px`;

            if (state.isPanning) {
                state.panX = e.clientX - state.panStartX;
                state.panY = e.clientY - state.panStartY;
                applyTransform();
                return;
            }

            if (!state.isDrawing) return;

            const activeLayer = getActiveLayer();
            if (!activeLayer) return;

            if (state.activeTool === 'shape') {
                renderShapePreview(coords.x, coords.y);
                return;
            }

            // Smooth Interpolation with Bezier / Weighted points
            state.points.push(coords);

            if (state.activeTool === 'symmetry') {
                drawSymmetryStroke(activeLayer.ctx, state.lastX, state.lastY, coords.x, coords.y);
            } else {
                drawStroke(activeLayer.ctx, state.lastX, state.lastY, coords.x, coords.y);
            }

            state.lastX = coords.x;
            state.lastY = coords.y;
        }

        function stopDrawing() {
            if (state.isPanning) {
                state.isPanning = false;
                viewport.style.cursor = state.activeTool === 'pan' ? 'grab' : 'crosshair';
            }

            if (state.isDrawing) {
                if (state.activeTool === 'shape') {
                    const activeLayer = getActiveLayer();
                    if (activeLayer && state.points.length > 0) {
                        const endCoords = state.points[state.points.length - 1];
                        drawShape(activeLayer.ctx, state.lastX, state.lastY, endCoords.x, endCoords.y);
                        overlayCtx.clearRect(0, 0, state.width, state.height);
                    }
                }
                state.isDrawing = false;
                state.points = [];
                saveHistoryState();
            }
        }

        function drawPoint(ctx, x, y) {
            ctx.save();
            ctx.globalAlpha = state.brushOpacity;

            if (state.activeTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath();
                ctx.arc(x, y, state.brushSize / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = state.primaryColor;
                ctx.strokeStyle = state.primaryColor;

                if (state.brushType === 'neon') {
                    ctx.shadowColor = state.primaryColor;
                    ctx.shadowBlur = state.brushSize;
                }

                ctx.beginPath();
                ctx.arc(x, y, state.brushSize / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function drawStroke(ctx, x1, y1, x2, y2) {
            ctx.save();
            ctx.globalAlpha = state.brushOpacity;

            if (state.activeTool === 'eraser') {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.lineWidth = state.brushSize;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            } else {
                ctx.strokeStyle = state.primaryColor;
                ctx.fillStyle = state.primaryColor;

                switch (state.brushType) {
                    case 'soft':
                        ctx.shadowColor = state.primaryColor;
                        ctx.shadowBlur = state.brushSize / 2;
                        ctx.lineWidth = state.brushSize / 2;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                        break;

                    case 'marker':
                        ctx.globalAlpha = state.brushOpacity * 0.4;
                        ctx.lineWidth = state.brushSize;
                        ctx.lineCap = 'square';
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                        break;

                    case 'neon':
                        ctx.shadowColor = state.primaryColor;
                        ctx.shadowBlur = state.brushSize * 1.5;
                        ctx.lineWidth = state.brushSize / 3;
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                        break;

                    case 'calligraphy':
                        const dist = Math.hypot(x2 - x1, y2 - y1);
                        const angle = Math.atan2(y2 - y1, x2 - x1);
                        for (let i = 0; i < dist; i += 2) {
                            const curX = x1 + (x2 - x1) * (i / dist);
                            const curY = y1 + (y2 - y1) * (i / dist);
                            ctx.fillRect(curX, curY, state.brushSize, state.brushSize / 4);
                        }
                        break;

                    case 'spray':
                        const density = state.brushSize * 2;
                        for (let i = 0; i < density; i++) {
                            const offsetX = (Math.random() - 0.5) * state.brushSize * 2;
                            const offsetY = (Math.random() - 0.5) * state.brushSize * 2;
                            if (offsetX * offsetX + offsetY * offsetY <= state.brushSize * state.brushSize) {
                                ctx.fillRect(x2 + offsetX, y2 + offsetY, 1, 1);
                            }
                        }
                        break;

                    case 'pixel':
                        const pxSize = Math.max(2, Math.floor(state.brushSize / 4));
                        const pxX = Math.floor(x2 / pxSize) * pxSize;
                        const pxY = Math.floor(y2 / pxSize) * pxSize;
                        ctx.fillRect(pxX, pxY, pxSize, pxSize);
                        break;

                    default: // Standard Round
                        ctx.lineWidth = state.brushSize;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                        break;
                }
            }
            ctx.restore();
        }

        function drawSymmetryStroke(ctx, x1, y1, x2, y2) {
            const centerX = state.width / 2;
            const centerY = state.height / 2;
            const count = state.symmetryCount;
            const angleStep = (Math.PI * 2) / count;

            for (let i = 0; i < count; i++) {
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(angleStep * i);

                // Original segment
                drawStroke(ctx, x1 - centerX, y1 - centerY, x2 - centerX, y2 - centerY);

                // Mirrored segment
                ctx.scale(1, -1);
                drawStroke(ctx, x1 - centerX, y1 - centerY, x2 - centerX, y2 - centerY);

                ctx.restore();
            }
        }

        function renderShapePreview(x2, y2) {
            overlayCtx.clearRect(0, 0, state.width, state.height);
            const x1 = state.lastX;
            const y1 = state.lastY;
            
            overlayCtx.save();
            overlayCtx.strokeStyle = state.primaryColor;
            overlayCtx.fillStyle = state.primaryColor;
            overlayCtx.lineWidth = state.brushSize;
            overlayCtx.globalAlpha = state.brushOpacity;

            drawShape(overlayCtx, x1, y1, x2, y2);
            overlayCtx.restore();
        }

        function drawShape(ctx, x1, y1, x2, y2) {
            ctx.beginPath();
            if (state.shapeType === 'line') {
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            } else if (state.shapeType === 'rectangle') {
                const w = x2 - x1;
                const h = y2 - y1;
                if (state.shapeFill) ctx.fillRect(x1, y1, w, h);
                ctx.strokeRect(x1, y1, w, h);
            } else if (state.shapeType === 'circle') {
                const rx = Math.abs(x2 - x1) / 2;
                const ry = Math.abs(y2 - y1) / 2;
                const cx = Math.min(x1, x2) + rx;
                const cy = Math.min(y1, y2) + ry;
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (state.shapeFill) ctx.fill();
                ctx.stroke();
            } else if (state.shapeType === 'star') {
                drawStar(ctx, x1, y1, Math.hypot(x2 - x1, y2 - y1), 5, 0.5);
                if (state.shapeFill) ctx.fill();
                ctx.stroke();
            } else if (state.shapeType === 'arrow') {
                drawArrow(ctx, x1, y1, x2, y2);
            }
        }

        function drawStar(ctx, cx, cy, radius, spikes, inset) {
            let rot = (Math.PI / 2) * 3;
            let x = cx;
            let y = cy;
            let step = Math.PI / spikes;

            ctx.beginPath();
            ctx.moveTo(cx, cy - radius);
            for (let i = 0; i < spikes; i++) {
                x = cx + Math.cos(rot) * radius;
                y = cy + Math.sin(rot) * radius;
                ctx.lineTo(x, y);
                rot += step;

                x = cx + Math.cos(rot) * (radius * inset);
                y = cy + Math.sin(rot) * (radius * inset);
                ctx.lineTo(x, y);
                rot += step;
            }
            ctx.lineTo(cx, cy - radius);
            ctx.closePath();
        }

        function drawArrow(ctx, fromx, fromy, tox, toy) {
            const headlen = Math.max(10, state.brushSize * 2);
            const dx = tox - fromx;
            const dy = toy - fromy;
            const angle = Math.atan2(dy, dx);
            ctx.moveTo(fromx, fromy);
            ctx.lineTo(tox, toy);
            ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(tox, toy);
            ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }

        function floodFill(ctx, startX, startY, fillColorHex) {
            const imgData = ctx.getImageData(0, 0, state.width, state.height);
            const data = imgData.data;

            const targetRgb = hexToRgb(fillColorHex);
            const targetColor = (255 << 24) | (targetRgb.b << 16) | (targetRgb.g << 8) | targetRgb.r;

            const startPos = (startY * state.width + startX) * 4;
            const startR = data[startPos];
            const startG = data[startPos + 1];
            const startB = data[startPos + 2];
            const startA = data[startPos + 3];

            if (startR === targetRgb.r && startG === targetRgb.g && startB === targetRgb.b && startA === 255) return;

            const pixelStack = [[startX, startY]];
            const width = state.width;
            const height = state.height;

            while (pixelStack.length) {
                const newPos = pixelStack.pop();
                const x = newPos[0];
                let y = newPos[1];

                let pixelPos = (y * width + x) * 4;
                while (y-- >= 0 && matchStartColor(data, pixelPos, startR, startG, startB, startA)) {
                    pixelPos -= width * 4;
                }
                pixelPos += width * 4;
                ++y;

                let reachLeft = false;
                let reachRight = false;

                while (y++ < height - 1 && matchStartColor(data, pixelPos, startR, startG, startB, startA)) {
                    colorPixel(data, pixelPos, targetRgb);

                    if (x > 0) {
                        if (matchStartColor(data, pixelPos - 4, startR, startG, startB, startA)) {
                            if (!reachLeft) {
                                pixelStack.push([x - 1, y]);
                                reachLeft = true;
                            }
                        } else if (reachLeft) {
                            reachLeft = false;
                        }
                    }

                    if (x < width - 1) {
                        if (matchStartColor(data, pixelPos + 4, startR, startG, startB, startA)) {
                            if (!reachRight) {
                                pixelStack.push([x + 1, y]);
                                reachRight = true;
                            }
                        } else if (reachRight) {
                            reachRight = false;
                        }
                    }

                    pixelPos += width * 4;
                }
            }

            ctx.putImageData(imgData, 0, 0);
        }

        function matchStartColor(data, pixelPos, startR, startG, startB, startA) {
            return (
                Math.abs(data[pixelPos] - startR) < 20 &&
                Math.abs(data[pixelPos + 1] - startG) < 20 &&
                Math.abs(data[pixelPos + 2] - startB) < 20 &&
                Math.abs(data[pixelPos + 3] - startA) < 20
            );
        }

        function colorPixel(data, pixelPos, rgb) {
            data[pixelPos] = rgb.r;
            data[pixelPos + 1] = rgb.g;
            data[pixelPos + 2] = rgb.b;
            data[pixelPos + 3] = 255;
        }

        function hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 0, b: 0 };
        }

        function pickColor(x, y) {
            const activeLayer = getActiveLayer();
            if (!activeLayer) return;

            const pixel = activeLayer.ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            const hex = "#" + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1);

            state.primaryColor = hex;
            document.getElementById('primary-color').value = hex;
            document.getElementById('primary-color-preview').style.backgroundColor = hex;

            addRecentColor(hex);
            showToast(`Цвет выбран: ${hex.toUpperCase()}`, 'fa-eye-dropper');
        }

        function addTextToCanvas(ctx, x, y) {
            const text = prompt("Введите текст для размещения:", "ArtVibe");
            if (!text) return;

            ctx.save();
            ctx.font = `${state.brushSize * 2}px Inter, sans-serif`;
            ctx.fillStyle = state.primaryColor;
            ctx.globalAlpha = state.brushOpacity;
            ctx.fillText(text, x, y);
            ctx.restore();
        }

        function applyLayerFilters() {
            const active = getActiveLayer();
            if (!active) return;

            const b = document.getElementById('filter-brightness').value;
            const c = document.getElementById('filter-contrast').value;
            const s = document.getElementById('filter-saturate').value;
            const blur = document.getElementById('filter-blur').value;

            // Temp canvas filter
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = state.width;
            tempCanvas.height = state.height;
            const tempCtx = tempCanvas.getContext('2d');

            tempCtx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) blur(${blur}px)`;
            tempCtx.drawImage(active.canvas, 0, 0);

            active.ctx.clearRect(0, 0, state.width, state.height);
            active.ctx.drawImage(tempCanvas, 0, 0);

            saveHistoryState();
            showToast('Фильтры применены', 'fa-sliders');
        }

        function saveHistoryState() {
            // Cap history stack
            if (state.historyIndex < state.history.length - 1) {
                state.history = state.history.slice(0, state.historyIndex + 1);
            }

            const snapshot = state.layers.map(layer => {
                const imgData = layer.ctx.getImageData(0, 0, state.width, state.height);
                return {
                    id: layer.id,
                    name: layer.name,
                    visible: layer.visible,
                    opacity: layer.opacity,
                    blendMode: layer.blendMode,
                    data: imgData
                };
            });

            state.history.push(snapshot);
            if (state.history.length > state.maxHistory) {
                state.history.shift();
            } else {
                state.historyIndex++;
            }

            updateUndoRedoButtons();
        }

        function undo() {
            if (state.historyIndex > 0) {
                state.historyIndex--;
                restoreHistoryState(state.history[state.historyIndex]);
                audio.playClick();
            }
        }

        function redo() {
            if (state.historyIndex < state.history.length - 1) {
                state.historyIndex++;
                restoreHistoryState(state.history[state.historyIndex]);
                audio.playClick();
            }
        }

        function restoreHistoryState(snapshot) {
            // Reconstruct layer canvases
            layersStack.innerHTML = '';
            state.layers = [];

            snapshot.forEach(item => {
                const layer = new Layer(item.id, item.name, state.width, state.height);
                layer.visible = item.visible;
                layer.opacity = item.opacity;
                layer.blendMode = item.blendMode;
                layer.ctx.putImageData(item.data, 0, 0);

                state.layers.push(layer);
                layersStack.appendChild(layer.canvas);
            });

            renderLayersList();
            updateLayerStyles();
            updateUndoRedoButtons();
        }

        function updateUndoRedoButtons() {
            document.getElementById('btn-undo').disabled = state.historyIndex <= 0;
            document.getElementById('btn-redo').disabled = state.historyIndex >= state.history.length - 1;
        }

        const PRESET_PALETTES = [
            '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b',
            '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
            '#ec4899', '#f43f5e', '#64748b', '#78350f', '#14532d'
        ];

        function initPalettes() {
            const presetContainer = document.getElementById('preset-colors');
            presetContainer.innerHTML = '';

            PRESET_PALETTES.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'w-8 h-8 rounded-lg border border-white/10 shadow transition-transform hover:scale-110';
                swatch.style.backgroundColor = color;
                swatch.addEventListener('click', () => {
                    state.primaryColor = color;
                    document.getElementById('primary-color').value = color;
                    document.getElementById('primary-color-preview').style.backgroundColor = color;
                    addRecentColor(color);
                    audio.playClick();
                });
                presetContainer.appendChild(swatch);
            });

            renderRecentColors();
        }

        function addRecentColor(color) {
            if (!state.recentColors.includes(color)) {
                state.recentColors.unshift(color);
                if (state.recentColors.length > 12) state.recentColors.pop();
                renderRecentColors();
            }
        }

        function renderRecentColors() {
            const recentContainer = document.getElementById('recent-colors');
            recentContainer.innerHTML = '';

            state.recentColors.forEach(color => {
                const swatch = document.createElement('button');
                swatch.className = 'w-7 h-7 rounded-md border border-white/10 shadow hover:scale-105';
                swatch.style.backgroundColor = color;
                swatch.addEventListener('click', () => {
                    state.primaryColor = color;
                    document.getElementById('primary-color').value = color;
                    document.getElementById('primary-color-preview').style.backgroundColor = color;
                });
                recentContainer.appendChild(swatch);
            });
        }

        function setupEventListeners() {
            // Tool Selection Buttons
            document.querySelectorAll('.tool-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    state.activeTool = btn.dataset.tool;
                    document.getElementById('active-tool-name').textContent = btn.title.split(' ')[0];
                    document.getElementById('active-tool-icon').className = btn.querySelector('i').className + ' text-indigo-400';

                    // Toggle Sub-toolbar items visibility based on active tool
                    document.getElementById('wrapper-shape-options').className = state.activeTool === 'shape' ? 'flex items-center space-x-3' : 'hidden';
                    document.getElementById('wrapper-symmetry-options').className = state.activeTool === 'symmetry' ? 'flex items-center space-x-2' : 'hidden';
                    document.getElementById('wrapper-brush-type').className = (state.activeTool === 'brush' || state.activeTool === 'symmetry') ? 'flex items-center space-x-2' : 'hidden';

                    viewport.style.cursor = state.activeTool === 'pan' ? 'grab' : 'crosshair';
                    audio.playClick();
                });
            });

            // Sliders and Inputs
            document.getElementById('input-size').addEventListener('input', (e) => {
                state.brushSize = parseInt(e.target.value);
                document.getElementById('label-size').textContent = `${state.brushSize}px`;
                cursorPreview.style.width = `${state.brushSize * state.zoom}px`;
                cursorPreview.style.height = `${state.brushSize * state.zoom}px`;
            });

            document.getElementById('input-opacity').addEventListener('input', (e) => {
                state.brushOpacity = parseInt(e.target.value) / 100;
                document.getElementById('label-opacity').textContent = `${e.target.value}%`;
            });

            document.getElementById('select-brush-type').addEventListener('change', (e) => {
                state.brushType = e.target.value;
            });

            document.getElementById('select-shape-type').addEventListener('change', (e) => {
                state.shapeType = e.target.value;
            });

            document.getElementById('check-shape-fill').addEventListener('change', (e) => {
                state.shapeFill = e.target.checked;
            });

            document.getElementById('select-symmetry-count').addEventListener('change', (e) => {
                state.symmetryCount = parseInt(e.target.value);
            });

            // Color inputs
            document.getElementById('primary-color').addEventListener('input', (e) => {
                state.primaryColor = e.target.value;
                document.getElementById('primary-color-preview').style.backgroundColor = e.target.value;
            });

            document.getElementById('secondary-color').addEventListener('input', (e) => {
                state.secondaryColor = e.target.value;
                document.getElementById('secondary-color-preview').style.backgroundColor = e.target.value;
            });

            document.getElementById('btn-swap-colors').addEventListener('click', () => {
                const temp = state.primaryColor;
                state.primaryColor = state.secondaryColor;
                state.secondaryColor = temp;

                document.getElementById('primary-color').value = state.primaryColor;
                document.getElementById('primary-color-preview').style.backgroundColor = state.primaryColor;
                document.getElementById('secondary-color').value = state.secondaryColor;
                document.getElementById('secondary-color-preview').style.backgroundColor = state.secondaryColor;
                audio.playClick();
            });

            // Canvas Interaction Listeners
            viewport.addEventListener('mousedown', startDrawing);
            window.addEventListener('mousemove', draw);
            window.addEventListener('mouseup', stopDrawing);

            // Touch support
            viewport.addEventListener('touchstart', (e) => { startDrawing(e); e.preventDefault(); }, { passive: false });
            viewport.addEventListener('touchmove', (e) => { draw(e); e.preventDefault(); }, { passive: false });
            viewport.addEventListener('touchend', stopDrawing);

            // Zoom via Mouse Wheel
            viewport.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                state.zoom = Math.min(Math.max(0.1, state.zoom * zoomFactor), 5);
                applyTransform();
            }, { passive: false });

            // Layer Management Listeners
            document.getElementById('btn-add-layer').addEventListener('click', () => {
                addLayer();
                saveHistoryState();
                showToast('Добавлен новый слой', 'fa-layer-group');
                audio.playClick();
            });

            document.getElementById('btn-del-layer').addEventListener('click', () => {
                if (state.layers.length <= 1) {
                    showToast('Нельзя удалить единственный слой!', 'fa-triangle-exclamation');
                    return;
                }
                state.layers = state.layers.filter(l => l.id !== state.activeLayerId);
                const target = state.layers[0];
                const canvasEl = document.querySelector(`canvas[data-id="${state.activeLayerId}"]`);
                state.activeLayerId = target.id;

                renderLayersList();
                updateLayerStyles();
                saveHistoryState();
                showToast('Слой удален', 'fa-trash');
                audio.playClick();
            });

            document.getElementById('input-layer-opacity').addEventListener('input', (e) => {
                const active = getActiveLayer();
                if (active) {
                    active.opacity = parseInt(e.target.value) / 100;
                    document.getElementById('layer-opacity-val').textContent = `${e.target.value}%`;
                    updateLayerStyles();
                }
            });

            document.getElementById('select-layer-blend').addEventListener('change', (e) => {
                const active = getActiveLayer();
                if (active) {
                    active.blendMode = e.target.value;
                    updateLayerStyles();
                }
            });

            // Header Action Buttons
            document.getElementById('btn-undo').addEventListener('click', undo);
            document.getElementById('btn-redo').addEventListener('click', redo);
            document.getElementById('btn-clear').addEventListener('click', () => {
                const active = getActiveLayer();
                if (active) {
                    active.ctx.clearRect(0, 0, state.width, state.height);
                    saveHistoryState();
                    showToast('Слой очищен', 'fa-eraser');
                    audio.playChime();
                }
            });

            document.getElementById('btn-zoom-in').addEventListener('click', () => { state.zoom = Math.min(5, state.zoom * 1.2); applyTransform(); });
            document.getElementById('btn-zoom-out').addEventListener('click', () => { state.zoom = Math.max(0.1, state.zoom / 1.2); applyTransform(); });
            document.getElementById('btn-zoom-reset').addEventListener('click', centerCanvas);

            document.getElementById('btn-audio').addEventListener('click', () => {
                audio.enabled = !audio.enabled;
                const icon = document.getElementById('audio-icon');
                icon.className = audio.enabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark text-gray-500';
                showToast(audio.enabled ? 'Звук включен' : 'Звук выключен');
            });

            // Dock Tabs Navigation
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.tab-btn').forEach(b => {
                        b.classList.remove('text-indigo-400', 'border-indigo-500', 'active');
                        b.classList.add('text-gray-400', 'border-transparent');
                    });
                    btn.classList.add('text-indigo-400', 'border-indigo-500', 'active');

                    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
                    audio.playClick();
                });
            });

            // Modals Trigger Handlers
            document.getElementById('btn-new').addEventListener('click', () => openModal('modal-new'));
            document.getElementById('btn-export').addEventListener('click', () => openModal('modal-export'));
            document.getElementById('btn-shortcuts').addEventListener('click', () => openModal('modal-shortcuts'));

            document.querySelectorAll('.modal-close').forEach(btn => {
                btn.addEventListener('click', closeModal);
            });

            document.getElementById('btn-create-canvas').addEventListener('click', () => {
                const w = parseInt(document.getElementById('input-canvas-width').value) || 1280;
                const h = parseInt(document.getElementById('input-canvas-height').value) || 720;
                const bg = document.getElementById('input-bg-color').value;
                const trans = document.getElementById('input-bg-transparent').checked;

                initCanvas(w, h, bg, trans);
                closeModal();
                showToast(`Новый холст создан: ${w}x${h}px`, 'fa-file');
            });

            document.getElementById('preset-dimensions').addEventListener('change', (e) => {
                if (e.target.value === 'screen') {
                    const vpW = viewport.clientWidth || 1920;
                    const vpH = viewport.clientHeight || 1080;
                    document.getElementById('input-canvas-width').value = vpW;
                    document.getElementById('input-canvas-height').value = vpH;
                } else {
                    const [w, h] = e.target.value.split('x');
                    document.getElementById('input-canvas-width').value = w;
                    document.getElementById('input-canvas-height').value = h;
                }
            });

            // Image Export Functionality
            document.getElementById('btn-confirm-export').addEventListener('click', () => {
                const format = document.getElementById('export-format').value;
                const filename = document.getElementById('export-filename').value || 'artwork';

                // Composite layers into temporary master canvas
                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = state.width;
                exportCanvas.height = state.height;
                const eCtx = exportCanvas.getContext('2d');

                // Draw Background
                if (!state.backgroundTransparent) {
                    eCtx.fillStyle = state.backgroundColor;
                    eCtx.fillRect(0, 0, state.width, state.height);
                }

                // Draw Layers bottom to top
                [...state.layers].reverse().forEach(layer => {
                    if (layer.visible) {
                        eCtx.globalAlpha = layer.opacity;
                        eCtx.globalCompositeOperation = layer.blendMode;
                        eCtx.drawImage(layer.canvas, 0, 0);
                    }
                });

                const link = document.createElement('a');
                link.download = `${filename}.${format}`;
                link.href = exportCanvas.toDataURL(`image/${format}`, 0.92);
                link.click();

                closeModal();
                showToast('Изображение успешно экспортировано!', 'fa-download');
            });

            // Open Image / Project File Handler
            document.getElementById('btn-open-img').addEventListener('click', () => {
                document.getElementById('file-input').click();
            });

            document.getElementById('file-input').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const active = getActiveLayer();
                        if (active) {
                            active.ctx.drawImage(img, 0, 0, state.width, state.height);
                            saveHistoryState();
                            showToast('Изображение загружено на слой', 'fa-image');
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            });

            // Global Keyboard Shortcuts
            window.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

                if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
                if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }

                switch (e.key.toLowerCase()) {
                    case 'b': triggerTool('brush'); break;
                    case 'e': triggerTool('eraser'); break;
                    case 'g': triggerTool('bucket'); break;
                    case 'u': triggerTool('shape'); break;
                    case 's': triggerTool('symmetry'); break;
                    case 't': triggerTool('text'); break;
                    case 'i': triggerTool('eyedropper'); break;
                    case 'h': triggerTool('pan'); break;
                    case 'x': document.getElementById('btn-swap-colors').click(); break;
                    case '[': 
                        state.brushSize = Math.max(1, state.brushSize - 2); 
                        document.getElementById('input-size').value = state.brushSize;
                        document.getElementById('label-size').textContent = `${state.brushSize}px`;
                        break;
                    case ']': 
                        state.brushSize = Math.min(200, state.brushSize + 2); 
                        document.getElementById('input-size').value = state.brushSize;
                        document.getElementById('label-size').textContent = `${state.brushSize}px`;
                        break;
                }
            });

            // Layer Filters triggers
            document.getElementById('btn-apply-filter').addEventListener('click', applyLayerFilters);
            document.getElementById('btn-reset-filter').addEventListener('click', () => {
                document.getElementById('filter-brightness').value = 100;
                document.getElementById('filter-contrast').value = 100;
                document.getElementById('filter-saturate').value = 100;
                document.getElementById('filter-blur').value = 0;
            });
        }

        function triggerTool(toolName) {
            const btn = document.querySelector(`.tool-btn[data-tool="${toolName}"]`);
            if (btn) btn.click();
        }

        function openModal(id) {
            document.getElementById(id).classList.remove('hidden');
        }

        function closeModal() {
            document.querySelectorAll('[id^="modal-"]').forEach(m => m.classList.add('hidden'));
        }

        function updateStatusDims() {
            document.getElementById('status-dims').innerHTML = `<i class="fa-solid fa-vector-square mr-1"></i> ${state.width} x ${state.height} px`;
        }

        window.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                // Initialize default Pro Canvas to standard 1920x1080
                initCanvas(1920, 1080);
                initPalettes();
                setupEventListeners();

                // Keep canvas centered when viewport changes size
                const resizeObserver = new ResizeObserver(() => {
                    centerCanvas();
                });
                resizeObserver.observe(viewport);
            }, 60);
        });
