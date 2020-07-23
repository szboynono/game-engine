const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const bodyPaser = require("body-parser");
const { ifError } = require("assert");

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
  let roleIndex = 0;
  socketMap.forEach((value, key) => {
    socketMap.set(key, { ...value, role: roles[roleIndex] })
    roleIndex++;
  });
}

function readyCheck(socketMap) {
  console.log(socketMap);
  const check = Array.from(socketMap.values()).every(value => value.ready);
  return check;
}


app.get("/room", (req, res, next) => {
  const roomNumber = makeid(4);
  const messages = [];
  const roles = ['Loyal Servant of Arthor', 'Loyal Servant of Arthor', 'MERLIN', 'Minion of Mordred', 'ASSASIN'];
  let gameStart = false;
  let turn = 0;

  res.send(roomNumber);
  const nsp = io.of("/" + roomNumber);

  // initialize it
  let socketMap = new Map();
  nsp.on("connection", function (socket) {
    console.info(`Client connected [id=${socket.id}]`);

    // send id
    socketMap.set(socket.id, {
      role: "",
      ready: false
    });
    socket.emit("id", socket.id);

    //owner logic
    if (!gameStart) {
      const firstGuyId = Array.from(socketMap.keys())[0];
      nsp.emit("owner", firstGuyId);
    }

    socket.on("name", (name) => {
      if (name) {
        socketMap.set(socket.id, { ...socketMap.get(socket.id), name: name });
      }
      const names = [];
      socketMap.forEach((value, key) => {
        names.push({name: value.name});
      })
      nsp.emit("userList", names);
    })

    // start game
    socket.on("start", () => {
      gameStart = true;
      const shuffledRoles = shuffle(roles);
      assignRole(socketMap, shuffledRoles);
      nsp.emit("started");
    });

    // roles
    socket.on("requestRole", () => {
      socket.emit("giveRole", socketMap.get(socket.id).role);
    });

    // ready
    socket.on("ready", () => {
      socketMap.set(socket.id, { ...socketMap.get(socket.id), ready: true });
      if (readyCheck(socketMap)) {
        nsp.emit('readyCheckDone');
        gameStart = true;
      }
    });

    // leader
    socket.on("askForFirstLeader", () => {
      const usernames = Array.from(
        socketMap.values()
      );
      socket.emit('roundInfo', {
        leader: usernames[turn].name,
        round: turn
      });
    });

    socket.on('turnOver', ()=> {
      const usernames = Array.from(
        socketMap.values()
      );
      if(turn >= usernames.length - 1) {
        turn = 0;
      } else {
        turn++;
      }
      nsp.emit('roundInfo', {
        leader: usernames[turn].name,
        round: turn
      });
    })

    // disconnect
    socket.on("disconnect", () => {
      socketMap.delete(socket.id);
      const usernames = Array.from(
        socketMap.values()
      );
      nsp.emit("userList", usernames);
      console.info(`Client gone [id=${socket.id}]`);
    });
  });
});

http.listen(8081, () => {
  console.log("listening on *:8081");
});
