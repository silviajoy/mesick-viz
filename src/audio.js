export class AudioVisualizerEngine {
    constructor() {
        this.ctx = null;
        this.sources = [];
        this.analysers = { lows: null, mids: null, highs: null };
        this.dataArrays = { lows: null, mids: null, highs: null };
        this.stemAnalysers = [];
        this.stemDataArrays = [];
        this.destinationStream = null;

        this.buffers = [];
        this.inputNodes = [];
        this.mode = null;
        
        this.startTime = 0;
        this.pausedAt = 0;
        this.isPlaying = false;
        this.duration = 0;
    }

    initCtx() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.destinationStream = this.ctx.createMediaStreamDestination();
        }
    }

    async loadFile(file) {
        const buffer = await file.arrayBuffer();
        return await this.ctx.decodeAudioData(buffer);
    }

    createAnalyser() {
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        return analyser;
    }

    _resetAnalysers() {
        ['lows', 'mids', 'highs'].forEach(key => {
            if (this.analysers[key]) {
                this.analysers[key].disconnect();
                this.analysers[key] = null;
            }
        });
        this.stemAnalysers.forEach(a => a && a.disconnect());
        this.stemAnalysers = [];
        this.stemDataArrays = [];
        this.inputNodes = [];
    }

    async loadStems(files) {
        this.initCtx();
        this.stop();
        this._resetAnalysers();
        this.mode = 'stems';
        
        this.buffers = await Promise.all(Array.from(files).slice(0, 12).map(f => this.loadFile(f)));
        this.duration = Math.max(...this.buffers.map(b => b ? b.duration : 0));
        
        const masterGain = this.ctx.createGain();
        
        const lowpass = this.ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 250;
        this.analysers.lows = this.createAnalyser(); this.dataArrays.lows = new Uint8Array(this.analysers.lows.frequencyBinCount);
        masterGain.connect(lowpass); lowpass.connect(this.analysers.lows);
        
        const bandpass = this.ctx.createBiquadFilter(); bandpass.type = 'bandpass'; bandpass.frequency.value = 1000; bandpass.Q.value = 1;
        this.analysers.mids = this.createAnalyser(); this.dataArrays.mids = new Uint8Array(this.analysers.mids.frequencyBinCount);
        masterGain.connect(bandpass); bandpass.connect(this.analysers.mids);
        
        const highpass = this.ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 4000;
        this.analysers.highs = this.createAnalyser(); this.dataArrays.highs = new Uint8Array(this.analysers.highs.frequencyBinCount);
        masterGain.connect(highpass); highpass.connect(this.analysers.highs);

        masterGain.connect(this.ctx.destination);
        masterGain.connect(this.destinationStream);
        
        this.buffers.forEach((buffer, index) => {
            const analyser = this.createAnalyser();
            this.stemAnalysers.push(analyser);
            this.stemDataArrays.push(new Uint8Array(analyser.frequencyBinCount));
            
            const gain = this.ctx.createGain();
            gain.connect(analyser);
            gain.connect(masterGain);
            this.inputNodes[index] = gain;
        });
    }

    async loadSingle(file) {
        this.initCtx();
        this.stop();
        this._resetAnalysers();
        this.mode = 'single';
        
        const buffer = await this.loadFile(file);
        this.buffers = [buffer];
        this.duration = buffer.duration;
        
        const lowpass = this.ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 250;
        this.analysers.lows = this.createAnalyser(); this.dataArrays.lows = new Uint8Array(this.analysers.lows.frequencyBinCount);
        lowpass.connect(this.analysers.lows);
        
        const bandpass = this.ctx.createBiquadFilter(); bandpass.type = 'bandpass'; bandpass.frequency.value = 1000; bandpass.Q.value = 1;
        this.analysers.mids = this.createAnalyser(); this.dataArrays.mids = new Uint8Array(this.analysers.mids.frequencyBinCount);
        bandpass.connect(this.analysers.mids);
        
        const highpass = this.ctx.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 4000;
        this.analysers.highs = this.createAnalyser(); this.dataArrays.highs = new Uint8Array(this.analysers.highs.frequencyBinCount);
        highpass.connect(this.analysers.highs);

        const splitterGain = this.ctx.createGain();
        splitterGain.connect(lowpass);
        splitterGain.connect(bandpass);
        splitterGain.connect(highpass);
        
        splitterGain.connect(this.ctx.destination);
        splitterGain.connect(this.destinationStream);
        
        this.inputNodes = [splitterGain];
    }

    play(offset = 0) {
        if (this.isPlaying) return;
        this.initCtx();
        
        this.sources.forEach(s => s && s.disconnect());
        this.sources = this.buffers.map((buffer, i) => {
            if (!buffer) return null;
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            const inputNode = this.mode === 'stems' ? this.inputNodes[i] : this.inputNodes[0];
            source.connect(inputNode);
            source.start(0, offset);
            return source;
        });

        this.startTime = this.ctx.currentTime - offset;
        this.pausedAt = offset;
        this.isPlaying = true;
    }

    pause() {
        if (!this.isPlaying) return;
        this.sources.forEach(s => s && s.stop());
        this.pausedAt = this.ctx.currentTime - this.startTime;
        this.isPlaying = false;
    }
    
    stop() {
        if (this.isPlaying) {
            this.sources.forEach(s => s && s.stop());
            this.isPlaying = false;
        }
        this.pausedAt = 0;
    }

    seek(time) {
        const clampTime = Math.max(0, Math.min(time, this.duration));
        if (this.isPlaying) {
            this.pause();
            this.play(clampTime);
        } else {
            this.pausedAt = clampTime;
        }
    }

    getCurrentTime() {
        if (this.isPlaying) {
            return this.ctx.currentTime - this.startTime;
        }
        return this.pausedAt;
    }

    getFrequencies() {
        if (!this.ctx) return { lows: 0, mids: 0, highs: 0, stems: [] };
        
        const getAvg = (key) => {
            if (!this.analysers[key]) return 0;
            this.analysers[key].getByteFrequencyData(this.dataArrays[key]);
            let sum = 0;
            for (let i = 0; i < this.dataArrays[key].length; i++) {
                sum += this.dataArrays[key][i];
            }
            return (sum / this.dataArrays[key].length) / 255.0; 
        };
        
        const stems = this.stemAnalysers.map((ana, i) => {
            ana.getByteFrequencyData(this.stemDataArrays[i]);
            let sum = 0;
            let weightSum = 0;
            let max = 0;
            const length = this.stemDataArrays[i].length;
            
            for (let j = 0; j < length; j++) {
                const val = this.stemDataArrays[i][j];
                // Smoothly weight higher frequency bins more heavily (subtle high-pitch emphasis)
                const weight = 1.0 + (j / length) * 1.5; 
                sum += val * weight;
                weightSum += weight;
                if (val > max) max = val;
            }
            
            // Re-introduce subtle peak tracking + heavily weighted average
            const weightedAvg = sum / weightSum;
            return ((max * 0.3) + (weightedAvg * 0.7)) / 255.0;
        });

        return {
            lows: getAvg('lows'),
            mids: getAvg('mids'),
            highs: getAvg('highs'),
            stems: stems
        };
    }
}
