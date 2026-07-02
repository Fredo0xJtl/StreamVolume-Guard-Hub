const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const extensionRoot = path.resolve(process.env.WLG_EXTENSION_DIR || root);
const smokePagePath = path.join(root, "tests", "technical-smoke.html");

function findBrowserExecutable() {
  const envPath = process.env.WLG_CHROME_PATH;
  const candidates = [
    envPath,
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(process.env.LOCALAPPDATA || "", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/brave-browser"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const requestedPath = decodeURIComponent(url.pathname.slice(1));
    const filePath = path.resolve(root, requestedPath || "test-page.html");

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

    const ext = path.extname(filePath);
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "application/octet-stream";

    response.writeHead(200, { "content-type": contentType });
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        port: server.address().port
      });
    });
  });
}

function waitForFile(filePath, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (fs.existsSync(filePath)) {
        resolve(fs.readFileSync(filePath, "utf8"));
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${filePath}`));
        return;
      }
      setTimeout(check, 80);
    };
    check();
  });
}

class CdpClient {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.socket = new WebSocket(webSocketUrl);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result || {});
        }
        return;
      }
      if (message.method && this.events.has(message.method)) {
        this.events.get(message.method).forEach((listener) => listener(message.params || {}));
      }
    });
  }

  async send(method, params) {
    await this.ready;
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params: params || {} });
    this.socket.send(payload);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const listener = (params) => {
        const listeners = this.events.get(method) || [];
        this.events.set(method, listeners.filter((entry) => entry !== listener));
        resolve(params);
      };
      const listeners = this.events.get(method) || [];
      listeners.push(listener);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

async function launchBrowser(browserPath, serverPort) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wlg-smoke-"));
  const args = [
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--autoplay-policy=no-user-gesture-required",
    "--headless=new",
    `--disable-extensions-except=${extensionRoot}`,
    `--load-extension=${extensionRoot}`,
    `http://127.0.0.1:${serverPort}/tests/technical-smoke.html`
  ];

  const processHandle = childProcess.spawn(browserPath, args, {
    stdio: ["ignore", "ignore", "pipe"]
  });

  const devToolsFile = path.join(userDataDir, "DevToolsActivePort");
  const activePort = await waitForFile(devToolsFile, 10000);
  const [port] = activePort.trim().split(/\r?\n/);

  return {
    processHandle,
    userDataDir,
    debugPort: Number(port)
  };
}

async function getPageWebSocket(debugPort) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === "page" && target.url.includes("technical-smoke.html"));
    if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Could not find technical-smoke page target.");
}

async function waitForSmokeFunction(pageClient) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    const result = await pageClient.send("Runtime.evaluate", {
      expression: "typeof window.runStreamVolumeSmokeTest === 'function'",
      returnByValue: true
    });
    if (result.result && result.result.value === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Smoke test function was not registered by the page.");
}

async function run() {
  assert.ok(fs.existsSync(smokePagePath), "tests/technical-smoke.html must exist");
  assert.ok(fs.existsSync(path.join(extensionRoot, "manifest.json")), "Extension directory must contain manifest.json");

  const browserPath = findBrowserExecutable();
  assert.ok(
    browserPath,
    "No Chromium browser found. Set WLG_CHROME_PATH to chrome.exe, brave.exe or msedge.exe."
  );

  const { server, port } = await startStaticServer();
  let browser;
  let pageClient;

  try {
    browser = await launchBrowser(browserPath, port);
    const pageWebSocket = await getPageWebSocket(browser.debugPort);
    pageClient = new CdpClient(pageWebSocket);
    await pageClient.send("Runtime.enable");
    await pageClient.send("Page.enable");
    await waitForSmokeFunction(pageClient);

    const result = await pageClient.send("Runtime.evaluate", {
      expression: "window.runStreamVolumeSmokeTest()",
      awaitPromise: true,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Smoke test threw in the browser.");
    }

    const value = result.result.value;
    if (!value.ok) {
      console.error(JSON.stringify(value, null, 2));
    }
    assert.equal(value.ok, true, value.error || "Browser smoke test failed.");
    assert.ok(value.mediaDetected >= 1, "Expected at least one media element.");
    assert.ok(value.mediaProcessed === 1, "Expected exactly one processed media element.");
    assert.ok(value.lowBoostMigrationWorks, "Expected old +12 dB max boost settings to migrate to +48 dB.");
    assert.ok(value.loudGainDb < -1, "Expected loud input to trigger negative gain.");
    assert.ok(value.doubleProcessStable, "Expected repeated scans not to double-process media.");
    assert.ok(value.profileRefreshWorks, "Expected profile changes to rebuild the active media pipeline.");
    assert.ok(value.liveTargetRefreshWorks, "Expected target loudness changes to refresh the active media pipeline.");
    assert.ok(value.liveTargetGainRefreshWorks, "Expected target loudness changes to alter the active gain.");
    assert.ok(value.pageDomTargetRefreshWorks, "Expected the test page DOM to display the refreshed target loudness.");
    assert.ok(value.pageDomOutputRefreshWorks, "Expected the test page DOM to display refreshed output RMS.");
    assert.ok(value.pageDomOutputPeakRefreshWorks, "Expected the test page DOM to display refreshed output peak.");
    assert.ok(value.equalizedOutputSpreadDb <= 0.5, "Expected quiet, loud and very loud processed test levels to stay equalized tightly.");
    assert.ok(value.settledAverageSpreadDb <= 0.15, "Expected quiet, loud and very loud processed test levels to stay equalized while listening.");
    assert.ok(value.alternationEndSpreadDb <= 0.5, "Expected repeated alternation output RMS to stay close at the end of each step.");
    assert.ok(value.alternationEndPeakSpreadDb <= 1.5, "Expected OBS-style output peaks to stay close at the end of repeated alternation steps.");
    assert.ok(value.calmTargetPeakSpreadDb <= 1, "Expected OBS-style peaks to stay close when the target loudness is calmer.");
    assert.ok(value.calmTargetVeryLoudPeakDeltaDb <= 1, "Expected the very loud input to stay near the calm OBS-style peak target.");
    assert.ok(value.maxRecoverableTargetSpreadDb <= 0.5, "Expected the loudest selectable target to stay recoverable for quiet, loud and very loud inputs.");
    assert.ok(value.realWorldLevelSpreadDb <= 1, "Expected real-world loud and very loud signals to stay close after normalization.");
    assert.ok(value.realWorldVeryLoudShortfallDb <= 1, "Expected real-world very loud audio not to stay audibly weaker after normalization.");
    assert.ok(value.quietAfterVeryLoudTransitionOvershootDb <= 0, "Expected quiet input not to jump audibly above the target after a very loud input.");
    assert.ok(
      value.quietAfterVeryLoudSettleMs <= 1700,
      `Expected quiet input to recover quickly after a very loud input, got ${value.quietAfterVeryLoudSettleMs} ms.`
    );
    assert.ok(
      value.quietAfterVeryLoudTransitionStats.averageOutputRmsDb >= -21.35,
      `Expected quiet input not to stay perceptibly below target during recovery, got ${value.quietAfterVeryLoudTransitionStats.averageOutputRmsDb} dB.`
    );
    {
      const expectedQuietPeakDb = value.quietAfterVeryLoudStatus.targetRmsDb + 3;
      const quietPeakDeltaDb = Math.abs(value.quietAfterVeryLoudStatus.outputPeakDb - expectedQuietPeakDb);
      assert.ok(
        quietPeakDeltaDb <= 1,
        `Expected quiet input to reach OBS-style peak near ${expectedQuietPeakDb} dB, got ${value.quietAfterVeryLoudStatus.outputPeakDb} dB.`
      );
    }
    assert.ok(value.exclusionWorks, "Expected exclusion to disable processing.");
    assert.equal(value.excludedStatus.riskLevel, "safe", "Expected excluded tab to reset streamer risk status.");

    console.log("PASS browser smoke: media detection, processing, gain reduction, profile refresh, target gain refresh, output RMS refresh, page DOM refresh, equalized test levels, quiet recovery, no double-processing, exclusion");
    console.log(JSON.stringify(value, null, 2));
  } finally {
    if (pageClient) pageClient.close();
    server.close();
    await cleanupBrowser(browser);
  }
}

function waitForProcessExit(processHandle, timeoutMs) {
  if (!processHandle || processHandle.exitCode !== null) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    processHandle.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function removeDirectoryWithRetries(directoryPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

async function cleanupBrowser(browser) {
  if (!browser) return;
  if (browser.processHandle && browser.processHandle.exitCode === null) {
    browser.processHandle.kill();
    await waitForProcessExit(browser.processHandle, 3000);
  }
  if (browser.userDataDir) {
    await removeDirectoryWithRetries(browser.userDataDir);
  }
}

run().catch((error) => {
  console.error(`FAIL browser smoke: ${error.message}`);
  process.exitCode = 1;
});
