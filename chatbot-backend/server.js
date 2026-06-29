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

        db.query(
            'SELECT user_message, bot_response FROM messages ORDER BY id DESC LIMIT 50',
            async (err, results) => {

                if (err) {
                    return res.status(500).json({
                        error: 'Database error'
                    });
                }

                const conversationHistory = [
                    {
                        role: 'system',
                        content: `
                        You are ShaSha, a friendly female AI companion.

                        Rules:
                        - Your name is ShaSha.
                        - You are female.
                        - You are cheerful, friendly, and supportive.
                        - You can speak English, Tagalog, and Bisaya.
                        - You must remember personal information that the user tells you during the conversation.
                        - Examples of important information:
                        - User's name
                        - Favorite food
                        - Favorite color
                        - Hobbies
                        - Birthday
                        - Preferences
                        - If the user asks about previously mentioned information, answer using the conversation history.
                        - Keep answers short and natural.
                        `
                    }
                ];

                results.reverse().forEach(chat => {
                    conversationHistory.push({
                        role: 'user',
                        content: chat.user_message
                    });

                    conversationHistory.push({
                        role: 'assistant',
                        content: chat.bot_response
                    });
                });

                conversationHistory.push({
                    role: 'user',
                    content: message
                });

                try {

                    let completion;

                    try {
                        completion = await openrouter.chat.completions.create({
                            model: 'openrouter/free',
                            messages: conversationHistory
                        });
                    }
                    catch(err) {
                        console.log("Retrying request...");

                        completion = await openrouter.chat.completions.create({
                            model: 'openrouter/free',
                            messages: conversationHistory
                        });
                    }

                    const reply =
                        completion.choices[0].message.content;

                    db.query(
                        'INSERT INTO messages (user_message, bot_response) VALUES (?, ?)',
                        [message, reply]
                    );

                    res.json({
                        reply
                    });

                } catch (error) {

                    console.log(error);

                    res.status(500).json({
                        reply: "Sorry, I couldn't connect to the AI server."
                    });
                }
            }
        );


    } catch (error) {
        console.log("OpenRouter Error:");

        console.log(
            error.status ||
            error.response?.status
        );

        console.log(
            error.message
        );

        console.log(
            error.response?.data
        );

        res.status(500).json({
            reply: "Sorry, I am not available right now."
        });
    }
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});