require('dotenv/config');

const fs = require('fs');
const { execFile } = require('child_process');
const cwebp = require('cwebp-bin');
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

    const packsInsert = `
      INSERT INTO packs (id_pack, name, publisher, url_base, url_zip, lang, created_at)
      VALUES ('${pack.packId}', '${pack.name}', '${pack.authorName}',
              '${pack.resourceUrlPrefix}', '${
      response.Location
    }', '${lang}', '${new Date().toUTCString()}') ON CONFLICT (id_pack) DO NOTHING;
    `;

    await client.query(packsInsert);

    for (const name of pack.resourceFiles) {
      const stickersInsert = `
      INSERT INTO stickers (id_pack, image_name, created_at)
      VALUES ('${
        pack.packId
      }', '${name}', '${new Date().toUTCString()}') ON CONFLICT (id_pack, image_name) DO NOTHING;
    `;

      await client.query(stickersInsert);
    }
  } catch (err) {
    console.log('errr =>', err);
    return;
  } finally {
    try {
      await fs.unlink('./app/zipgerado/' + pack.packId + '.zip', () =>
        console.log(pack.packId, ' zipgerado file deleted')
      );
      await fs.unlink('./app/zippng/' + pack.packId + '.zip', () =>
        console.log(pack.packId, ' zippng file deleted')
      );
      await fs.rmdir('./app/assets/' + pack.packId, { recursive: true }, () =>
        console.log(pack.packId, ' assets folder deleted')
      );
      await fs.rmdir('./app/_tmp/' + pack.packId, { recursive: true }, () =>
        console.log(pack.packId, ' _tmp folder deleted')
      );

      console.log('=============================================');
      console.log(pack.packId, ' finished');
      console.log('=============================================');
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
      cwebp,
      [
        './app/assets/' + pack.packId + '/' + fileName + '.png',
        '-o',
        './app/_tmp/' + pack.packId + '/' + fileName + '.webp',
      ],
      (err) => {
        if (err) {
          console.log(err);
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
