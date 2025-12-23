const express = require("express");
const { bgRed, bgYellow, bgBlue, bgMagenta } = require("colorette");
const dotenv = require("dotenv");
const { connectDB, disconnectDB } = require("./database/database");

dotenv.config();

const PORT = process.env.PORT;
const MONGODB_URI = process.env.MONGODB_URI;

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("Wellcome to Cypher Sentinel API 🥳"));

let server;

async function start() {
  try {
    await connectDB(MONGODB_URI);
    console.log(bgMagenta("Connected to MongoDB"));

    server = app.listen(PORT, () => {
      console.log(bgBlue(`Server listening on port ${PORT}`));
    });
  } catch (err) {
    console.error(bgRed("Failed to start app:"), err);
    process.exit(1);
  }
}

function gracefulShutdown() {
  console.log(bgYellow("Shutting down..."));
  Promise.resolve()
    .then(() => disconnectDB())
    .then(() => {
      if (server) server.close(() => process.exit(0));
      else process.exit(0);
    })
    .catch((err) => {
      console.error(bgRed("Error during shutdown"), err);
      process.exit(1);
    });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

start();
