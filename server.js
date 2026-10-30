// QR dinámico para Render. Sin dependencias.
// Variables de entorno:
//   ADMIN_PASSWORD  (obligatoria) contraseña del panel
//   DATA_FILE       (opcional) ruta del archivo de datos; en Render con disco: /var/data/links.json
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "links.json");
const ADMIN_HTML = fs.readFileSync(path.join(__dirname, "admin.html"), "utf8");

let links = {};
try { links = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { links = {}; }
function persist() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(links, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

const send = (res, status, body, type = "text/plain; charset=utf-8", extra = {}) => {
  res.writeHead(status, { "content-type": type, ...extra });
  res.end(body);
};
const json = (res, obj, status = 200) => send(res, status, JSON.stringify(obj), "application/json");

const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;

  if (p.startsWith("/r/")) {
    const id = decodeURIComponent(p.slice(3));
    const target = links[id];
    if (!target) return send(res, 404, "Enlace no encontrado");
    return send(res, 302, "", "text/plain", { Location: target, "Cache-Control": "no-store" });
  }

  if (p === "/admin" || p === "/") return send(res, 200, ADMIN_HTML, "text/html; charset=utf-8");

  if (p.startsWith("/api/")) {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw || req.headers["x-password"] !== pw) return json(res, { error: "No autorizado" }, 401);
    if (p === "/api/list") {
      return json(res, { items: Object.entries(links).map(([id, url]) => ({ id, url })) });
    }
    if (req.method === "POST") {
      let raw = "";
      req.on("data", (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
      req.on("end", () => {
        let body = {};
        try { body = JSON.parse(raw); } catch (e) {}
        if (!/^[a-zA-Z0-9-]{1,40}$/.test(body.id || "")) return json(res, { error: "Nombre inválido" }, 400);
        if (p === "/api/set") {
          if (!/^https?:\/\//i.test(body.url || "")) return json(res, { error: "El link debe empezar con http:// o https://" }, 400);
          links[body.id] = body.url; persist(); return json(res, { ok: true });
        }
        if (p === "/api/delete") { delete links[body.id]; persist(); return json(res, { ok: true }); }
        json(res, { error: "No encontrado" }, 404);
      });
      return;
    }
  }
  send(res, 404, "No encontrado");
});
server.listen(PORT, () => console.log("Escuchando en " + PORT));
