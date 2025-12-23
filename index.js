const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT;
const MONGODB_URI = process.env.MONGODB_URI;

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Wellcome to Cypher Sentinel API 🥳"));

let server;

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB");

    server = app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start app:", err);
    process.exit(1);
  }
}

function gracefulShutdown() {
  console.log("Shutting down...");
  Promise.resolve()
    .then(() => mongoose.disconnect())
    .then(() => {
      if (server) server.close(() => process.exit(0));
      else process.exit(0);
    })
    .catch((err) => {
      console.error("Error during shutdown", err);
      process.exit(1);
    });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

start();
