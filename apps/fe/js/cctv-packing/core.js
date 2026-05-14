var API_BASE_URL = "https://huyvan-worker-api.nghiemchihuy.workers.dev/api";
var PYTHON_SERVER_URL = null;
var VIDEO_UPLOAD_URL = `${API_BASE_URL}/cctv/upload`;
var currentOrderId = null;
var currentScanCode = null;
var mediaRecorder = null;
var recordedChunks = [];
var cameraStream = null;
var recordingCanvas = null;
var recordingCanvasCtx = null;
var recordingCanvasStream = null;
var recordingFrameId = null;
var recordingSessionMeta = null;
var pendingRecordingMeta = null;
var currentTrackingNumber = null;
var currentRecordingStartedAt = null;
var currentOverlayPlatform = "";
var currentOverlayShop = "";
var audioCtx = null;
var scanInFlight = false;
var lastScanCode = "";
var lastScanAt = 0;
var batterySaverEnabled = false;
var wakeLock = null;
var STOP_PACKING_CODE = "STOP_PACKING";
var SCAN_DUPLICATE_WINDOW_MS = 1200;

        function isPackingScanToken(value) {
            const token = String(value || '').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '');
            if (!token || token.length < 6 || token.length > 50) return false;
            if (!/[0-9]/.test(token)) return false;
            if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) return false;
            return !/^(HTTPS?|WWW|SELLER|SHOPEE|LAZADA|TIKTOK|ORDER|TRACKING|WAYBILL|NUMBER)$/i.test(token);
        }

        function addPackingScanCandidate(list, seen, value) {
            const token = String(value || '').trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._-]+$/g, '');
            if (!isPackingScanToken(token)) return;
            const key = token.toUpperCase();
            if (seen.has(key)) return;
            seen.add(key);
            list.push(token);
        }

        function addPackingScanJsonValues(list, seen, value, depth = 0) {
            if (depth > 3 || value == null) return;
            if (typeof value === 'string' || typeof value === 'number') {
                addPackingScanCandidate(list, seen, value);
                return;
            }
            if (Array.isArray(value)) {
                value.slice(0, 20).forEach(item => addPackingScanJsonValues(list, seen, item, depth + 1));
                return;
            }
            if (typeof value !== 'object') return;
            const fieldHints = new Set(['orderid', 'ordersn', 'orderno', 'ordernumber', 'trackingnumber', 'trackingno', 'waybill', 'waybillno', 'logisticsno', 'shippingcode', 'packagenumber', 'packageno']);
            Object.entries(value).forEach(([key, child]) => {
                const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                if (fieldHints.has(normalizedKey)) addPackingScanJsonValues(list, seen, child, depth + 1);
            });
        }

        function addPackingScanParams(list, seen, params) {
            const fieldHints = new Set(['orderid', 'ordersn', 'orderno', 'ordernumber', 'trackingnumber', 'trackingno', 'waybill', 'waybillno', 'logisticsno', 'shippingcode', 'packagenumber', 'packageno']);
            for (const [key, value] of params.entries()) {
                const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
                if (fieldHints.has(normalizedKey)) addPackingScanCandidate(list, seen, value);
            }
        }

        function safeDecodeScanText(value) {
            try {
                return decodeURIComponent(value);
            } catch (err) {
                return value;
            }
        }

        function normalizePackingScan(rawText) {
            const raw = String(rawText || '').trim();
            const seen = new Set();
            const candidates = [];
            const decoded = safeDecodeScanText(raw);
            const texts = [raw, decoded].filter((item, index, arr) => item && arr.indexOf(item) === index);

            texts.forEach(text => {
                try {
                    const parsedUrl = /^https?:\/\//i.test(text) ? new URL(text) : null;
                    if (parsedUrl) {
                        addPackingScanParams(candidates, seen, parsedUrl.searchParams);
                        parsedUrl.pathname.split(/[\/\s]+/).forEach(part => addPackingScanCandidate(candidates, seen, part));
                    }
                } catch (err) {}

                try {
                    const params = new URLSearchParams(text.replace(/^[?#]/, ''));
                    if ([...params.keys()].length) addPackingScanParams(candidates, seen, params);
                } catch (err) {}

                if (/^[\[{]/.test(text.trim())) {
                    try {
                        addPackingScanJsonValues(candidates, seen, JSON.parse(text));
                    } catch (err) {}
                }

                const keyedPattern = /(?:order|tracking|waybill|logistics|package|shipping)[_\-\s]*(?:id|sn|no|number|code)?\s*[:=]\s*["']?([A-Za-z0-9._-]{6,50})/gi;
                for (const match of text.matchAll(keyedPattern)) addPackingScanCandidate(candidates, seen, match[1]);
                addPackingScanCandidate(candidates, seen, text);
                for (const match of text.matchAll(/[A-Za-z0-9][A-Za-z0-9._-]{5,49}/g)) addPackingScanCandidate(candidates, seen, match[0]);
            });

            // QR trên tem có thể là URL/JSON; mã vận đơn thường là Code128. Rút mã sạch trước giúp gọi API nhanh và tránh lưu video bằng chuỗi QR dài.
            const code = candidates[0] || raw;
            return { raw, code, candidates, source: code !== raw ? 'qr' : 'barcode' };
        }

        function buildPackingScannerHints() {
            const hints = new Map();
            const formats = [
                ZXing.BarcodeFormat.QR_CODE,
                ZXing.BarcodeFormat.CODE_128,
                ZXing.BarcodeFormat.CODE_39,
                ZXing.BarcodeFormat.ITF,
                ZXing.BarcodeFormat.EAN_13
            ].filter(Boolean);
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            return hints;
        }

        async function renderStopQr() {
            const target = document.getElementById('stop-qr');
            if (!target) return;
            try {
                target.innerHTML = '';
                if (window.ZXing?.BrowserQRCodeSvgWriter) {
                    const writer = new ZXing.BrowserQRCodeSvgWriter();
                    target.appendChild(writer.write(STOP_PACKING_CODE, 112, 112));
                    return;
                }
                if (window.QRCode?.toCanvas) {
                    const canvas = document.createElement('canvas');
                    await QRCode.toCanvas(canvas, STOP_PACKING_CODE, {
                        width: 112,
                        margin: 1,
                        color: { dark: '#000000', light: '#ffffff' }
                    });
                    target.appendChild(canvas);
                    return;
                }
                throw new Error('missing_qr_writer');
            } catch (err) {
                target.innerHTML = '<span style="font-size:10px;font-weight:800;text-align:center;">STOP<br>PACKING</span>';
                devLog("⚠️ Chưa tạo được QR dừng quay, vẫn có thể dùng mã STOP_PACKING.");
            }
        }

        function downloadStopQr() {
            const canvas = document.querySelector('#stop-qr canvas');
            const svg = document.querySelector('#stop-qr svg');
            if (!canvas && !svg) {
                devLog("⚠️ QR dừng quay chưa sẵn sàng để tải.");
                return;
            }
            const link = document.createElement('a');
            if (canvas) {
                link.href = canvas.toDataURL('image/png');
                link.download = 'qr-stop-dong-goi.png';
            } else {
                const svgText = new XMLSerializer().serializeToString(svg);
                link.href = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
                link.download = 'qr-stop-dong-goi.svg';
            }
            link.click();
            if (link.href.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }

        function setWakeLockStatus(message) {
            const status = document.getElementById('wake-lock-status');
            if (status) status.innerText = message;
        }

        async function requestScreenWakeLock() {
            if (!('wakeLock' in navigator)) {
                setWakeLockStatus('Màn hình: máy không hỗ trợ giữ sáng');
                return;
            }
            try {
                if (wakeLock) return;
                wakeLock = await navigator.wakeLock.request('screen');
                setWakeLockStatus('Màn hình: đang giữ sáng');
                wakeLock.addEventListener('release', () => {
                    wakeLock = null;
                    setWakeLockStatus('Màn hình: đã nhả giữ sáng');
                });
            } catch (err) {
                setWakeLockStatus('Màn hình: cần chạm lại để giữ sáng');
            }
        }

        async function releaseScreenWakeLock() {
            try {
                if (wakeLock) await wakeLock.release();
            } catch (err) {}
            wakeLock = null;
        }

        function updateBatterySaverUi() {
            document.body.classList.toggle('power-save', batterySaverEnabled);
            const button = document.getElementById('btn-battery-saver');
            if (!button) return;
            button.classList.toggle('active', batterySaverEnabled);
            button.innerText = batterySaverEnabled ? 'Mở sáng lại' : 'Tối màn hình';
        }

        function toggleBatterySaver() {
            batterySaverEnabled = !batterySaverEnabled;
            updateBatterySaverUi();
            // Web không được phép quét khi khóa màn hình thật, nên dùng màn hình tối + Wake Lock để camera vẫn chạy.
            requestScreenWakeLock();
            devLog(batterySaverEnabled
                ? '🌙 Đã bật màn hình tối: camera vẫn quét, không khóa màn hình điện thoại.'
                : '☀️ Đã mở sáng lại giao diện trạm quay.');
        }

        // --- TRỊ BỆNH TẮT TIẾNG: HÀM MỞ KHÓA AUDIO APPLE ---
        function unlockAppleAudio() {
            // 1. Giấu lớp phủ NGAY LẬP TỨC để chắc chắn không bao giờ bị kẹt màn hình
            document.getElementById('unlock-overlay').style.display = 'none';
            
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    audioCtx = new AudioContext();
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    gain.gain.value = 0; 
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(0);
                    // Dùng thời gian tương đối tránh lỗi Safari
                    osc.stop(audioCtx.currentTime + 0.1);
                    devLog("✅ Đã sẵn sàng bộ cộng hưởng âm thanh!");
                }
            } catch (e) {
                devLog("⚠️ Bỏ qua âm thanh: Không hỗ trợ thiết bị này.");
            }
            
            // 2. Luôn luôn gọi khởi động hệ thống bất kể âm thanh có thành công hay không
            startSystem();
        }

        // --- CỖ MÁY TẠO ÂM THANH "TÍT" CHUYÊN NGHIỆP ---
        function playBeep() {
            if (!audioCtx) return;
            try {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = "square"; 
                osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
                gain.gain.setValueAtTime(0.1, audioCtx.currentTime); 
                osc.start();
                osc.stop(audioCtx.currentTime + 0.15); 
       } catch (err) { devLog("⚠️ Không phát được âm thanh"); }
        }

        // --- HÀM BẤM NÚT DỪNG KHẨN CẤP ---
        function speakVietnamese(message) {
            const text = String(message || '').trim();
            if (!text || !('speechSynthesis' in window)) return;
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'vi-VN';
                utterance.rate = 1.02;
                utterance.pitch = 1;
                utterance.volume = 1;
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                devLog("⚠️ Thiết bị không phát được giọng đọc.");
            }
        }

        function packingQuantitySpeech(data) {
            if (!data || !data.found) return 'Không tìm thấy đơn trong OMS.';
            const summary = data.item_summary || {};
            const order = data.order || {};
            const totalQty = Number(summary.total_qty || order.total_qty || 0);
            const skuCount = Number(summary.sku_count || order.sku_count || 0);
            if (totalQty > 0) return `Đơn này có ${totalQty} sản phẩm${skuCount > 1 ? `, ${skuCount} mã hàng` : ''}.`;
            return 'Đơn này chưa có dữ liệu sản phẩm.';
        }

        function manualStop(skipBeep = false) {
            if (!skipBeep) playBeep();
            devLog("🛑 Bấm nút: Đã ra lệnh Dừng Đóng Gói!");
            pendingRecordingMeta = null;
            stopActiveRecording();
            speakVietnamese("Đã dừng đóng gói. Video đang lưu.");
            currentOrderId = STOP_PACKING_CODE;
            currentScanCode = STOP_PACKING_CODE;
            currentTrackingNumber = null;
            document.getElementById('current-order').innerText = "ĐÃ DỪNG GHI HÌNH";
            document.getElementById('status-container').className = "status-box";
            document.getElementById('record-status').style.display = "none";
            document.getElementById('btn-stop-packing').style.display = "none";
        }

        function devLog(msg) {
            const logBox = document.getElementById('dev-log');
            logBox.innerHTML += `[${new Date().toLocaleTimeString()}] ${msg}<br>`;
            logBox.scrollTop = logBox.scrollHeight;
        }

         async function fetchServerCoordinates() {
            PYTHON_SERVER_URL = VIDEO_UPLOAD_URL;
            document.getElementById('btn-unlock-cloudflare').style.display = "none";
            document.getElementById('current-order').innerText = "SẴN SÀNG QUÉT MÃ";
            devLog("✅ Đã bật chế độ web-only: video sẽ lưu thẳng lên Cloudflare R2.");
            initRecordingStream();
        }

        // --- HÀM VƯỢT TƯỜNG LỬA CLOUDFLARE ---
        function unlockCloudflare() {
            // Mở link gốc ra một tab riêng để người dùng tự bấm chữ "I Acknowledge"
            const baseTunnelUrl = PYTHON_SERVER_URL.replace("/upload-video", "");
            window.open(baseTunnelUrl, "_blank");
            
            // Giấu nút đi và bật chế độ sẵn sàng
            document.getElementById('btn-unlock-cloudflare').style.display = "none";
            document.getElementById('current-order').innerText = "SẴN SÀNG QUÉT MÃ";
            devLog("🔓 Đã xác nhận. Hãy quay lại tab này và quét mã!");
        }

        function formatPackingOverlayDate(date = new Date()) {
            const pad = value => String(value).padStart(2, "0");
            return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        }

        function buildPackingOverlayRows() {
            const activeMeta = recordingSessionMeta || {
                orderId: currentOrderId,
                trackingNumber: currentTrackingNumber || currentScanCode || currentOrderId,
                platform: currentOverlayPlatform,
                shop: currentOverlayShop
            };
            const trackingNumber = activeMeta.trackingNumber || activeMeta.scanCode || activeMeta.orderId || "CHƯA CÓ MÃ";
            const rows = [
                `Ngày giờ quay: ${formatPackingOverlayDate(new Date())}`,
                `Mã vận đơn: ${trackingNumber}`
            ];
            if (activeMeta.orderId && activeMeta.orderId !== trackingNumber) rows.push(`Mã đơn: ${activeMeta.orderId}`);
            const sourceText = [activeMeta.platform, activeMeta.shop].filter(Boolean).join(" / ");
            if (sourceText) rows.push(`Sàn/shop: ${sourceText}`);
            return rows;
        }

        function fitCanvasTextSize(ctx, text, maxWidth, baseSize, minSize = 14) {
            let size = baseSize;
            while (size > minSize) {
                ctx.font = `800 ${size}px Arial, sans-serif`;
                if (ctx.measureText(text).width <= maxWidth) return size;
                size -= 1;
            }
            return minSize;
        }

        function drawPackingVideoOverlay(ctx, width, height) {
            const rows = buildPackingOverlayRows();
            const paddingX = Math.max(18, Math.round(width * 0.025));
            const paddingY = Math.max(12, Math.round(height * 0.018));
            const baseSize = Math.max(18, Math.round(width * 0.026));
            const rowHeight = Math.max(26, Math.round(baseSize * 1.35));
            const boxHeight = paddingY * 2 + rowHeight * rows.length;
            ctx.fillStyle = "rgba(0, 0, 0, 0.74)";
            ctx.fillRect(0, height - boxHeight, width, boxHeight);

            rows.forEach((row, index) => {
                const fontSize = fitCanvasTextSize(ctx, row, width - paddingX * 2, baseSize, 13);
                ctx.font = `800 ${fontSize}px Arial, sans-serif`;
                ctx.textBaseline = "alphabetic";
                ctx.lineJoin = "round";
                const y = height - boxHeight + paddingY + rowHeight * index + Math.round(rowHeight * 0.72);
                ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
                ctx.lineWidth = 4;
                ctx.strokeText(row, paddingX, y);
                ctx.fillStyle = index === 1 ? "#ffffff" : "#d8fff0";
                ctx.fillText(row, paddingX, y);
            });
        }

        function drawRecordingCanvasFrame() {
            const videoEl = document.getElementById("video-preview");
            if (!recordingCanvas || !recordingCanvasCtx || !videoEl) return;
            const width = videoEl.videoWidth || 1280;
            const height = videoEl.videoHeight || 720;
            if (recordingCanvas.width !== width || recordingCanvas.height !== height) {
                recordingCanvas.width = width;
                recordingCanvas.height = height;
            }
            recordingCanvasCtx.fillStyle = "#000000";
            recordingCanvasCtx.fillRect(0, 0, width, height);
            if (videoEl.readyState >= 2) {
                recordingCanvasCtx.drawImage(videoEl, 0, 0, width, height);
            }
            // Overlay được vẽ vào canvas trước khi MediaRecorder ghi, nên file video tải lên đã có sẵn mã vận đơn và thời gian.
            drawPackingVideoOverlay(recordingCanvasCtx, width, height);
            recordingFrameId = window.requestAnimationFrame(drawRecordingCanvasFrame);
        }

        function ensureRecordingCanvasStream() {
            recordingCanvas = document.getElementById("recording-canvas");
            if (!recordingCanvas) {
                recordingCanvas = document.createElement("canvas");
                recordingCanvas.id = "recording-canvas";
                recordingCanvas.hidden = true;
                document.body.appendChild(recordingCanvas);
            }
            recordingCanvasCtx = recordingCanvas.getContext("2d");
            if (!recordingFrameId) drawRecordingCanvasFrame();
            if (!recordingCanvas.captureStream) {
                devLog("⚠️ Trình duyệt không hỗ trợ ghi canvas overlay, video sẽ quay từ camera gốc.");
                return cameraStream;
            }
            if (!recordingCanvasStream) recordingCanvasStream = recordingCanvas.captureStream(24);
            return recordingCanvasStream;
        }

        function buildRecordingMeta(scanCode, scanData, mappedOrderId, continuing) {
            const order = scanData?.order || {};
            const trackingNumber = order.tracking_number || order.tracking_no || order.waybill_no || order.logistics_no || scanData?.tracking_number || scanCode;
            const quantityText = scanData ? (scanData.speech_text || packingQuantitySpeech(scanData)) : "Chưa kiểm tra được dữ liệu OMS.";
            const prefix = continuing ? "Đã lưu, tiếp tục đơn mới. " : "";
            // Trạm đóng gói chỉ phát số lượng/mã hàng; mã vận đơn và mã đơn giữ trên màn hình để tránh loa đọc chuỗi dài gây nhiễu.
            const announcement = `${prefix}Sẵn sàng, đã quét thành công, đang quay. ${quantityText}`;
            return {
                orderId: mappedOrderId,
                scanCode,
                trackingNumber,
                platform: order.platform || scanData?.platform || "",
                shop: order.shop || scanData?.shop || "",
                announcement
            };
        }

        function setCurrentPackingMeta(meta) {
            currentScanCode = meta.scanCode;
            currentOrderId = meta.orderId;
            currentTrackingNumber = meta.trackingNumber;
            currentRecordingStartedAt = meta.startedAt || null;
            currentOverlayPlatform = meta.platform || "";
            currentOverlayShop = meta.shop || "";
            const currentLabel = meta.trackingNumber && meta.trackingNumber !== meta.orderId
                ? `${meta.orderId} · ${meta.trackingNumber}`
                : meta.orderId;
            document.getElementById("current-order").innerText = currentLabel;
        }

        function stopActiveRecording() {
            if (!mediaRecorder || mediaRecorder.state !== "recording") return false;
            const stoppedAt = new Date().toISOString();
            mediaRecorder.stoppedUploadMeta = {
                ...(recordingSessionMeta || {}),
                stoppedAt
            };
            mediaRecorder.stop();
            return true;
        }

        function startRecordingSession(meta) {
            if (!mediaRecorder || mediaRecorder.state !== "inactive") {
                pendingRecordingMeta = meta;
                devLog("⏳ Đang chờ máy quay sẵn sàng để bắt đầu đơn mới.");
                return;
            }
            const startedMeta = {
                ...meta,
                startedAt: new Date().toISOString(),
                recordingId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                mimeType: mediaRecorder.mimeType || "video/webm"
            };
            setCurrentPackingMeta(startedMeta);
            recordingSessionMeta = startedMeta;
            recordedChunks = [];
            try {
                mediaRecorder.start(1000);
            } catch (err) {
                recordingSessionMeta = null;
                devLog(`❌ Không bắt đầu quay được: ${err.message}`);
                return;
            }
            document.getElementById("status-container").className = "status-box recording";
            document.getElementById("record-status").style.display = "block";
            document.getElementById("btn-stop-packing").style.display = "block";
            devLog(`🎥 Đang quay đơn ${startedMeta.orderId} / mã vận đơn ${startedMeta.trackingNumber}.`);
            devLog(`🔊 ${startedMeta.announcement}`);
            speakVietnamese(startedMeta.announcement);
        }

        function queueOrStartRecording(meta) {
            if (!mediaRecorder) {
                pendingRecordingMeta = meta;
                devLog("⏳ Camera chưa sẵn sàng, đã xếp đơn vào hàng chờ quay.");
                return;
            }
            if (mediaRecorder.state === "recording") {
                pendingRecordingMeta = meta;
                stopActiveRecording();
                return;
            }
            startRecordingSession(meta);
        }

        async function uploadPackingVideo(chunks, uploadMeta) {
            const orderToUpload = uploadMeta?.orderId;
            if (!chunks?.length || !orderToUpload || orderToUpload === STOP_PACKING_CODE) return;
            const mimeType = uploadMeta.mimeType || "video/webm";
            const formData = new FormData();
            formData.append("video", new Blob(chunks, { type: mimeType }), `${orderToUpload}.webm`);
            formData.append("order_id", orderToUpload);
            formData.append("tracking_number", uploadMeta.trackingNumber || "");
            formData.append("scan_code", uploadMeta.scanCode || "");
            formData.append("recorded_at", uploadMeta.startedAt || "");
            formData.append("stopped_at", uploadMeta.stoppedAt || "");
            devLog(`📦 Đang tải video đơn ${orderToUpload} lên đám mây...`);
            try {
                const res = await fetch(PYTHON_SERVER_URL, { method: "POST", body: formData });
                const responseText = await res.text();
                if (responseText.includes("trycloudflare") || responseText.includes("Cloudflare")) {
                    devLog(`❌ [${orderToUpload}] BỊ CLOUDFLARE CHẶN! Vui lòng bấm nút "XÁC NHẬN MẠNG" ở trên!`);
                    document.getElementById("btn-unlock-cloudflare").style.display = "block";
                } else if (res.ok) {
                    devLog(`✅ [${orderToUpload}] Đã lưu video lên Cloud thành công!`);
                } else {
                    devLog(`❌ [${orderToUpload}] PC TỪ CHỐI (Mã lỗi: ${res.status})`);
                }
            } catch (err) {
                devLog(`❌ [${orderToUpload}] Đứt cáp mạng: ${err.message}`);
            }
        }
