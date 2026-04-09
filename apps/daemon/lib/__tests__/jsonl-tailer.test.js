const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { JsonlTailer } = require("../jsonl-tailer");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-tailer-test-"));
}

describe("JsonlTailer", () => {
  const cleanup = [];

  afterEach(() => {
    for (const fn of cleanup) fn();
    cleanup.length = 0;
  });

  it("emits events for new lines appended to file", async () => {
    const dir = tmpDir();
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, "test.jsonl");
    fs.writeFileSync(filePath, "");

    const tailer = new JsonlTailer(filePath);
    cleanup.push(() => tailer.stop());

    const events = [];
    const done = new Promise((resolve) => {
      tailer.on("event", (data) => {
        events.push(data);
        if (events.length === 2) resolve();
      });
    });

    tailer.start();

    await new Promise((r) => setTimeout(r, 100));
    fs.appendFileSync(filePath, JSON.stringify({ type: "user", message: "hello" }) + "\n");
    fs.appendFileSync(filePath, JSON.stringify({ type: "assistant", message: "world" }) + "\n");

    await done;
    assert.deepEqual(events[0], { type: "user", message: "hello" });
    assert.deepEqual(events[1], { type: "assistant", message: "world" });
  });

  it("skips invalid JSON lines without crashing", async () => {
    const dir = tmpDir();
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, "test.jsonl");
    fs.writeFileSync(filePath, "");

    const tailer = new JsonlTailer(filePath);
    cleanup.push(() => tailer.stop());

    const events = [];
    const done = new Promise((resolve) => {
      tailer.on("event", (data) => {
        events.push(data);
        resolve();
      });
    });

    tailer.start();

    await new Promise((r) => setTimeout(r, 100));
    fs.appendFileSync(filePath, "not-json\n");
    fs.appendFileSync(filePath, JSON.stringify({ type: "valid" }) + "\n");

    await done;
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: "valid" });
  });

  it("skips empty lines", async () => {
    const dir = tmpDir();
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, "test.jsonl");
    fs.writeFileSync(filePath, "");

    const tailer = new JsonlTailer(filePath);
    cleanup.push(() => tailer.stop());

    const events = [];
    const done = new Promise((resolve) => {
      tailer.on("event", (data) => {
        events.push(data);
        resolve();
      });
    });

    tailer.start();

    await new Promise((r) => setTimeout(r, 100));
    fs.appendFileSync(filePath, "\n\n" + JSON.stringify({ type: "data" }) + "\n");

    await done;
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: "data" });
  });

  it("waits for file to appear when it does not exist yet", async () => {
    const dir = tmpDir();
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, "not-yet.jsonl");

    const tailer = new JsonlTailer(filePath);
    cleanup.push(() => tailer.stop());

    const done = new Promise((resolve) => {
      tailer.on("event", (data) => {
        assert.deepEqual(data, { type: "first" });
        resolve();
      });
    });

    tailer.start();

    await new Promise((r) => setTimeout(r, 200));
    fs.writeFileSync(filePath, JSON.stringify({ type: "first" }) + "\n");

    await done;
  });

  it("stop() ceases further event emission", async () => {
    const dir = tmpDir();
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, "test.jsonl");
    fs.writeFileSync(filePath, "");

    const tailer = new JsonlTailer(filePath);
    cleanup.push(() => tailer.stop());

    const events = [];
    tailer.on("event", (data) => events.push(data));

    tailer.start();

    await new Promise((r) => setTimeout(r, 100));
    fs.appendFileSync(filePath, JSON.stringify({ type: "before" }) + "\n");

    await new Promise((r) => setTimeout(r, 200));
    tailer.stop();
    fs.appendFileSync(filePath, JSON.stringify({ type: "after" }) + "\n");

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "before");
  });

  it("ignores lines already present in the file at start", async () => {
    const dir = tmpDir();
    cleanup.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, "test.jsonl");
    fs.writeFileSync(filePath, JSON.stringify({ type: "old" }) + "\n");

    const tailer = new JsonlTailer(filePath);
    cleanup.push(() => tailer.stop());

    const events = [];
    const done = new Promise((resolve) => {
      tailer.on("event", (data) => {
        events.push(data);
        resolve();
      });
    });

    tailer.start();

    await new Promise((r) => setTimeout(r, 200));
    fs.appendFileSync(filePath, JSON.stringify({ type: "new" }) + "\n");

    await done;
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: "new" });
  });
});
