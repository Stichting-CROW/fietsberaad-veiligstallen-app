import http from "node:http";

const mails = [];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/mails") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(mails));
    return;
  }
  if (req.method === "POST" && req.url === "/reset") {
    mails.length = 0;
    res.end("ok");
    return;
  }
  if (req.method === "POST" && req.url === "/email") {
    const body = await readBody(req);
    const fields = Object.fromEntries(new URLSearchParams(body));
    mails.push({
      subject: fields.subject ?? "",
      accountId: fields.accountID ?? "",
      bikeparkId: fields.bikeparkID ?? "",
      ccToExploitant: fields.ccToExploitant ?? "",
    });
    res.end("ok");
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

server.listen(8081, "0.0.0.0");
