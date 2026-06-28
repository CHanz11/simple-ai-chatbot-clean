require('dotenv').config();

const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const axios = require("axios");
const OpenAI = require('openai');

const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1'
});

const app = express();

app.use(cors());
app.use(express.json());

// MySQL Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "chatbot_db"
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err);
    } else {
        console.log("Connected to MySQL!");
    }
});

// Test API
app.post('/chat', async (req, res) => {
    try {
        const { message } = req.body;

        const completion = await openrouter.chat.completions.create({
            model: 'google/gemma-4-31b-it:free',
            messages: [
                {
                    role: 'system',
                    content: 'You are a friendly chatbot that talks naturally about daily life.'
                },
                {
                    role: 'user',
                    content: message
                }
            ]
        });

        const reply = completion.choices[0].message.content;

        db.query(
            'INSERT INTO messages (user_message, bot_response) VALUES (?, ?)',
            [message, reply]
        );

        res.json({
            reply
        });

    } catch (error) {
        console.error(
            error.response?.data ||
            error.message ||
            error
        );

        res.status(500).json({
            error: error.response?.data || error.message
        });
    }
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});