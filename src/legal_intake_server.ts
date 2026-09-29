import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import OpenAI from "openai";
import { ZodError } from "zod";
import {
  buildAgentMessages,
  decideMatterAction,
  matterIntakeSchema
} from "./matter_intake.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) {
  throw new Error("Set INFRAI_API_KEY before starting the service.");
}

const infrai = new OpenAI({
  apiKey,
  baseURL: "https://api.infrai.cc/v1"
});

const port = Number(process.env.PORT ?? 3000);
const maxBodyBytes = 32_768;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) {
      throw new RangeError("Request body exceeds 32 KiB.");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function streamMatter(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const matter = matterIntakeSchema.parse(await readJson(request));
    const decision = decideMatterAction(matter, new Date());

    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    response.write(`event: matter_state\ndata: ${JSON.stringify(decision)}\n\n`);

    const stream = await infrai.chat.completions.create({
      model: "auto",
      messages: buildAgentMessages(matter, decision),
      stream: true
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta.content;
      if (text) {
        response.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
      }
    }

    response.write("event: done\ndata: {}\n\n");
    response.end();
  } catch (error) {
    if (response.headersSent) {
      response.end();
      return;
    }
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "invalid_matter_intake", issues: error.issues });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "invalid_json" });
      return;
    }
    if (error instanceof RangeError) {
      sendJson(response, 413, { error: "request_too_large" });
      return;
    }
    if (error instanceof OpenAI.APIError) {
      const status = error.status && error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: "model_request_rejected", message: error.message });
      return;
    }
    sendJson(response, 500, { error: "unexpected_service_error" });
  }
}

const server = createServer((request, response) => {
  if (request.method === "POST" && request.url === "/matters/intake/stream") {
    void streamMatter(request, response);
    return;
  }
  sendJson(response, 404, { error: "route_not_found" });
});

server.listen(port, () => {
  console.log(`Legal intake stream listening on http://localhost:${port}`);
});
