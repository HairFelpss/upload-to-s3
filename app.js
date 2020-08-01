const express = require("express");
const axios = require("axios");

const events = require("events");
const eventEmitter = new events.EventEmitter();
const fs = require("fs");
const tmpDirectory = require("./modules/tmpDirectory.js")();

const http = require("http");
const unzipper = require("unzipper");
const app = express();
const port = 3000;

const mainFunc = async () => {
  try {
    const arr = await makeRequest();

    await filterAndCreatePacks(arr);
  } catch (err) {
    console.log(err);
  }
};

const makeRequest = async () => {
  const response = await axios.get(
    "http://api.sticker.ly/v1/stickerPack/recommend",
    {
      headers: {
        "User-Agent":
          "androidapp.stickerly/1.9.8 (SM-K; U; Android 29; pt-Br;pt)",
      },
    }
  );
  return response.data.result.packs;
};

function continua(pack) {
  tmpDirectory.init("./app/_tmp/" + pack.packId);
  tmpDirectory.init("./app/assets/" + pack.packId);
  const file = fs.createWriteStream("./app/zippng/" + pack.packId + ".zip");

  const url = pack.resourceUrlPrefix + pack.resourceZip;

  http.get(url, function (response) {
    const createPack = response.pipe(file);
    createPack.on("close", function () {
      const createZip = fs
        .createReadStream("./app/zippng/" + pack.packId + ".zip")
        .pipe(unzipper.Extract({ path: "./app/assets/" + pack.packId }));
      createZip.on("close", function () {
        console.log("iniciando -- " + pack.packId);
        const convert = require("./modules/convert.js")(eventEmitter);
        convert.convertFilesToWebP(pack.packId);
      });
    });
  });
}

const filterAndCreatePacks = (arr) => {
  try {
    for (const pack of arr) {
      continua(pack);
    }
  } catch (err) {
    console.log("err => ", err);
  }
};
app.listen(port, () => {
  console.log(`Server is up at ${port}`);
  mainFunc();
});