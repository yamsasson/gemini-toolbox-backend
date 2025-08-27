// File: server.js

// --- 1. SETUP ---
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch'); // Use node-fetch for making API requests

const app = express();

// --- 2. GLOBAL MIDDLEWARE ---
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // Middleware to parse incoming JSON requests

// --- 3. CONFIGURATION & CONSTANTS ---
// Get API keys from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SEARCH_API_KEY = process.env.SEARCH_API_KEY;
const CX_ID = process.env.CX_ID;

// In-memory usage tracker (resets when the server restarts)
const usageTracker = {};
const FREE_TRIAL_LIMIT = 20; // Max API calls per user

// --- 4. SHARED MIDDLEWARE ---

// Rate Limiter: Limits requests from a single user to prevent abuse
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each user to 10 requests per minute across all endpoints
    message: { error: "Too many requests, please try again after a minute." },
    keyGenerator: (req, res) => req.body.userId, // Use the user's ID to track requests
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth & Usage Middleware: Checks for user ID and enforces the free trial limit
const usageAndAuthMiddleware = (req, res, next) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: "Missing user ID." });
    }

    const userUsage = usageTracker[userId] || 0;
    if (userUsage >= FREE_TRIAL_LIMIT) {
        return res.status(429).json({
            error: "Free trial limit reached. Please add your own API key in the settings to continue."
        });
    }

    // Attach usage info to the request so the next function can use it
    req.userUsage = userUsage;
    next(); // All checks passed, proceed to the specific API logic
};


// --- 5. API ENDPOINTS ---

// Gemini Proxy Endpoint
app.post('/api/gemini-proxy', apiLimiter, usageAndAuthMiddleware, async (req, res) => {
    const { userId, geminiPayload } = req.body;
    const userUsage = req.userUsage;

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    try {
        const apiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        const data = await apiResponse.json();

        if (apiResponse.ok) {
            // Increment usage count only on a successful API call
            usageTracker[userId] = userUsage + 1;
            console.log(`User ${userId} usage: ${usageTracker[userId]}/${FREE_TRIAL_LIMIT}`);
            res.json(data);
        } else {
            res.status(apiResponse.status).json(data);
        }

    } catch (error) {
        console.error('Gemini Proxy Error:', error);
        res.status(500).json({ error: "An error occurred on the proxy server." });
    }
});

// **NEW** Search Proxy Endpoint
app.post('/api/search-proxy', apiLimiter, usageAndAuthMiddleware, async (req, res) => {
    const { userId, searchPayload } = req.body;
    const userUsage = req.userUsage;

    if (!searchPayload || !searchPayload.query) {
        return res.status(400).json({ error: 'Missing search query in request body' });
    }
    
    if (!SEARCH_API_KEY || !CX_ID) {
        console.error("Server is missing Search API Key or CX ID");
        return res.status(500).json({ error: "Server configuration error." });
    }
    
    const { query, startIndex } = searchPayload;
    const fields = "items(link,image/thumbnailLink,displayLink,image/contextLink),searchInformation";
    const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${SEARCH_API_KEY}&cx=${CX_ID}&q=${encodeURIComponent(query)}&searchType=image&imgSize=large&num=10&start=${startIndex || 1}&fields=${encodeURIComponent(fields)}`;

    try {
        const apiResponse = await fetch(apiUrl);
        const data = await apiResponse.json();

        if (apiResponse.ok) {
            // Increment usage count only on a successful API call
            usageTracker[userId] = userUsage + 1;
            console.log(`User ${userId} usage: ${usageTracker[userId]}/${FREE_TRIAL_LIMIT}`);
            res.json(data);
        } else {
            res.status(apiResponse.status).json(data);
        }
    } catch (error) {
        console.error('Search Proxy Error:', error);
        res.status(500).json({ error: "An error occurred on the proxy server." });
    }
});


// --- 6. START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));