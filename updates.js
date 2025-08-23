const http = require("http");
const { exec } = require("child_process");

const PORT = 4567;

function runGitPull(callback) {
    exec("git pull origin master", { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error("Git pull failed:", stderr);
            return callback(false);
        }
        console.log("Git pull successful:\n", stdout);
        callback(true);
    });
}

const server = http.createServer((req, res) => {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.url === "/update" && req.method === "GET") {
        runGitPull((success) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: success }));
        });
    } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
    }
});

server.listen(PORT, () => {
    console.log(`Git update server listening at http://localhost:${PORT}`);
});
