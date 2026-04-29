import { AudioVisualizerEngine } from './audio.js';
import { Visualizer } from './visualizer.js';
import { Recorder } from './recorder.js';

const uiContainer = document.getElementById('ui');
const loadingText = document.getElementById('loading');
const stemsInput = document.getElementById('stems-input');
const playStemsBtn = document.getElementById('play-stems');
const trackInput = document.getElementById('track-input');
const playTrackBtn = document.getElementById('play-track');

const playbackControls = document.getElementById('playback-controls');
const playPauseBtn = document.getElementById('play-pause-btn');
const stopBtn = document.getElementById('stop-btn');
const recordBtn = document.getElementById('record-btn');
const downloadBtn = document.getElementById('download-btn');

const seekBar = document.getElementById('seek-bar');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');

const paletteSelect = document.getElementById('palette-select');
const shapeStyleSelect = document.getElementById('shape-style-select');
const screenSizeSelect = document.getElementById('screen-size');

// Background controls
const bgInput = document.getElementById('bg-input');
const bgClearBtn = document.getElementById('bg-clear-btn');

const canvas = document.getElementById('visualizer-canvas');

let audioEngine = new AudioVisualizerEngine();
let visualizer = new Visualizer(canvas);
let recorder = new Recorder();
let animationId = null;
let currentBlob = null;
let isRecording = false;

function resetPlaybackUi() {
    playbackControls.style.display = 'none';
    uiContainer.querySelectorAll('button').forEach(btn => btn.disabled = false);
}

// Init palette
visualizer.setPalette(paletteSelect.value);
visualizer.setShapeStyle(shapeStyleSelect.value);

// Input listeners
paletteSelect.addEventListener('change', (e) => {
    visualizer.setPalette(e.target.value);
});

shapeStyleSelect.addEventListener('change', (e) => {
    visualizer.setShapeStyle(e.target.value);
});

screenSizeSelect.addEventListener('change', (e) => {
    if (e.target.value === 'phone') {
        canvas.classList.add('phone-mode');
        visualizer.resize(375, 812);
    } else {
        canvas.classList.remove('phone-mode');
        visualizer.resize(window.innerWidth, window.innerHeight);
    }
});

stemsInput.addEventListener('change', () => {
    playStemsBtn.disabled = stemsInput.files.length < 1;
});

trackInput.addEventListener('change', () => {
    playTrackBtn.disabled = trackInput.files.length === 0;
});

// Background image import
bgInput.addEventListener('change', () => {
    const file = bgInput.files && bgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            visualizer.setBackgroundImage(img);
            bgClearBtn.disabled = false;
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});

bgClearBtn.addEventListener('click', () => {
    visualizer.clearBackground();
    bgInput.value = '';
    bgClearBtn.disabled = true;
});

// Start loop
function renderLoop() {
    animationId = requestAnimationFrame(renderLoop);
    const freqs = audioEngine.getFrequencies();
    visualizer.update(freqs);
    
    if (audioEngine.isPlaying) {
        const current = audioEngine.getCurrentTime();
        seekBar.value = current;
        timeCurrent.innerText = formatTime(current);
        
        // Auto-stop when finished
        if (current >= audioEngine.duration && audioEngine.duration > 0) {
            audioEngine.stop();
            playPauseBtn.innerText = "Play";
            seekBar.value = 0;
            timeCurrent.innerText = "0:00";
            resetPlaybackUi();
        }
    }
}

async function startPlayback(mode) {
    loadingText.style.display = 'block';
    uiContainer.querySelectorAll('button:not(#stop-btn)').forEach(btn => btn.disabled = true);
    
    try {
        if (mode === 'stems') {
            await audioEngine.loadStems(stemsInput.files);
        } else {
            await audioEngine.loadSingle(trackInput.files[0]);
        }
        
        audioEngine.play(0); // Start at 0
        playPauseBtn.innerText = "Pause";
        
        // Ensure visualizer palette hues match the stem count
        visualizer.setPalette(paletteSelect.value);
        
        seekBar.max = audioEngine.duration;
        timeTotal.innerText = formatTime(audioEngine.duration);
        
        loadingText.style.display = 'none';
        playbackControls.style.display = 'block';
        stopBtn.disabled = false;
        playPauseBtn.disabled = false;
        recordBtn.disabled = false;
        
        if (!animationId) {
            renderLoop();
        }
    } catch (e) {
        console.error(e);
        alert("Failed to load audio files.");
        loadingText.style.display = 'none';
        uiContainer.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }
}

playStemsBtn.addEventListener('click', () => startPlayback('stems'));
playTrackBtn.addEventListener('click', () => startPlayback('single'));

playPauseBtn.addEventListener('click', () => {
    if (audioEngine.isPlaying) {
        audioEngine.pause();
        playPauseBtn.innerText = "Play";
    } else {
        const offset = parseFloat(seekBar.value);
        if (offset >= audioEngine.duration) audioEngine.play(0);
        else audioEngine.play(offset);
        playPauseBtn.innerText = "Pause";
    }
});

seekBar.addEventListener('input', () => {
    const time = parseFloat(seekBar.value);
    timeCurrent.innerText = formatTime(time);
    audioEngine.seek(time);
});

stopBtn.addEventListener('click', async () => {
    audioEngine.stop();
    playPauseBtn.innerText = "Play";
    seekBar.value = 0;
    timeCurrent.innerText = "0:00";
    
    if (isRecording) {
        currentBlob = await recorder.stop();
        isRecording = false;
        recordBtn.textContent = "Start Recording";
        downloadBtn.disabled = !currentBlob;
    }

    resetPlaybackUi();
});

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        recorder.start(canvas, audioEngine.destinationStream);
        isRecording = true;
        recordBtn.textContent = "Stop Recording";
        downloadBtn.disabled = true;
    } else {
        currentBlob = await recorder.stop();
        isRecording = false;
        recordBtn.textContent = "Start Recording";
        downloadBtn.disabled = !currentBlob;
    }
});

downloadBtn.addEventListener('click', () => {
    if (currentBlob) {
        recorder.download(currentBlob);
    }
});

// Helper to format seconds
function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

// Helper handle resize
window.addEventListener('resize', () => {
    if (screenSizeSelect.value === 'fullscreen') {
        visualizer.resize(window.innerWidth, window.innerHeight);
    }
});
