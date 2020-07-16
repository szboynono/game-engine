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

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function assignRole(socketMap, roles) {
  roles.forEach((role, i) => {
    const keys = Array.from(socketMap.keys())
    socketMap.set(keys[i], { ...socketMap.get(keys), role: role })
  });
}


app.get("/room", (req, res, next) => {
  const roomNumber = makeid(4);
  const messages = [];
  const roles = ['role1', 'role2'];
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
    });
    socket.emit("id", socket.id);

    //owner logic
    if (!gameStart) {
      const firstGuyId = Array.from(socketMap.keys())[0];
      nsp.emit("owner", firstGuyId);
    }

    socket.on("name", (name) => {
      if (name) {
        socketMap.set(socket.id, name);
      }
      const usernames = Array.from(
        socketMap.values()
      );
      nsp.emit("userList", usernames);
    })

    // start game
    socket.on("start", () => {
      gameStart = true;
      const shuffledRoles = shuffle(roles);
      assignRole(socketMap, shuffledRoles);
      console.log(socketMap);
      nsp.emit("started");

    });


    // disconnect
    socket.on("disconnect", () => {
      socketMap.delete(socket.id);
      const usernames = Array.from(
        socketMap.values()
      );
      nsp.emit("userList", usernames);
      console.log(socketMap);
      console.info(`Client gone [id=${socket.id}]`);
    });
  });
});

http.listen(8081, () => {
  console.log("listening on *:8081");
});
