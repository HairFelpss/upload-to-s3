require('dotenv/config');

const fs = require('fs');
const execFile = require('child_process').execFile;
const binPath = require('webp-bin').path;
const zipper = require('zip-local');

const AWS = require('aws-sdk');

const client = require('../db');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ID,
  secretAccessKey: process.env.AWS_SECRET,
});

const sendToS3 = async (pack, lang) => {
  try {
    const file = fs.createReadStream('./app/zipgerado/' + pack.packId + '.zip');

    const response = await s3
      .upload({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${pack.packId}.zip`,
        Body: file,
        ACL: 'public-read',
        ContentType: 'file/zip',
      })
      .promise();
    console.log(response);

    const packsInsert = `
      INSERT INTO packs (id_pack, name, publisher, url_base, url_zip, lang, created_on)
      VALUES ('${pack.packId}', '${pack.name}', '${pack.authorName}',
              '${pack.resourceUrlPrefix}', '${
      response.Location
    }', '${lang}', '${new Date().toUTCString()}')
              RETURNING "id_pack"
    `;

    await client.query(packsInsert);

    for (const name of pack.resourceFiles) {
      const stickersInsert = `
      INSERT INTO stickers (id_pack, image_name, created_on)
      VALUES ('${
        pack.packId
      }', '${name}', '${new Date().toUTCString()}')  RETURNING "image_name"
    `;

      await client.query(stickersInsert);
    }
  } catch (err) {
    console.log('errr =>', err);
    return;
  } finally {
    try {
      fs.unlink('./app/zipgerado/' + pack.packId + '.zip', () =>
        console.log('zipgerado file deleted')
      );
      fs.unlink('./app/zippng/' + pack.packId + '.zip', () =>
        console.log('zippng file deleted')
      );
      fs.rmdir('./app/assets/' + pack.packId, { recursive: true }, () =>
        console.log('assets folder deleted')
      );
      fs.rmdir('./app/_tmp/' + pack.packId, { recursive: true }, () =>
        console.log('_tmp folder deleted')
      );
    } catch (err) {
      console.log('err => ', err);
    }
  }
};

const convert = function (eventEmitter) {
  let currentFileIndex = 0;
  let files = [];

  //Recursive function that converts file to webp format
  const convertFile = function (pack, lang) {
    let fileName = files[currentFileIndex];
    fileName = fileName.substr(0, fileName.indexOf('.png'));

    //Magic happens...
    execFile(
      binPath,
      (
        './app/assets/' +
        pack.packId +
        '/' +
        fileName +
        '.png -q 80 -o ./app/_tmp/' +
        pack.packId +
        '/' +
        fileName +
        '.webp'
      ).split(/\s+/),
      function (err, stdout, stderr) {
        if (err) {
          console.log('err => ', err);
          return;
        }
        currentFileIndex++;
        if (currentFileIndex < files.length) {
          convertFile(pack, lang);
        } else {
          eventEmitter.emit('webpFilesCreated');
          zipper.sync
            .zip('./app/_tmp/' + pack.packId)
            .compress()
            .save('./app/zipgerado/' + pack.packId + '.zip');
          sendToS3(pack, lang);
        }
      }
    );
  };

  return {
    convertFilesToWebP: function (pack, lang) {
      //Read all files in input and conver them all
      fs.readdir('./app/assets/' + pack.packId + '/', function (err, _files) {
        if (err) {
          console.log(err);
          return;
        }
        files = _files;

        if (files.length > 0) {
          convertFile(pack, lang);
        }
      });
    },
  };
};

module.exports = convert;
