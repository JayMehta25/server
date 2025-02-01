const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const PORT = 5000;

// Enable CORS for frontend communication
app.use(
    cors({
        origin: "*", // Allow all origins (frontend URL from ngrok or localhost)
        methods: ["GET", "POST"],
    })
);

// Create HTTP server
const server = http.createServer(app);

// Attach WebSocket Server
const io = new Server(server, {
    cors: {
        origin: "*", // Allow WebSocket connections from any origin
        methods: ["GET", "POST"],
    },
});

// Store active chat rooms and users
const chatRooms = {}; // { roomCode: [{ socketId, username }] }

// Generate a random 5-digit room code
const generateRoomCode = () => Math.floor(10000 + Math.random() * 90000).toString();

// Test endpoint to verify server is running
app.get("/", (req, res) => {
    res.send("Chat server is running...");
});

app.get("/favicon.ico", (req, res) => {
    res.status(204).send(); // Respond with "No Content"
});

// Handle WebSocket connections
io.on("connection", (socket) => {
    console.log("🔵 New user connected:", socket.id);

    // Create a new chat room
    socket.on("createRoom", (username) => {
        if (!username || username.trim() === "") {
            socket.emit("error", "Username is required to create a room.");
            return;
        }

        const roomCode = generateRoomCode();
        chatRooms[roomCode] = [{ socketId: socket.id, username }]; // Store room with first user
        socket.join(roomCode);
        console.log(`✅ Room created: ${roomCode} by ${username}`);
        socket.emit("roomCreated", roomCode); // Send room code to client
        io.to(roomCode).emit("userCount", chatRooms[roomCode].length); // Send user count
    });

    // Join an existing chat room
    socket.on("joinRoom", (data) => {
        if (!data || !data.roomCode || !data.username) {
            console.log("❌ Error: Room code or username missing in joinRoom request.");
            socket.emit("error", "Room code and username are required to join.");
            return;
        }

        const trimmedRoomCode = data.roomCode.trim();
        const username = data.username.trim();

        console.log(`🔍 Join request received for room: ${trimmedRoomCode}`);

        if (chatRooms[trimmedRoomCode]) {
            chatRooms[trimmedRoomCode].push({ socketId: socket.id, username });
            socket.join(trimmedRoomCode);
            console.log(`✅ User ${username} joined room: ${trimmedRoomCode}`);
            socket.emit("roomJoined", trimmedRoomCode);
            io.to(trimmedRoomCode).emit("userCount", chatRooms[trimmedRoomCode].length); // Send updated user count
            io.to(trimmedRoomCode).emit("receiveMessage", { username: "System", message: `${username} has joined the room!` });
        } else {
            console.log(`❌ Room ${trimmedRoomCode} does not exist!`);
            socket.emit("error", "Room does not exist.");
        }
    });

    // Handle real-time messages
    socket.on("sendMessage", ({ roomCode, username, message }) => {
        if (!roomCode || !username || !message) {
            socket.emit("error", "Message sending failed: Missing required fields.");
            return;
        }

        console.log(`📨 Message from ${username} in Room ${roomCode}: ${message}`);
        io.to(roomCode).emit("receiveMessage", { username, message }); // Broadcast message with username
    });

    // Handle user disconnection
    socket.on("disconnect", () => {
        console.log("🔴 User disconnected:", socket.id);

        // Find and remove the user from their room
        for (const roomCode in chatRooms) {
            const userIndex = chatRooms[roomCode].findIndex((user) => user.socketId === socket.id);

            if (userIndex !== -1) {
                const username = chatRooms[roomCode][userIndex].username;
                chatRooms[roomCode].splice(userIndex, 1); // Remove user from the room

                // Notify remaining users
                io.to(roomCode).emit("userCount", chatRooms[roomCode].length);
                io.to(roomCode).emit("receiveMessage", { username: "System", message: `${username} has left the room.` });

                // Delete the room if empty
                if (chatRooms[roomCode].length === 0) {
                    delete chatRooms[roomCode];
                    console.log(`🚪 Room ${roomCode} deleted as it is empty.`);
                }
                break;
            }
        }
    });
});

// Start the backend server
server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
