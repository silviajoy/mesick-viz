export class Recorder {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
    }

    start(canvas, audioDestinationStream) {
        this.recordedChunks = [];
        this.canvasStream = canvas.captureStream(60); // 60 FPS
        
        // Combine canvas video track + audio track
        const combinedStream = new MediaStream();
        this.canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));
        if (audioDestinationStream) {
            const stream = audioDestinationStream.stream || audioDestinationStream;
            stream.getAudioTracks().forEach(track => combinedStream.addTrack(track));
        }

        // Check supported mimetypes. WebM is usually best supported in browsers for recording
        let options = { mimeType: 'video/webm; codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }

        this.mediaRecorder = new MediaRecorder(combinedStream, options);

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.start();
        console.log("Recording started...");
    }

    stop() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) return resolve(null);
            
            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, {
                    type: 'video/webm'
                });
                
                // Cleanup canvas stream tracks to prevent memory leaks over multiple recordings
                if (this.canvasStream) {
                    this.canvasStream.getTracks().forEach(t => t.stop());
                    this.canvasStream = null;
                }
                
                resolve(blob);
            };
            
            if (this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            } else {
                resolve(null);
            }
        });
    }

    download(blob, filename = 'visualizer.webm') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }
}
