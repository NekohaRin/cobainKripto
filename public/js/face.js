// face.js - face-api.js: model berlapis (lokal lalu CDN), kamera 640x480, deteksi presisi tinggi (SSD MobileNet / Tiny 416),
// descriptor 128-d dirata-rata dari beberapa sampel independen & dinormalisasi unit vector (L2 norm = 1).
const FACE_MODEL_URLS = ['./models', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/', 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/'];
let _faceReady = false, _faceStream = null, _detectorType = 'tiny';

async function loadFaceModels(onStatus = () => {}) {
  if (_faceReady) return;
  if (typeof faceapi === 'undefined') throw new Error('face-api.js gagal dimuat (cek internet atau blokir CDN).');
  let last;
  for (const url of FACE_MODEL_URLS) {
    try {
      onStatus('Memuat model AI dari ' + url + ' ...');
      // Prioritaskan SSD MobileNet v1 untuk akurasi tinggi landmark dan batas wajah
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceRecognitionNet.loadFromUri(url)
        ]);
        _detectorType = 'ssd';
        _faceReady = true;
        return;
      } catch {
        // Fallback ke TinyFaceDetector jika SSD MobileNet v1 tidak tersedia di endpoint
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(url),
          faceapi.nets.faceLandmark68Net.loadFromUri(url),
          faceapi.nets.faceRecognitionNet.loadFromUri(url)
        ]);
        _detectorType = 'tiny';
        _faceReady = true;
        return;
      }
    } catch (e) { last = e; }
  }
  throw new Error('Model AI gagal dimuat: ' + (last?.message || last));
}

async function startCamera(video, onStatus = () => {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera butuh localhost atau HTTPS.');
  await loadFaceModels(onStatus);
  _faceStream?.getTracks().forEach(t => t.stop());
  _faceStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
  video.srcObject = _faceStream; await video.play();
  if (!(video.readyState >= 2 && video.videoWidth)) await new Promise(r => { video.onloadeddata = r; });
  await new Promise(r => setTimeout(r, 800)); // beri waktu auto-exposure agar frame pertama tidak gelap
  onStatus('Kamera siap. Hadap ke kamera dengan cahaya cukup.');
}
const stopCamera = v => { _faceStream?.getTracks().forEach(t => t.stop()); _faceStream = null; v.srcObject = null; };

function _overlay(canvas, video, box, label, color) {
  if (!canvas) return;
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const x = canvas.getContext('2d'); x.clearRect(0, 0, canvas.width, canvas.height);
  x.font = '18px monospace'; x.fillStyle = x.strokeStyle = color; x.lineWidth = 3;
  if (box) x.strokeRect(box.x, box.y, box.width, box.height);
  x.fillText(label, box ? box.x : 12, box ? Math.max(20, box.y - 8) : 26);
}

// Mengulang deteksi hingga cukup sampel atau timeout, lalu merata-ratakan dan menormalisasi descriptor.
async function captureFace(video, { canvas = null, onStatus = () => {}, samples = 4, timeoutMs = 25000 } = {}) {
  if (!video.srcObject) throw new Error('Nyalakan kamera dulu.');
  await loadFaceModels(onStatus);
  const opts = _detectorType === 'ssd'
    ? new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
    : new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.6 });
  const got = [], t0 = performance.now();
  while (got.length < samples && performance.now() - t0 < timeoutMs) {
    if (!video.videoWidth) throw new Error('Video belum siap.');
    const det = await faceapi.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
    if (det) {
      const box = det.detection.box;
      // Validasi ukuran wajah agar tidak terlalu jauh sehingga fitur biometrik tetap tajam
      if (box.width < 100 || box.height < 100) {
        _overlay(canvas, video, box, 'Dekatkan wajah ke kamera', '#fbbf24');
        onStatus('Dekatkan wajah ke kamera...');
        await new Promise(r => setTimeout(r, 120));
        continue;
      }
      got.push(det.descriptor);
      _overlay(canvas, video, box, `Sampel ${got.length}/${samples}`, '#22d3ee');
      onStatus(`Memindai wajah... ${got.length}/${samples}`);
      await new Promise(r => setTimeout(r, 100)); // jeda kecil antar sampel untuk variasi temporal
    } else {
      _overlay(canvas, video, null, 'Wajah tidak terdeteksi', '#fbbf24');
      await new Promise(r => setTimeout(r, 80));
    }
  }
  _overlay(canvas, video, null, '', '#000');
  if (got.length < samples) throw new Error('Wajah tidak terdeteksi jelas. Perbaiki cahaya, dekatkan wajah, lalu coba lagi.');
  
  // Hitung rata-rata sampel
  const mean = new Float32Array(128);
  got.forEach(d => { for (let i = 0; i < 128; i++) mean[i] += d[i] / got.length; });
  
  // Normalisasi L2 unit vector agar perbandingan jarak kosinus / Euclidean selalu konsisten
  let norm = 0;
  for (let i = 0; i < 128; i++) norm += mean[i] * mean[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < 128; i++) mean[i] /= norm;
  }
  return Array.from(mean);
}
