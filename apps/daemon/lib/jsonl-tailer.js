const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

/**
 * Tails a JSONL file, emitting parsed JSON objects as "event" events.
 * Handles the file not existing yet by watching the parent directory.
 * Only emits events for lines appended after start() is called.
 */
class JsonlTailer extends EventEmitter {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    this._watcher = null;
    this._dirWatcher = null;
    this._stream = null;
    this._rl = null;
    this._stopped = false;
    this._offset = 0;
  }

  start() {
    if (fs.existsSync(this.filePath)) {
      // Record current size so we skip existing content
      const stat = fs.statSync(this.filePath);
      this._offset = stat.size;
      this._watchFile();
    } else {
      this._watchForCreation();
    }
  }

  stop() {
    this._stopped = true;
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._dirWatcher) {
      this._dirWatcher.close();
      this._dirWatcher = null;
    }
    if (this._rl) {
      this._rl.close();
      this._rl = null;
    }
    if (this._stream) {
      this._stream.destroy();
      this._stream = null;
    }
  }

  _watchForCreation() {
    const dir = path.dirname(this.filePath);
    const basename = path.basename(this.filePath);

    try {
      this._dirWatcher = fs.watch(dir, (eventType, filename) => {
        if (this._stopped) return;
        if (filename === basename && fs.existsSync(this.filePath)) {
          this._dirWatcher.close();
          this._dirWatcher = null;
          this._offset = 0; // New file, read from start
          this._watchFile();
        }
      });
    } catch {
      // Directory doesn't exist yet — rare edge case, ignore
    }
  }

  _watchFile() {
    // Read any new content from current offset
    this._readNewContent();

    this._watcher = fs.watch(this.filePath, (eventType) => {
      if (this._stopped) return;
      if (eventType === "change") {
        this._readNewContent();
      }
    });
  }

  _readNewContent() {
    if (this._stopped) return;

    let stat;
    try {
      stat = fs.statSync(this.filePath);
    } catch {
      return; // File was deleted
    }

    if (stat.size <= this._offset) return; // No new content

    const stream = fs.createReadStream(this.filePath, {
      start: this._offset,
      encoding: "utf8",
    });
    this._offset = stat.size;

    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on("line", (line) => {
      if (this._stopped) return;
      if (!line.trim()) return;
      try {
        const data = JSON.parse(line);
        this.emit("event", data);
      } catch {
        // Skip invalid JSON lines
      }
    });

    rl.on("close", () => {
      stream.destroy();
    });
  }
}

module.exports = { JsonlTailer };
