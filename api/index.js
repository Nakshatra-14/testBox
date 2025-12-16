const express = require('express');
const multer = require('multer');
const { Canvas, Image, loadImage } = require('canvas');

// --- 1. ROBUST POLYFILLS ---
global.window = global;
global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') return new Canvas(224, 224);
        if (tag === 'img') return new Image();
        return { style: {} }; // Dummy object for other tags
    },
    body: { appendChild: () => {} }
};
global.HTMLCanvasElement = Canvas;
global.HTMLImageElement = Image;
global.HTMLElement = Object; // Generic element
global.Image = Image; // Important alias

// --- 2. LOAD LIBRARIES ---
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
    // Force the model to load without trying to use browser-specific APIs
    model = await tmImage.load(URL + "model.json", URL + "metadata.json");
    return model;
}

app.post('/api/check', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });

        // 1. Load the Image
        const image = await loadImage(req.file.buffer);
        
        // DEBUG: Check if image loaded correctly
        if (!image.width || image.width === 0) {
            throw new Error("Image loaded but has 0 width. File might be corrupt.");
        }

        // 2. MANUAL PRE-PROCESSING (The Fix for IndexSizeError)
        // We crop/resize it ourselves to 224x224 so tmImage doesn't have to calculate it
        const canvas = new Canvas(224, 224);
        const ctx = canvas.getContext('2d');
        
        // Simple "Cover" fit (Center Crop)
        const minSize = Math.min(image.width, image.height);
        const startX = (image.width - minSize) / 2;
        const startY = (image.height - minSize) / 2;
        
        // Draw the center square of the image into our 224x224 canvas
        ctx.drawImage(image, startX, startY, minSize, minSize, 0, 0, 224, 224);

        // 3. Load Model & Predict
        const loadedModel = await loadModel();
        
        // Pass the ALREADY RESIZED canvas. 
        // We use 'predict' which expects a clean input.
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
            is_damaged: status.toLowerCase().includes("damaged"),
            debug_info: {
                original_width: image.width,
                original_height: image.height
            }
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

// Health Check
app.get('/', (req, res) => res.send("✅ API is Online"));

module.exports = app;
