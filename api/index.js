const express = require('express');
const multer = require('multer');
const { Canvas, Image, loadImage } = require('canvas');

// =========================================================
// 1. THE BROWSER SIMULATOR (Fixes all "not defined" errors)
// =========================================================
global.window = global;

// FIX FOR THE ERROR YOU JUST SAW:
// We define a dummy class so the library's "instanceof" check works
global.HTMLVideoElement = class {}; 

// Other required browser globals
global.HTMLImageElement = Image;
global.HTMLCanvasElement = Canvas;
global.HTMLElement = class {}; // Generic element mock

// Mock Document (The library asks this to create elements)
global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') return new Canvas(224, 224);
        if (tag === 'img') return new Image();
        return { style: {} };
    },
    body: { appendChild: () => {} }
};
// =========================================================


// 2. LOAD LIBRARIES (Must happen AFTER the section above)
const tf = require('@tensorflow/tfjs');
const tmImage = require('@teachablemachine/image');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIGURATION ---
const URL = "https://teachablemachine.withgoogle.com/models/nxq6v0lNm/"; 
let model;

async function loadModel() {
    if (model) return model;
    console.log("Loading model...");
    model = await tmImage.load(URL + "model.json", URL + "metadata.json");
    return model;
}

app.post('/api/check', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });

        // 1. Load the Image
        const image = await loadImage(req.file.buffer);

        // 2. MANUAL CROP (To 224x224)
        // We do this manually to avoid the library trying to resize it (which causes errors)
        const canvas = new Canvas(224, 224);
        const ctx = canvas.getContext('2d');
        
        // Center Crop logic
        const minSize = Math.min(image.width, image.height);
        const startX = (image.width - minSize) / 2;
        const startY = (image.height - minSize) / 2;
        ctx.drawImage(image, startX, startY, minSize, minSize, 0, 0, 224, 224);

        // 3. Predict
        const loadedModel = await loadModel();
        
        // Pass the canvas directly. The library sees it's a Canvas and skips the Video check.
        const prediction = await loadedModel.predict(canvas);

        // 4. Results
        let highestScore = 0;
        let status = "Unknown";

        prediction.forEach(p => {
            if (p.probability > highestScore) {
                highestScore = p.probability;
                status = p.className;
            }
        });

        res.json({
            status: status,
            confidence: (highestScore * 100).toFixed(2),
            is_damaged: status.toLowerCase().includes("damaged")
        });

    } catch (error) {
        console.error("Analysis Error:", error);
        res.status(500).json({ 
            error: "Analysis failed", 
            details: error.message,
            stack: error.stack 
        });
    }
});

app.get('/', (req, res) => res.send("✅ Box API is Online"));

module.exports = app;
