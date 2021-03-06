const express = require('express');
const axios = require('axios');

const events = require('events');
const eventEmitter = new events.EventEmitter();
const fs = require('fs');

const http = require('http');
const unzipper = require('unzipper');
const client = require('./db');
const tmpDirectory = require('./modules/tmpDirectory.js')();

const app = express();
const port = 3000;

const mainFunc = async () => {
  try {
    const { pack, lang } = await makeRequest();
    filterAndCreatePacks(pack.data.result.packs, lang);
  } catch (err) {
    console.log(err);
  }
};

const makeRequest = async () => {
  //const languages = ['pt-Br;pt', 'es-Es;es', 'en-Us;en'];
  return {
    pack: await axios.get('http://api.sticker.ly/v1/stickerPack/recommend', {
      headers: {
        'User-Agent': `androidapp.stickerly/1.9.8 (SM-K; U; Android 29; en-Us;en)`,
      },
    }),
    lang: 'en-Us;en',
  };
};

function continua(pack, lang) {
  if (
    pack.name.match(/virus/) ||
    pack.name.match(/corona/) ||
    pack.name.match(/quarentena/) ||
    pack.name.match(/quarentine/) ||
    pack.name.match(/covid/) ||
    pack.name.match(/pandemic/) ||
    pack.authorName.match(/virus/) ||
    pack.authorName.match(/corona/) ||
    pack.authorName.match(/quarentena/) ||
    pack.authorName.match(/quarentine/) ||
    pack.authorName.match(/covid/) ||
    pack.authorName.match(/pandemic/)
  )
    return;
  tmpDirectory.init('./app/_tmp/' + pack.packId);
  tmpDirectory.init('./app/assets/' + pack.packId);
  const file = fs.createWriteStream('./app/zippng/' + pack.packId + '.zip');

  const url = pack.resourceUrlPrefix + pack.resourceZip;

  http.get(url, function (response) {
    const createPack = response.pipe(file);
    createPack.on('close', function () {
      const createZip = fs
        .createReadStream('./app/zippng/' + pack.packId + '.zip')
        .pipe(unzipper.Extract({ path: './app/assets/' + pack.packId }));
      createZip.on('close', function () {
        const convert = require('./modules/convert.js')(eventEmitter);
        convert.convertFilesToWebP(pack, lang);
      });
    });
  });
}

const filterAndCreatePacks = async (arr, lang) => {
  try {
    for (const pack of arr) {
      await continua(pack, lang);
    }
  } catch (err) {
    console.log('err => ', err);
  }
};
app.listen(port, async () => {
  console.log(`Server is up at ${port}`);
  await client.connect();

  mainFunc();
});
