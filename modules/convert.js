require("dotenv/config");

const fs = require("fs");
const execFile = require("child_process").execFile;
const binPath = require("webp-bin").path;
const zipper = require("zip-local");

const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ID,
  secretAccessKey: process.env.AWS_SECRET,
});

const sendToS3 = (packId) => {
  try {
    const file = fs.createReadStream("./app/zipgerado/" + packId + ".zip");

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${packId}.zip`,
      Body: file,
      ACL: "public-read",
      ContentType: "file/zip",
    };

    s3.upload(params, (error, data) => {
      if (error) {
        throw new Error("Error with s3 upload ===> ", error);
      }
      console.log(data);
    });
  } catch (err) {
    console.log("errr =>", err);
    return;
  }
};

const convert = function (eventEmitter) {
  let currentFileIndex = 0;
  let files = [];

  //Recursive function that converts file to webp format
  const convertFile = function (packId) {
    let fileName = files[currentFileIndex];
    fileName = fileName.substr(0, fileName.indexOf(".png"));

    //Magic happens...
    execFile(
      binPath,
      (
        "./app/assets/" +
        packId +
        "/" +
        fileName +
        ".png -q 80 -o ./app/_tmp/" +
        packId +
        "/" +
        fileName +
        ".webp"
      ).split(/\s+/),
      function (err, stdout, stderr) {
        currentFileIndex++;
        if (currentFileIndex < files.length) {
          convertFile(packId);
        } else {
          eventEmitter.emit("webpFilesCreated");
          zipper.sync
            .zip("./app/_tmp/" + packId)
            .compress()
            .save("./app/zipgerado/" + packId + ".zip");
          sendToS3(packId);
          console.log("finalizando -- " + packId);
        }
      }
    );
  };

  return {
    convertFilesToWebP: function (packId) {
      //Read all files in input and conver them all
      fs.readdir("./app/assets/" + packId + "/", function (err, _files) {
        if (err) throw err;
        files = _files;

        if (files.length > 0) {
          convertFile(packId);
        }
      });
    },
  };
};

module.exports = convert;
