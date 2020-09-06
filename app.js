var cors = require('cors')
const app = require("express")();
app.use(cors());
const http = require("http").createServer(app);
const bodyPaser = require("body-parser");

const io = require("socket.io")(http, {
  handlePreflightRequest: (req, res) => {
    const headers = {
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Origin": '*', //or the specific origin you want to give access to,
      "Access-Control-Allow-Credentials": true
    };
    res.writeHead(200, headers);
    res.end();
  }
});


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
  const check = Array.from(socketMap.values()).every(value => value.ready);
  return check;
}



app.get("/room", (req, res, next) => {
  const roomNumber = makeid(4);
  let roles = ['PERCIVAL', 'Loyal Servant of Arthor', 'MERLIN', 'MORGANA', 'ASSASIN'];
  let gameStart = false;
  let turn = 0;
  let gameResult = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined
  ];
  let newGame = false;

  res.send(roomNumber);
  let nsp = io.of("/" + roomNumber);

  // initialize it
  let socketMap = new Map();
  nsp.on("connection", function (socket) {
    console.info(`Client connected [id=${socket.id}]`);
    let currentRoom = 'room1';
    socket.join(currentRoom);
    // send id
    socketMap.set(socket.id, {
      name: "",
      role: "",
      id: socket.id,
      ready: false,
      selected: false,
      approveMission: {
        voted: false,
        approve: false,
        tryAgain: false
      },
      successMission: {
        voted: false,
        success: false
      },
      nextRoundClicked: false,
      nextGameClicked: false
    });
    socket.emit("id", socket.id);

    //owner logic
    socket.on('askForOwner', () => {
      const firstGuyId = Array.from(socketMap.keys())[0];
      nsp.to(currentRoom).emit("owner", firstGuyId);
    })

    socket.on("name", (name) => {
      if (name) {
        socketMap.set(socket.id, { ...socketMap.get(socket.id), name: name });
      }
      const names = [];
      socketMap.forEach((value, key) => {
        names.push({ name: value.name, id: key, selected: value.selected });
      })
      nsp.to(currentRoom).emit("userList", names);
    })

    // start game
    socket.on("start", () => {
      if (newGame === true) {
        socketMap.forEach((value, key) => {
          if (value.nextGameClicked === false) {
            socketMap.delete(key);
          }
        });
      }


      turn = 0;
      gameResult = [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      ];
      gameStart = true;

      const numberOfPlayers = Array.from(socketMap.entries()).length;
      switch (numberOfPlayers) {
        case 5:
          roles = ['PERCIVAL', 'Loyal Servant of Arthor', 'MERLIN', 'MORGANA', 'ASSASIN'];
          break;
        case 6:
          roles = ['PERCIVAL', 'Loyal Servant of Arthor', 'Loyal Servant of Arthor', 'MERLIN', 'MORGANA', 'ASSASIN']
          break;
        case 7:
          roles = ['PERCIVAL', 'Loyal Servant of Arthor', 'Loyal Servant of Arthor', 'MERLIN', 'MORGANA', 'ASSASIN', 'OBERON']
          break;
        case 8:
          roles = ['PERCIVAL', 'Loyal Servant of Arthor', 'Loyal Servant of Arthor', 'Loyal Servant of Arthor', 'MERLIN', 'MORGANA', 'ASSASIN', 'Minion of Mordred']
          break;
      }

      const shuffledRoles = shuffle(roles);
      assignRole(socketMap, shuffledRoles);
      nsp.to(currentRoom).emit("started");
    });

    // roles
    socket.on("requestRole", () => {
      socket.emit("giveRole", socketMap.get(socket.id).role);
    });

    // Merlin
    socket.on("merlin-vision", () => {
      const badGuys =
        Array.from(socketMap.values())
          .filter(player => ['Minion of Mordred', 'ASSASIN', 'MORGANA', 'OBERON', 'MORDRED'].includes(player.role))
      socket.emit('merlin-vision-response', badGuys);
    });

    // percival
    socket.on("percival-vision", () => {
      const guys =
        Array.from(socketMap.values())
          .filter(player => ['MERLIN', 'MORGANA'].includes(player.role))
      socket.emit('percival-vision-response', guys);
    });

    // bad guys vision
    socket.on("bad-guys-vision", () => {
      const guys =
        Array.from(socketMap.values())
          .filter(player => ['Minion of Mordred', 'ASSASIN', 'MORGANA', 'MORDRED'].includes(player.role));
      socket.emit('bad-guys-vision-response', guys);
    });

    // ready
    socket.on("ready", () => {
      socketMap.set(socket.id, { ...socketMap.get(socket.id), ready: true });
      if (readyCheck(socketMap)) {
        nsp.to(currentRoom).emit('readyCheckDone');
        gameStart = true;
      }
    });

    // leader
    socket.on("askForFirstLeader", () => {
      const usernames = Array.from(
        socketMap.values()
      );
      socket.emit('roundInfo', {
        leader: usernames[0].name,
        round: 0
      });
    });

    // on selection
    socket.on("updateSelections", (updatedUsers) => {


      updatedUsers.forEach(user => {
        socketMap.set(user.id, { ...socketMap.get(user.id), selected: user.selected });
      });
      const usernames = Array.from(
        socketMap.values()
      );
      nsp.to(currentRoom).emit("userList", usernames);
    });

    // ready to vote
    socket.on('readyToVote', () => {
      nsp.to(currentRoom).emit('goToVote');
    });

    // submit votes for approval
    socket.on('submitVote', (vote) => {
      const currentValue = socketMap.get(socket.id);
      socketMap.set(socket.id, {
        ...currentValue, approveMission: {
          voted: true,
          approve: vote
        }
      });

      const voteCheck = Array.from(socketMap.values()).every(value => value.approveMission.voted);
      if (voteCheck) {
        const approvals = Array.from(socketMap.values()).filter(entry => entry.approveMission.approve);
        const rejections = Array.from(socketMap.values()).filter(entry => !entry.approveMission.approve);
        nsp.emit('approveResult', {
          approvals: approvals,
          rejections: rejections,
          result: approvals.length > rejections.length
        });
      }
    });

    // vote failure on approval
    socket.on('missionApprovalTryAgain', () => {
      socketMap.set(socket.id, {
        ...socketMap.get(socket.id),
        selected: false,
        approveMission: {
          voted: false,
          approve: false,
          tryAgain: true
        },
      });
      const usernames = Array.from(
        socketMap.values()
      );
      nsp.to(currentRoom).emit("userList", usernames);
      if (Array.from(socketMap.values()).every(value => value.approveMission.tryAgain)) {
        nsp.to(currentRoom).emit('missionApprovalTryAgainDone');
      }
    });

    // vote for mission
    socket.on('submitMissonSuccessVote', (vote) => {
      const currentValue = socketMap.get(socket.id);
      socketMap.set(socket.id, {
        ...currentValue, successMission: {
          voted: true,
          success: vote
        }
      });
      const selectedPlayers = Array.from(socketMap.values()).filter(player => player.selected);
      const voteCheck = selectedPlayers.every(value => value.successMission.voted);
      if (voteCheck) {
        const failure = selectedPlayers.filter(entry => !entry.successMission.success);
        gameResult[turn] = failure.length <= 0;

        const badGuysRounds = gameResult.filter(game => game === false).length;
        const goodGuysRounds = gameResult.filter(game => game === true).length;
        if (badGuysRounds >= 3) {
          nsp.to(currentRoom).emit('gameOver', 'bad');
          gameStart = false;
          return;
        } else if (goodGuysRounds === 3) {
          nsp.to(currentRoom).emit('assasin', {
            players: selectedPlayers,
            gameResult,
            result: failure.length <= 0
          });
        }

        if (goodGuysRounds !== 3) {
          nsp.to(currentRoom).emit('missionSuccessResult', {
            players: selectedPlayers,
            gameResult,
            result: failure.length <= 0
          });
        }
      }
    });

    // assasin
    socket.on('assasin-target', (target) => {
      const merlin = Array.from(socketMap.values()).find((player) => player.role === 'MERLIN');
      if (target.name === merlin.name) {
        nsp.to(currentRoom).emit('gameOver', 'bad');
        gameStart = false;
        return;
      } else {
        nsp.to(currentRoom).emit('gameOver', 'good');
        gameStart = false;
        return;
      }
    })


    // turn over
    socket.on('turnOver', () => {

      socketMap.get(socket.id).nextRoundClicked = true;
      const allClicked = Array.from(socketMap.values()).every(value => value.nextRoundClicked === true);
      if (allClicked) {
        socketMap.forEach((value, key) => {
          socketMap.set(key, {
            ...value,
            ready: false,
            selected: false,
            approveMission: {
              voted: false,
              approve: false,
              tryAgain: false
            },
            successMission: {
              voted: false,
              success: false
            },
            nextRoundClicked: false,
            nextGameClicked: false
          })
        });
        const usernames = Array.from(
          socketMap.values()
        );
        nsp.to(currentRoom).emit("userList", usernames);

        if (turn >= usernames.length - 1) {
          turn = 0;
        } else {
          turn++;
        }
        nsp.to(currentRoom).emit('roundInfo', {
          leader: usernames[turn].name,
          round: turn
        });
      }
    })

    // new Game
    socket.on('newGame', (room) => {
      socketMap.set(socket.id, { ...socketMap.get(socket.id), nextGameClicked: true });
      currentRoom = 'room2';
      socket.join(currentRoom);
      socketMap.set(socket.id, {
        ...socketMap.get(socket.id), ready: false,
        selected: false,
        approveMission: {
          voted: false,
          approve: false,
          tryAgain: false
        },
        successMission: {
          voted: false,
          success: false
        },
        nextRoundClicked: false,
      });
      newGame = true;
      const usernames = Array.from(
        socketMap.values()
      ).filter(player => player.nextGameClicked);
      nsp.to(currentRoom).emit("userList", usernames);
    });

    // disconnect
    socket.on("disconnect", () => {
      socketMap.delete(socket.id);
      const usernames = Array.from(
        socketMap.values()
      );
      nsp.to(currentRoom).emit("userList", usernames);
      console.info(`Client gone [id=${socket.id}]`);
    });
  });
});

// start the server listening for requests
http.listen(process.env.PORT || 8081,
  () => console.log("Server is running..."));
