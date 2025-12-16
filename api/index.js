const express = require('express');
const multer = require('multer');
const tf = require('@tensorflow/tfjs');
const tmImage = require('@teachablemachine/image');
const { Canvas, Image, loadImage } = require('canvas');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// --- CONFIGURATION ---
const URL = "https://teachablemachine.withgoogle.com/models/nxq6v0lNm/"; 
// ---------------------

// Polyfill HTML/Window environment for Node.js
global.window = global;
global.HTMLCanvasElement = Canvas;
global.HTMLImageElement = Image;
// ------------------------------------------

let model;

// Load model function (with caching for "Warm" serverless functions)
async function loadModel() {
    if (model) return model; // If already loaded, reuse it
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";
    model = await tmImage.load(modelURL, metadataURL);
    return model;
}

// THE API ROUTE
app.post('/api/check', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });

        // 1. Load Model
        const loadedModel = await loadModel();

        // 2. Process Image
        const image = await loadImage(req.file.buffer);
        
        // Create a fake canvas for the AI to "see"
        const canvas = new Canvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        // 3. Predict
        const prediction = await loadedModel.predict(canvas);

        // 4. Find the winner
        let highestScore = 0;
        let status = "Unknown";
        
        prediction.forEach(p => {
            if (p.probability > highestScore) {
                highestScore = p.probability;
                status = p.className;
            }
        });

        // 5. Return JSON
        res.json({
            status: status,
            confidence: (highestScore * 100).toFixed(2),
            is_damaged: status.toLowerCase().includes("damaged")
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Analysis failed", details: error.message });
    }
});

// Default route to check if server is running
app.get('/', (req, res) => res.send("Box Inspector API is Online! 📦"));

module.exports = app;
