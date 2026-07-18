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

// Register/Login User
app.post('/register', (req, res) => {

    const { name, email } = req.body;


    if (!name || !email) {
        return res.status(400).json({
            error: "Name and email are required"
        });
    }


    // Check if user already exists

    db.query(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (err, results) => {

            if (err) {
                return res.status(500).json({
                    error: "Database error"
                });
            }


            // Existing user

            if (results.length > 0) {

                const user = results[0];

                return res.json({
                    message: `Welcome back ${user.name}!`,
                    userId: user.id,
                    name: user.name
                });

            }



            // Create new user

            db.query(
                "INSERT INTO users (name,email) VALUES (?,?)",
                [name,email],
                (err,result)=>{

                    if(err){
                        return res.status(500).json({
                            error:"Cannot create user"
                        });
                    }


                    res.json({

                        message:`Nice to meet you ${name}!`,
                        userId: result.insertId,
                        name:name

                    });

                }
            );


        }
    );

});

//Guest Route
app.post("/guest", (req, res) => {

    const guestName = "Guest";
    const guestToken = "guest_" + Date.now();

    db.query(
        `
        INSERT INTO users
        (name,email,user_type,guest_token)
        VALUES (?,?,?,?)
        `,
        [
            guestName,
            null,
            "guest",
            guestToken
        ],
        (err, result) => {

            if (err) {
                console.error("Guest Route Error:");
                console.error(err);

                return res.status(500).json({
                    error: err.message
                });
            }

            res.json({
                userId: result.insertId,
                name: guestName,
                type: "guest",
                guestToken: guestToken
            });

        }
    );

});

// Get previous messages
app.get('/messages/:userId', (req, res) => {

    const userId = req.params.userId;


    db.query(
        `
        SELECT user_message, bot_response
        FROM messages
        WHERE user_id = ?
        ORDER BY id ASC
        `,
        [userId],
        (err, results)=>{

            if(err){
                return res.status(500).json({
                    error:"Database error"
                });
            }


            const chatHistory = [];


            results.forEach(chat=>{

                chatHistory.push({
                    sender:"user",
                    text:chat.user_message
                });


                chatHistory.push({
                    sender:"ShaSha",
                    text:chat.bot_response
                });

            });


            res.json(chatHistory);

        }
    );

});

// Test API
app.post('/chat', async (req, res) => {
    try {
        const { message, userId } = req.body;

        db.query(
            'SELECT user_message, bot_response FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 50',
            [userId],
            async (err, results) => {

                if (err) {
                    return res.status(500).json({
                        error: 'Database error'
                    });
                }

                db.query(
                    "SELECT memory_key, memory_value FROM user_memory WHERE user_id = ?",
                    [userId],
                    async (memoryErr, memories) => {

                        let memoryText = "";

                        memories.forEach(memory => {
                            memoryText += `${memory.memory_key}: ${memory.memory_value}\n`;
                        });

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
                        - Keep answers short and natural.

                        You must remember important information that the user tells you, such as:
                        - User's name
                        - Favorite food
                        - Favorite color
                        - Hobbies
                        - Birthday
                        - Preferences
                        - Family members
                        - Pets
                        - Work or school information

                        The following information is already known about the user:

                        ${memoryText}

                        If the user asks about previously mentioned information, first use the known information above before saying you don't know.

                        Examples:
                        User: "My name is Christian."
                        Assistant: "Nice to meet you, Christian!"

                        User: "My favorite food is balot."
                        Assistant: "Balot is an interesting favorite food!"

                        Later:
                        User: "What is my favorite food?"
                        Assistant: "Your favorite food is balot."

                        Always stay in character as ShaSha.
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

                    let reply =
                    completion.choices[0].message.content;

                    reply = reply.replace(
                    /User Safety:.*?Response Safety:.*?/gi,
                    ""
                    ).trim();
                    
                    // Save user's name
                    if (message.toLowerCase().includes("my name is")) {
                        const name = message.split("is")[1].trim();

                        db.query(
                            "INSERT INTO user_memory (memory_key, memory_value, user_id) VALUES (?, ?, ?)",
                            ["name", name, userId]
                        );
                    }

                    // Save favorite food
                    if (message.toLowerCase().includes("my favorite food is")) {
                        const food = message.split("is")[1].trim();

                        db.query(
                            "INSERT INTO user_memory (memory_key, memory_value, user_id) VALUES (?, ?, ?)",
                            ["favorite_food", food, userId]
                        );
                    }

                    db.query(
                        'INSERT INTO messages (user_message, bot_response, user_id) VALUES (?, ?, ?)',
                        [message, reply, userId]
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
            });
    });

        
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

app.get("/messages", (req, res) => {

    db.query(
        "SELECT user_message, bot_response FROM messages ORDER BY id ASC LIMIT 100",
        (err, results) => {

            if (err) {
                return res.status(500).json({
                    error: "Database error"
                });
            }

            const history = [];

            results.forEach(chat => {

                history.push({
                    sender: "user",
                    text: chat.user_message
                });

                history.push({
                    sender: "ShaSha",
                    text: chat.bot_response
                });

            });

            res.json(history);

        }
    );

});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});