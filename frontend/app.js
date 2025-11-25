const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
ctx.lineCap = "round";   // makes the ends of lines rounded
ctx.lineJoin = "round";  // smooths corners when connecting lines

const cursorCanvas = document.getElementById("cursorCanvas");
const cursorCtx = cursorCanvas.getContext("2d");


// load config
let WS_URL = null;

const cfg = await fetch("/config.json").then(r => r.json());
WS_URL = cfg.WS_URL;

let drawing = false;
let lastX = 0;
let lastY = 0;

const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const clearBtn = document.getElementById("clearButton");

canvas.addEventListener("mousedown", (e) => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
});
canvas.addEventListener("mouseup", () => drawing = false);
canvas.addEventListener("mouseout", () => {
    drawing = false
    ws.send(JSON.stringify({ type: "cursor_remove", id: myId}));
});
canvas.addEventListener("mousemove", draw);

let myId = null;
const ws = new WebSocket(WS_URL);
const cursors = {};


clearBtn.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ws.send(JSON.stringify({ type: "clear" }));
});

// draw strokes coming from other clients
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "init") {
        myId = data.id;
        console.log("Initialized with ID:", myId);
        return;
    } else if (data.type === "clear") {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    } else if (data.type === "draw") {
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.beginPath();
        ctx.moveTo(data.lastX, data.lastY);
        ctx.lineTo(data.x, data.y);
        ctx.stroke();
    } else if (data.type === "cursor") {
        // use unique IDs per connection
        let id = data.id;

        cursors[id] = {
            x: data.x,
            y: data.y,
            color: data.color,
            size: data.size
        };
    } else if (data.type === "cursor_remove") {
        let id = data.id;
        delete cursors[id];
    }
};


function drawOtherCursors() {
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);

    for (const id in cursors) {
        const c = cursors[id];
        cursorCtx.beginPath();
        cursorCtx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        cursorCtx.fillStyle = c.color;
        cursorCtx.fill();
    }

    requestAnimationFrame(drawOtherCursors);
}
drawOtherCursors();

function draw(e) {
    if (myId === null) return; // not initialized yet

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const color = colorPicker.value;
    const size = brushSize.value;

    // send cursor movements to server
    ws.send(JSON.stringify({ type: "cursor", id: myId, x, y, color, size }));

    if (!drawing) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();

    ws.send(JSON.stringify({ type: "draw",lastX, lastY, x, y, color, size }));

    lastX = x;
    lastY = y;
}
