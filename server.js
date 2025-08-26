require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const app = express();

app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const usageTracker = {}; 
const FREE_TRIAL_LIMIT = 20; 

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Limit each user to 5 requests per minute
    message: { error: "Too many requests, please try again after a minute." },
    keyGenerator: (req, res) => req.body.userId,
    standardHeaders: true, 
    legacyHeaders: false,
});

app.post('/api/gemini-proxy', apiLimiter, async (req, res) => {
    const userId = req.body.userId;

    if (!userId) {
        return res.status(400).json({ error: "Missing user ID." });
    }

    const userUsage = usageTracker[userId] || 0;
    if (userUsage >= FREE_TRIAL_LIMIT) {
        return res.status(429).json({ 
            error: "Free trial limit reached. Please add your own API key in the settings to continue." 
        });
    }

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const apiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body.geminiPayload)
        });

        const data = await apiResponse.json();

        if (apiResponse.ok) {
            usageTracker[userId] = userUsage + 1;
            console.log(`User ${userId} usage: ${usageTracker[userId]}/${FREE_TRIAL_LIMIT}`);
            res.json(data);
        } else {
            res.status(apiResponse.status).json(data);
        }

    } catch (error) {
        res.status(500).json({ error: "An error occurred on the proxy server." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));