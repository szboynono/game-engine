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
  const messages = [];
  const roles = ['Loyal Servant of Arthor', 'Loyal Servant of Arthor', 'MERLIN', 'Minion of Mordred', 'ASSASIN'];
  let gameStart = false;
  let turn = 0;
  let gameResult = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined
  ];

  res.send(roomNumber);
  const nsp = io.of("/" + roomNumber);

  // initialize it
  let socketMap = new Map();
  nsp.on("connection", function (socket) {
    console.info(`Client connected [id=${socket.id}]`);

    // send id
    socketMap.set(socket.id, {
      role: "",
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
      nextRoundClicked: false
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
        names.push({ name: value.name, id: key, selected: value.selected });
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
        leader: usernames[0].name,
        round: 0
      });
    });

    // on selection
    socket.on("updateSelections", (users) => {
      users.forEach(user => {
        socketMap.set(user.id, { ...socketMap.get(user.id), selected: user.selected })
      })
      const names = [];
      socketMap.forEach((value, key) => {
        names.push({ name: value.name, id: key, selected: value.selected });
      })
      nsp.emit("userList", names);
    });

    // ready to vote
    socket.on('readyToVote', () => {
      nsp.emit('goToVote');
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
        approveMission: {
          voted: false,
          approve: false,
          tryAgain: true
        },
      });
      if(Array.from(socketMap.values()).every(value => value.approveMission.tryAgain)) {
        nsp.emit('missionApprovalTryAgainDone');
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
        if(badGuysRounds >= 3) {
          console.log('called');
          nsp.emit('gameOver', 'bad');
          return ;
        } else if(goodGuysRounds === 3) {
          nsp.emit('assasin', {
            players: selectedPlayers,
            gameResult,
            result: failure.length <= 0
          });
        }

        if(goodGuysRounds !== 3) {
          nsp.emit('missionSuccessResult', {
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
      if(target.name === merlin.name) {
        nsp.emit('gameOver', 'bad');
        return ;
      } else {
        nsp.emit('gameOver', 'good');
        return ;
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
            nextRoundClicked: false
          })
        });
        const usernames = Array.from(
          socketMap.values()
        );
        if (turn >= usernames.length - 1) {
          turn = 0;
        } else {
          turn++;
        }
        nsp.emit('roundInfo', {
          leader: usernames[turn].name,
          round: turn
        });
      }
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
