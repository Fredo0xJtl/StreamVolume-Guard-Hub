const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const preferredPort = Number(process.env.WLG_TEST_PORT || 8787);

function contentTypeFor(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8"
  }[path.extname(filePath)] || "application/octet-stream";
}

function createServer() {
  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const requestedPath = decodeURIComponent(url.pathname.slice(1)) || "test-page.html";
    const filePath = path.resolve(root, requestedPath);

    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": "no-store"
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

function listen(port) {
  const server = createServer();

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < preferredPort + 20) {
      listen(port + 1);
      return;
    }
    console.error(`Impossible de démarrer le serveur de test local : ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/test-page.html`;
    console.log("Serveur de test local StreamVolume Guard Hub");
    console.log(`Ouvre : ${url}`);
    console.log("");
    console.log("Ensuite :");
    console.log("1. Recharge l'extension dans chrome://extensions.");
    console.log("2. Ouvre l'URL ci-dessus.");
    console.log("3. Clique sur l'icône de l'extension.");
    console.log("4. Clique sur Activer cet onglet.");
    console.log("5. Utilise Son faible / Son fort et observe le gain dans la popup.");
    console.log("");
    console.log("Garde ce terminal ouvert pendant le test. Appuie sur Ctrl+C pour arrêter.");
  });
}

listen(preferredPort);
