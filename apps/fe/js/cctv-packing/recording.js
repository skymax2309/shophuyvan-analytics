function initRecordingStream() {
            // [KIẾN TRÚC MỚI]: Bắt cóc luồng video của máy quét
            const videoEl = document.getElementById('video-preview');
            if (videoEl && videoEl.srcObject) {
                try {
                    videoEl.setAttribute('playsinline', 'true');
                    videoEl.setAttribute('webkit-playsinline', 'true');
                    
                    cameraStream = videoEl.srcObject;
                    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp8') ? 'video/webm; codecs=vp8' : 'video/webm';
                    const recorderStream = ensureRecordingCanvasStream();
                    mediaRecorder = new MediaRecorder(recorderStream, { mimeType, videoBitsPerSecond: 900000 });
                    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
                    
                    mediaRecorder.onstop = async () => {
                        // Chốt metadata và chunks vào biến riêng trước khi mở đơn kế tiếp để hai video không lẫn dữ liệu.
                        const uploadMeta = mediaRecorder.stoppedUploadMeta || recordingSessionMeta || {};
                        const chunksToUpload = recordedChunks.slice();
                        recordedChunks = [];
                        mediaRecorder.stoppedUploadMeta = null;
                        recordingSessionMeta = null;
                        const nextMeta = pendingRecordingMeta;
                        pendingRecordingMeta = null;
                        if (nextMeta) startRecordingSession(nextMeta);
                        uploadPackingVideo(chunksToUpload, uploadMeta);
                    };
                    if (pendingRecordingMeta) {
                        const nextMeta = pendingRecordingMeta;
                        pendingRecordingMeta = null;
                        startRecordingSession(nextMeta);
                    }
                    devLog("✅ Đã móc nối Camera vào máy ghi hình có lớp ngày giờ và mã vận đơn!");
                } catch (err) {
                    devLog("❌ Lỗi tạo luồng ghi: " + err.message);
                }
            } else {
                devLog("⏳ Đang đợi Camera khởi động để móc nối...");
                setTimeout(initRecordingStream, 1500); 
            }
        }

        async function validatePackingScan(decodedText) {
            if (decodedText === STOP_PACKING_CODE) return null;
            try {
                const res = await fetch(`${API_BASE_URL}/cctv/scan-order?code=${encodeURIComponent(decodedText)}`, { cache: 'no-store' });
                const data = await res.json();
                if (!res.ok || data.error) throw new Error(data.error || "Không kiểm tra được mã.");
                if (!data.found) {
                    devLog(`⚠️ [${decodedText}] OMS chưa có đơn này. Video vẫn lưu làm bằng chứng, nhưng cần đồng bộ/import đơn trước khi chốt kho.`);
                    return data;
                }
                devLog(`✅ [${decodedText}] Khớp đơn ${data.order.platform || ""} / ${data.order.shop || ""}`);
                const speechText = data.speech_text || packingQuantitySpeech(data);
                devLog(`🔊 [${decodedText}] ${speechText}`);
                if (data.label?.valid) {
                    devLog(`✅ [${decodedText}] Tem in hợp lệ trước khi đóng gói.`);
                } else {
                    devLog(`⚠️ [${decodedText}] Tem chưa hợp lệ hoặc chưa có: ${data.label?.error || "chưa rõ"}.`);
                }
                return data;
            } catch (err) {
                devLog(`⚠️ [${decodedText}] Không kiểm tra được OMS: ${err.message}. Video vẫn tiếp tục lưu.`);
                return null;
            }
        }

        async function onScanSuccess(decodedText) {
            const scan = normalizePackingScan(decodedText);
            const scanCode = scan.code;
            const now = Date.now();
            if (!scanCode || scanInFlight) return;
            if (scanCode === currentScanCode || scanCode === currentOrderId) return;
            if (pendingRecordingMeta && scanCode === pendingRecordingMeta.scanCode) return;
            if (scanCode === lastScanCode && now - lastScanAt < SCAN_DUPLICATE_WINDOW_MS) return;

            scanInFlight = true;
            lastScanCode = scanCode;
            lastScanAt = now;

            try {
                playBeep();
                devLog(`⚡ Bắt được ${scan.source === 'qr' ? 'QR' : 'mã vận đơn'}: ${scanCode}`);
                if (scan.raw && scan.raw !== scanCode) devLog(`🧾 QR đã rút mã sạch: ${scanCode}`);
                if (scanCode === STOP_PACKING_CODE) {
                    manualStop(true);
                    return;
                }
                const continuing = Boolean(mediaRecorder && mediaRecorder.state === "recording");
                const scanData = await validatePackingScan(scanCode);
                if (scanData?.found && scanData?.evidence?.label_required_for_packing && !scanData?.evidence?.can_mark_packed) {
                    speakVietnamese("Đơn TikTok chưa có tem, tải lại tem trước.");
                    devLog(`⛔ [${scanCode}] TikTok chưa có tem đã lưu. Vào Kho tem in để tải lại tem trước khi đóng gói.`);
                    return;
                }
                const mappedOrderId = scanData?.order?.order_id || scanCode;
                const recordingMeta = buildRecordingMeta(scanCode, scanData, mappedOrderId, continuing);

                // Luôn lưu video theo mã đơn thật nếu API map được từ mã vận đơn.
                setCurrentPackingMeta(recordingMeta);
                if (mappedOrderId !== scanCode) devLog(`🔗 Mã vận đơn ${scanCode} đã map về mã đơn ${mappedOrderId}.`);
                queueOrStartRecording(recordingMeta);
            } finally {
                scanInFlight = false;
            }
        }

    let codeReader;
        
        function startSystem() {
            devLog("🚀 Bắt đầu nổ máy với Động cơ lõi ZXing...");
            requestScreenWakeLock();
            try {
                codeReader = new ZXing.BrowserMultiFormatReader(buildPackingScannerHints(), 160);
            } catch (err) {
                codeReader = new ZXing.BrowserMultiFormatReader();
            }
            
            // Ép iPad dùng Camera sau và đẩy lên độ phân giải HD để đọc mã vạch siêu nhạy
            const constraints = { 
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 24, max: 30 },
                    advanced: [{ focusMode: "continuous" }]
                }
            };

            // Bắn luồng camera vào thẻ video và bắt đầu soi mã liên tục
            codeReader.decodeFromConstraints(constraints, 'video-preview', (result, err) => {
                if (result) {
                    onScanSuccess(result.getText());
                }
            });
            
            fetchServerCoordinates();
        }
        renderStopQr();
        updateBatterySaverUi();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && (batterySaverEnabled || cameraStream)) requestScreenWakeLock();
        });
        // (Lưu ý: Không tự chạy code nữa. Đợi Kỹ sư trưởng bấm nút "MỞ KHÓA" thì startSystem mới được gọi)
        window.addEventListener('pagehide', () => {
            try {
                if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
                if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
                if (recordingCanvasStream) recordingCanvasStream.getTracks().forEach(track => track.stop());
                if (recordingFrameId) {
                    cancelAnimationFrame(recordingFrameId);
                    recordingFrameId = null;
                }
                if (codeReader) codeReader.reset();
                releaseScreenWakeLock();
            } catch (e) {}
        });
