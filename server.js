/* constantes */
const PORT = 1500;

/* express */
const express = require("express");
const app = express();

/* middleware */
const cors = require('cors');
app.use(cors({
    origin: process.env.HOST,
    credentials: true
}));
const rateLimit = require('express-rate-limit');
const baseLimiter = rateLimit({
    windowMs: 1000 * 2,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(baseLimiter);
app.use(express.static("public"));
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const multer = require("multer");
const upload = multer({
    dest: "./avatars", limits: "0.5mb", fileFilter: async (req, file, callback) => {
        if (!AVATAR_MIME_TYPE.includes(file.mimetype) || !AVATAR_TYPE.includes(path.extname(file.filename))) {
            callback(new Error("Type de fichier invalide."), false);
        }
        else {
            const type = await new Promise((resolve, reject) => {
                new Magic(MAGIC_MIME_TYPE).detect(image.data, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });
            if (type !== file.mimetype) return callback(new Error("Type de fichier invalide."), false);
            callback(false, true);
        }
    }
});
const cookieParser = require('cookie-parser');
app.use(cookieParser());
const Fingerprint = require('express-fingerprint');
app.use(Fingerprint({
    parameters: [
        Fingerprint.useragent,
        Fingerprint.geoip
    ]
}));

/* serveur/socket.io */
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const { AVATAR_MIME_TYPE, AVATAR_TYPE } = require("./models/profile.model");
const path = require("path");
const io = new Server(server, {
    cors: {
        origin: process.env.HOST
    }
});
server.listen(PORT, () => {
    console.log("Serveur lancé sur le port: " + PORT);
});

/* api/autre */
require("dotenv").config();
const mongoose = require("mongoose");
mongoose.connect(process.env.DB, { dbName: process.env.DB_NAME });

app.use(require("./api/authentification"), require("./api/profile"), require("./api/message"), require("./api/integration"));

module.exports = { io, app, upload };