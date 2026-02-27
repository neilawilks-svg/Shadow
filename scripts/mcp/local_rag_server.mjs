#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const RAG_DIR = path.join(process.cwd(), "local", "rag-store");
const CHUNKS_PATH = path.join(RAG_DIR, "chunks.jsonl");
const INDEX_PATH = path.join(RAG_DIR, "index.json");

/** @type {Map<string, any>} */
let chunksById = new Map();
/** @type {Map<string, any>} */
let docsById = new Map();
/** @type {Map<string, string[]>} */
let termsIndex = new Map();

function tokenize(query) {
  return (query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).slice(0, 48);
}

async function loadStore() {
  chunksById = new Map();
  docsById = new Map();
  termsIndex = new Map();

  try {
    const rawChunks = await fs.readFile(CHUNKS_PATH, "utf8");
    for (const line of rawChunks.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const chunk = JSON.parse(line);
      chunksById.set(chunk.chunk_id, chunk);
    }
  } catch {
    // no-op
  }

  try {
    const rawIndex = await fs.readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(rawIndex);
    for (const doc of parsed.documents ?? []) {
      docsById.set(doc.id, doc);
    }
    for (const [term, chunkIds] of Object.entries(parsed.terms ?? {})) {
      termsIndex.set(term, Array.isArray(chunkIds) ? chunkIds : []);
    }
  } catch {
    // no-op
  }
}

function scoreChunk(chunk, tokens) {
  if (!chunk || tokens.length === 0) {
    return 0;
  }

  const text = String(chunk.text ?? "").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (text.includes(token)) {
      score += 1;
    }
  }

  if (tokens.length > 0) {
    score = score / tokens.length;
  }
  return Number(score.toFixed(4));
}

const server = new McpServer({
  name: "local-rag-store",
  version: "1.0.0",
});

server.registerTool(
  "rag.search",
  {
    description: "Search local RAG chunks with lexical matching and return ranked evidence.",
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(30).optional(),
      tag: z.string().optional(),
      person: z.string().optional(),
      doc_ids: z.array(z.string()).max(300).optional(),
    },
  },
  async ({ query, limit = 8, tag, person, doc_ids }) => {
    await loadStore();

    const tokens = tokenize(query);
    const candidateIds = new Set();

    if (tokens.length > 0) {
      for (const token of tokens) {
        const chunkIds = termsIndex.get(token) ?? [];
        for (const chunkId of chunkIds) {
          candidateIds.add(chunkId);
        }
      }
    }

    if (candidateIds.size === 0) {
      for (const chunkId of chunksById.keys()) {
        candidateIds.add(chunkId);
      }
    }

    const results = [];
    for (const chunkId of candidateIds) {
      const chunk = chunksById.get(chunkId);
      if (!chunk) {
        continue;
      }
      if (Array.isArray(doc_ids) && doc_ids.length > 0 && !doc_ids.includes(chunk.doc_id)) {
        continue;
      }
      if (tag && !Array.isArray(chunk.tags)?.includes(tag)) {
        continue;
      }
      if (person && !Array.isArray(chunk.people)?.includes(person)) {
        continue;
      }

      const score = scoreChunk(chunk, tokens);
      if (score <= 0 && tokens.length > 0) {
        continue;
      }

      results.push({
        doc_id: chunk.doc_id,
        chunk_id: chunk.chunk_id,
        score,
        text: chunk.text,
        source_path: chunk.source_path,
        tags: chunk.tags ?? [],
        meeting_date: chunk.meeting_date ?? null,
        people: chunk.people ?? [],
      });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.doc_id !== b.doc_id) {
        return String(a.doc_id).localeCompare(String(b.doc_id));
      }
      return String(a.chunk_id).localeCompare(String(b.chunk_id));
    });

    const selected = results.slice(0, limit);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: selected.length, results: selected }, null, 2),
        },
      ],
      structuredContent: {
        count: selected.length,
        results: selected,
      },
    };
  },
);

server.registerTool(
  "rag.get_chunk",
  {
    description: "Get a single chunk by chunk id.",
    inputSchema: {
      chunk_id: z.string().min(1),
    },
  },
  async ({ chunk_id }) => {
    await loadStore();
    const chunk = chunksById.get(chunk_id) ?? null;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ chunk }, null, 2),
        },
      ],
      structuredContent: { chunk },
    };
  },
);

server.registerTool(
  "rag.list_documents",
  {
    description: "List indexed documents in the local RAG store.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async ({ limit = 100 }) => {
    await loadStore();
    const documents = [...docsById.values()].slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: documents.length, documents }, null, 2),
        },
      ],
      structuredContent: { count: documents.length, documents },
    };
  },
);

server.registerTool(
  "rag.get_document",
  {
    description: "Get indexed document metadata by doc id.",
    inputSchema: {
      doc_id: z.string().min(1),
    },
  },
  async ({ doc_id }) => {
    await loadStore();
    const document = docsById.get(doc_id) ?? null;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ document }, null, 2),
        },
      ],
      structuredContent: { document },
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("local-rag-store MCP server running on stdio");
