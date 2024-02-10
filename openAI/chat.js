const express = require("express");
const { getRandomContents } = require("../utils/randomContents");
const { tokenize } = require("../utils/tokenize");
const { ChromaClient, OpenAIEmbeddingFunction } = require("chromadb");
const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable not set");
}

const CHROMADB_HOST = process.env.CHROMADB_HOST;

const chroma_url = `http://${CHROMADB_HOST}:8000`; // Or use process.env.CHROMA_SERVER_URL if set

const client = new ChromaClient({ path: chroma_url });

model = 'text-embedding-3-small';

// Initialize the embedding function
const openai_ef = new OpenAIEmbeddingFunction({
  openai_api_key: OPENAI_API_KEY, openai_model: model 
});

async function queryCollection(collectionName, query) {
  const collection = await client.getCollection({
    name: collectionName,
    embeddingFunction: openai_ef,
  });
  const result = await collection.query({ queryTexts: [query], nResults: 2 });
  return result;
}

router.get("/v1/models", (req, res) => {
  console.log("GET /v1/models");

  const response = {
    data: [
      {
        id: "LLMentor/spectrum-128k",
        object: "model",
        created: 1619110515,
        model_details: {
          id: "text-davinci-003",
          name: "Davinci",
          type: "text",
          description:
            "Davinci is a general purpose AI model created by OpenAI. It is the successor to GPT-3.",
          created: 1619110515,
          max_tokens: 4096,
          endpoint: "https://api.openai.com",
          owner: "openai",
          permissions: ["read", "write"],
        },
      },
    ],
  };

  res.json(response);
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
      console.log(answer)
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
