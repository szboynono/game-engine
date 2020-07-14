const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const bodyPaser = require("body-parser");

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(bodyPaser.urlencoded({ extended: false }));

function makeid(length) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

app.get("/room", (req, res, next) => {
  const roomNumber = makeid(4);
  const messages = [];
  let gameStart = false;

  res.send(roomNumber);
  const nsp = io.of("/" + roomNumber);

  // initialize it
  let socketMap = new Map();
  nsp.on("connection", function (socket) {
    console.info(`Client connected [id=${socket.id}]`);

    // send id
    socketMap.set(socket.id, {
      userSocket: socket,
      username: "",
      spy: false,
    });
    socket.emit("id", socket.id);

    //owner logic
    const firstGuyId = Array.from(socketMap.keys())[0];
    nsp.emit("owner", firstGuyId);

    // name logic
    socket.on("name", (userInfo) => {
      if (userInfo.username) {
        socketMap.set(userInfo.id, {
          ...socketMap.get(userInfo.id),
          username: userInfo.username,
        });
        const usernames = Array.from(
          socketMap.values(),
          (value) => value.username
        );
        nsp.emit("users", usernames);
      }
    });

    // start game
    socket.on("start", () => {
      gameStart = true;
      nsp.emit("started");
    });

    // disconnect
    socket.on("disconnect", () => {
      socketMap.delete(socket.id);
      console.info(`Client gone [id=${socket.id}]`);
    });
  });
});

http.listen(8081, () => {
  console.log("listening on *:8081");
});
