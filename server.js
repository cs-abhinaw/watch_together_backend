const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { members: [], videoUrl: "" };  // Initialize videoUrl if room doesn't exist
    }

    // Add the new member to the room
    rooms[roomId].members.push({ id: socket.id, username: name });
    socket.join(roomId);

    // Emit the updated list of members and the current video URL
    io.to(roomId).emit("update-members", rooms[roomId].members);
    io.to(roomId).emit("change-video", rooms[roomId].videoUrl);  // Send current videoUrl to new member
  });

  socket.on("send-message", ({ roomId, username, message }) => {
    io.to(roomId).emit("receive-message", { username, message });
  });

  socket.on("change-video", ({ roomId, url }) => {
    rooms[roomId].videoUrl = url;
    io.to(roomId).emit("change-video", url);  // Broadcast to all members in the room
  });

  socket.on("play", (roomId) => {
    io.to(roomId).emit("play");
  });

  socket.on("pause", (roomId) => {
    io.to(roomId).emit("pause");
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId].members = rooms[roomId].members.filter(m => m.id !== socket.id);
      
      // Emit the updated member list
      io.to(roomId).emit("update-members", rooms[roomId].members);

      // Clean up the room if no members are left
      if (rooms[roomId].members.length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
