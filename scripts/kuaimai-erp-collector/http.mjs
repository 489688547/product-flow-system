import http from "node:http";
import https from "node:https";

export async function nodeRequest(url, options = {}) {
  const target = new URL(url);
  const transport = target.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: options.method || "GET",
      headers: options.headers || {},
      timeout: 30_000
    }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode || 500,
        headers: response.headers
      })));
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("请求超时。"), { code: "KUAIMAI_HTTP_TIMEOUT" })));
    request.on("error", reject);
    if (options.body != null) request.write(options.body);
    request.end();
  });
}
