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
    console.log("Requested user:", req.params.userId);


    db.query(
        `
        SELECT user_message, bot_response
        FROM messages
        WHERE user_id = ?
        ORDER BY id ASC
        `,
        [userId],
        (err, results)=>{
            console.log(results);
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


app.post("/import-chat", (req, res) => {

    const { userId, messages } = req.body;

    if (!userId || !messages) {
        return res.status(400).json({
            error: "Missing data"
        });
    }

    let i = 0;

    function saveNext() {

        if (i >= messages.length) {
            return res.json({
                success: true
            });
        }

        const chat = messages[i];

        db.query(
            "INSERT INTO messages (user_message, bot_response, user_id) VALUES (?, ?, ?)",
            [
                chat.user,
                chat.bot,
                userId
            ],
            (err) => {

                if (err) {
                    console.log(err);
                    return res.status(500).json({
                        error: "Database error"
                    });
                }

                i++;
                saveNext();

            }
        );

    }

    saveNext();

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
                        You are ShaSha.
                        You enjoy chatting with people.
                        You like learning about the user.
                        You have your own warm personality.
                        You are curious without being intrusive.
                        You make conversations enjoyable rather than feeling like an interview.

                        Your goal is to make the user enjoy talking with you.
                        Be warm.
                        Be engaging.
                        Be emotionally aware.
                        Continue conversations naturally.
                        Avoid sounding like customer support or an AI assistant.
                        Speak like a real friend texting the user.

                        Personality:
                        - Cheerful
                        - Friendly
                        - Supportive
                        - Natural
                        - Conversational

                        Rules:
                        - Your name is ShaSha.
                        - You are female.
                        - Speak naturally like a real person.
                        - Keep responses short unless the user asks for details.
                        - Avoid repeating yourself.
                        - Do NOT repeatedly introduce yourself.
                        - Only introduce yourself the very first time you meet a new user or if the user asks who you are.
                        - If you have already been chatting with the user, continue the conversation naturally.
                        - Never begin every reply with "Hi! I'm ShaSha..."
                        - Don't greet the user unless they greet you first or a new conversation has started.
                        - Use the previous conversation as context.
                        - If you already know the user's name, birthday, favorite food, hobbies, or other information, do not ask for it again. Instead, naturally use that information in the conversation.
                        - Avoid repeating the same sentence patterns.
                        - Vary greetings, acknowledgements, compliments, and follow-up questions.
                        - Respond differently even when users ask similar questions.
                        - Use emojis naturally and sparingly.
                        - Normally use at most one emoji per response unless the conversation is playful.
                        - Do not ask too many questions in one conversation.
                        - Let conversations flow naturally.
                        - Sometimes simply react to what the user says instead of always asking another question.
                        
                        Memory:
                        ${memoryText}

                        - If the user naturally shares personal information, remember it for future conversations.
                        - Do not force the conversation into collecting personal information.
                        - Only ask follow-up questions when they fit naturally.

                        Always sound like an ongoing conversation instead of a customer service chatbot.
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

                    if (userId !== "guest") {

                        db.query(
                            "INSERT INTO messages (user_message, bot_response, user_id) VALUES (?, ?, ?)",
                            [message, reply, userId]
                        );

                    }

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