const express = require("express");
const { getRandomContents } = require("../utils/randomContents");
const { tokenize } = require("../utils/tokenize");
const { ChromaClient, OpenAIEmbeddingFunction } = require("chromadb");
const router = express.Router();
const sqlite3 = require("sqlite3").verbose();

const model_db_path = process.env.MODEL_DB_PATH || "models.db";
const db = new sqlite3.Database(model_db_path);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set");
}

const CHROMADB_HOST = process.env.CHROMADB_HOST || "localhost";

const chroma_url = `http://${CHROMADB_HOST}:8000`; // Or use process.env.CHROMA_SERVER_URL if set

const client = new ChromaClient({ path: chroma_url });

model = "text-embedding-3-small";

// Initialize the embedding function
const openai_ef = new OpenAIEmbeddingFunction({
  openai_api_key: OPENAI_API_KEY,
  openai_model: model,
});

async function queryCollection(collectionName, query) {
  const collection = await client.getCollection({
    name: collectionName,
    embeddingFunction: openai_ef,
  });
  const result = await collection.query({ queryTexts: [query], nResults: 2 });
  return result;
}

router.get("/api/collections", async (req, res) => {
  try {
    // List all collections
    const collections = await client.listCollections();
    res.json(collections);
  } catch (error) {
    console.error("Failed to fetch collections:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete('/v1/models/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM models WHERE id = ?';
  
  db.run(sql, [id], (err) => {
      if (err) {
          console.error(err.message);
          res.status(500).send('Failed to delete the model');
          return;
      }
      res.json({ success: true, message: 'Model deleted successfully' });
  });
});


router.post("/v1/models", (req, res) => {
  const { vectorDB, collection, embeddingFunction, description } = req.body;
  const modelDetailId = `${vectorDB}-${collection}-${embeddingFunction}`;
  const modelId = `LLMentor/${modelDetailId}`;
  const name = modelDetailId; // Since model detail ID and name are the same
  const type = "text"; // Static value
  const maxTokens = 4096; // Static value
  const created = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

  const sql = `INSERT INTO models (id, object, created, model_id, name, type, description, max_tokens, endpoint, owner, permissions) VALUES (?, 'model', ?, ?, ?, ?, ?, ?, 'http://mockai:5002', 'llmentor', 'read,write')`;

  db.run(
    sql,
    [modelId, created, modelDetailId, name, type, description, maxTokens],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed: models.id")) {
          // If the error is due to a unique constraint failure, send a custom message
          res
            .status(409)
            .send(
              "A model with the same ID already exists. Please choose different values."
            );
        } else {
          // Handle other errors
          console.error(err.message);
          res.status(500).send("Internal Server Error");
        }
        return;
      }
      res.send("Model added successfully");
    }
  );
});

router.get("/v1/models", (req, res) => {
  console.log("GET /v1/models");

  const sql = `SELECT * FROM models`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Internal Server Error");
      return;
    }

    // Transform rows to fit the expected response format
    const data = rows.map((row) => ({
      id: row.id,
      object: row.object,
      created: row.created,
      model_details: {
        id: row.model_id,
        name: row.name,
        type: row.type,
        description: row.description,
        created: row.created,
        max_tokens: row.max_tokens,
        endpoint: row.endpoint,
        owner: row.owner,
        permissions: row.permissions.split(","), // Assuming permissions are stored as a comma-separated string
      },
    }));

    res.json({ data });
  });
});

router.post("/v1/chat/completions", async (req, res) => {
  const defaultMockType = process.env.MOCK_TYPE || "random";
  const {
    messages,
    stream,
    mockType = defaultMockType,
    mockFixedContents,
    model,
  } = req.body;
  const randomResponses = getRandomContents();

  // Check if 'messages' is provided and is an array
  if (!messages || !Array.isArray(messages)) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid "messages" in request body' });
  }

  // Check if 'stream' is a boolean
  if (stream !== undefined && typeof stream !== "boolean") {
    return res.status(400).json({ error: 'Invalid "stream" in request body' });
  }

  // Get response content
  let content;
  switch (mockType) {
    case "echo":
      const query = messages[messages.length - 1].content;
      console.log(query);
      let answer = await queryCollection("jose_content", query);
      console.log(answer);
      let url = answer.metadatas[0][0]["url"];
      content = answer.documents[0][0] + "\n" + url;
      console.log(content);
      break;
    case "random":
      content =
        randomResponses[Math.floor(Math.random() * randomResponses.length)];
      break;
    case "fixed":
      content = mockFixedContents;
      break;
  }

  // Generate a mock response
  // If 'stream' is true, set up a Server-Sent Events stream
  if (stream) {
    // Set the headers for SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const data = {
      id: "chatcmpl-7UR4UcvmeD79Xva3UxkKkL2es6b5W",
      object: "chat.completion.chunk",
      created: Date.now(),
      model: model,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            content: "",
          },
          finish_reason: null,
        },
      ],
    };

    const intervalTime = 100;
    let chunkIndex = 0;
    let tokens = tokenize(content); // Tokenize the content
    let intervalId = setInterval(() => {
      if (chunkIndex < tokens.length) {
        data.choices[0].delta.content = tokens[chunkIndex];
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        chunkIndex++;
      } else {
        clearInterval(intervalId);
        data.choices[0] = {
          delta: {},
          finish_reason: "stop",
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    }, intervalTime);
  } else {
    const n = req.body.n || 1; // Get 'n' from request body, default to 1 if not provided
    const choices = [];

    for (let i = 0; i < n; i++) {
      choices.push({
        message: {
          role: "assistant",
          content: content,
        },
        finish_reason: "stop",
        index: i,
      });
    }

    const response = {
      id: "chatcmpl-2nYZXNHxx1PeK1u8xXcE1Fqr1U6Ve",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 50,
        total_tokens: 60,
      },
      choices: choices,
    };
    // Send the response
    res.json(response);
  }
});

module.exports = router;
