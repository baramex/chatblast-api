/* constantes */
const PORT = 5000;

/* express */
const express = require("express");
const app = express();

/* middleware */
const cors = require('cors');
app.use(cors({
    origin: process.env.HOST,
    credentials: true
}));
app.use(express.static("public"));
const rateLimit = require('express-rate-limit');
const baseLimiter = rateLimit({
    windowMs: 1000 * 2,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(baseLimiter);
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const multer = require("multer");
const path = require("path");
const { AVATAR_MIME_TYPE, AVATAR_TYPE } = require("./models/profile.model");
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500_000
    },
    fileFilter: async (req, file, callback) => {
        if (!AVATAR_MIME_TYPE.includes(file.mimetype) || !AVATAR_TYPE.includes(path.extname(file.originalname))) {
            callback(new Error("Type de fichier invalide."), false);
        }
        else {
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

/* serveur/socket-io */
const http = require('http');
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log("Serveur lancé sur le port: " + PORT);
});
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: process.env.HOST
    }
});

/* mail */
const { createTransport, createTestAccount } = require("nodemailer");
let mail = { transporter: null };
createTestAccount().then(mailAccount => {
    mail.transporter = createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
            user: mailAccount.user,
            pass: mailAccount.pass,
        }
    });
});
const header = `
<div style="background-color: #10b981;width: 100%;text-align: center;padding: 20px 0 50px 0;">
    <h1 style="font-size: 2.5rem;margin:0;"><a href="https://chatblast.io" style="color: white;">ChatBlast</a></h1>
</div>
`
const footer = `
<div style="background-color: #cdddd5;width: calc(100%-20px);padding: 10px;margin-top: 25px;">
    <p style="margin:0;">Copyright © 2022 ChatBlast. All Rights Reserved.</p>
</div>
`;

/* autre */
class CustomError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
const { Paypal } = require("./modules/Paypal");
const paypal = new Paypal(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
/*paypal.connect().then(() => {
    paypal.initWebhooks().catch(console.error);
}).catch(console.error);*/

module.exports = { server, app, upload, io, header, footer, mail, CustomError, paypal };