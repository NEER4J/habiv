/** Ingest limits (platform-plan §4.1, free-tier values). */
export const MiB = 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 300 * MiB;
export const MAX_FILES = 1000;
export const MAX_SINGLE_FILE = 100 * MiB;
export const MAX_PATH_LENGTH = 240;
export const MAX_ENTRY_RATIO = 200;
export const MAX_BUNDLE_RATIO = 100;
export const MAX_SOURCEMAP_BYTES = 5 * MiB;

export const ALLOWED_EXT = new Set([
  "html", "htm", "js", "mjs", "cjs", "css", "json", "wasm", "pck", "data", "br", "gz", "unityweb", "apk",
  "png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "ico", "bmp",
  "mp3", "ogg", "oga", "wav", "m4a", "aac", "flac", "webm", "mp4",
  "woff", "woff2", "ttf", "otf", "eot",
  "txt", "xml", "csv", "md", "map", "glb", "gltf", "bin", "swf", "tic", "p8", "love", "sb3",
  "rpgmvp", "rpgmvo", "rpgmvm", "ogg_", "png_", "m4a_", "webmanifest", "vert", "frag", "glsl", "atlas", "fnt", "tmx", "tsx", "tmj", "tsj", "ldtk", "aseprite", "pdf", "srt", "vtt", "ini", "cfg", "dat", "lua", "py", "rpy", "rpyc", "pyc", "zip", "toml", "yaml", "yml", "wav_", "sav", "properties", "res", "tres", "tscn", "import", "godot", "pak", "unity3d", "mem", "symbols", "framework", "loader", "wat", "dll_", "so_", "sh_", "lst",
]);

export const BANNED_EXT = new Set(["exe", "dll", "sh", "bat", "cmd", "msi", "com", "scr", "ps1", "vbs", "jar", "app", "dmg", "pkg", "deb", "rpm", "so", "dylib"]);

export const STRIP_DIRS = ["__MACOSX/", ".git/", "node_modules/", ".svn/", ".hg/", ".idea/", ".vscode/"];
export const STRIP_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".gitignore", ".gitattributes"]);
export const SERVICE_WORKER_FILES = new Set(["sw.js", "service-worker.js", "serviceworker.js", "register-sw.js", "offline.json", "workbox-sw.js"]);
