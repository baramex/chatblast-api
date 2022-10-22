/* modules */
require("dotenv").config();
const cors = require('cors');
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const path = require("path");
const { Profile, USERS_TYPE, FIELD_REGEX, AVATAR_MIME_TYPE, } = require("./models/profile.model");
const { Session, Middleware } = require("./models/session.model");
const fs = require("fs");
const { Message } = require("./models/message.model");
const { app, io, upload } = require("./server");
const { getClientIp } = require("request-ip");
const { Integration, INTEGRATIONS_TYPE, TOKEN_PLACES_TYPE } = require("./models/integration.model");
const { default: axios } = require("axios");
const cookie = require("cookie");
const { Magic, MAGIC_MIME_TYPE } = require("mmmagic");
const { default: isEmail } = require("validator/lib/isEmail");
mongoose.connect(process.env.DB, { dbName: process.env.DB_NAME });

// TEST: cookies through avatar redirection

let typing = [];
let disconnected = [];

io.on("connection", async (socket) => {
    Middleware.checkValidAuth(cookie.parse(socket.handshake.headers.cookie), socket.handshake.headers.referer).then(result => {
        socket.profileId = result.session.profileId;
        socket.integrationId = result.integration?._id;

        socket.join(["authenticated", "profileid:" + result.session.profileId.toString(), "integrationid:" + result.integration?._id.toString()]);

        const d = disconnected.findIndex(a => a.id.equals(result.profile._id) && (a.integrationId || result.integration) ? a.integrationId?.equals(result.integration?._id) : true);
        if (d != -1) disconnected.splice(d, 1);
        else if (!Array.from(io.sockets.sockets.values()).filter(a => a.id !== socket.id).find(a => a.profileId?.equals(result.profile._id) && ((a.integrationId || result.integration) ? a.integrationId?.equals(result.integration?._id) : true))) {
            Session.connectMessage(result.profile, result.integration?._id).catch(console.error);
        }

        socket.emit("connected");
    }).catch(e => {
        console.error(e);
        socket.disconnect(true)
    });

    socket.on("disconnecting", async () => {
        const rooms = socket.rooms;
        const profileId = socket.profileId;
        if (!profileId || !rooms.has("authenticated")) return;

        const i = disconnected.findIndex(a => a.id.equals(profileId));
        if (i === -1) disconnected.push({ id: profileId, intid: socket.integrationId, date: new Date().getTime() });
        else disconnected[i].date = new Date().getTime();

        const profile = await Profile.getProfileById(profileId);
        if (!profile) disconnected = disconnected.filter(a => !a.id.equals(profileId));
    });
});

// disconnect
setInterval(() => {
    disconnected.filter(a => a.date <= new Date().getTime() - 1000 * 10).forEach(async ({ id, intid }) => {
        if (Array.from(io.sockets.sockets.values()).find(a => a.profileId?.equals(id) && ((a.integrationId || intid) ? a.integrationId?.equals(intid) : true))) return;
        const i = typing.findIndex(a => a.id.equals(id));
        if (i != -1) typing.splice(i, 1);
        await Session.disconnectMessage(await Profile.getProfileById(id).catch(console.error), intid).catch(console.error);
    });
    disconnected = disconnected.filter(a => a.date > new Date().getTime() - 1000 * 10);
}, 1000 * 10);

// récupérer avatar
app.get("/profile/:id/avatar", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || (!ObjectId.isValid(id) && id != "@me" && id != "deleted")) throw new Error("Requête invalide.");
        if (id == "deleted") return res.sendFile(path.join(__dirname, "avatars", "user.png"));

        const profile = (id == "@me" || id == req.profile._id.toString()) ? req.profile : await Profile.getProfileById(new ObjectId(id));

        const name = profile._id.toString() + ".png";
        if (!name || !fs.existsSync(path.join(__dirname, "avatars", name))) return res.sendFile(path.join(__dirname, "avatars", "user.png"));
        res.sendFile(path.join(__dirname, "avatars", name));
    } catch (err) {
        console.error(err);
        res.status(400).send(err.message || "Erreur inattendue");
    }
});

/* api */

app.get("/api/integration/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) throw new Error("Requête invalide.");

        const integration = await Integration.getById(new ObjectId(id));
        if (!integration) throw new Error("Intégration introuvable.");

        res.json({ id: integration._id, state: integration.state, type: integration.type, cookieName: integration.options.cookieName });
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

app.post("/api/integration/:int_id/profile/oauth", rateLimit({
    windowMs: 1000 * 60 * 2,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.isValidAuthExpress, Middleware.parseIntegrationExpress, async (req, res) => {
    try {
        if (req.isAuthed) throw new Error("Vous êtes déjà authentifié.");

        if (!req.integration) throw new Error("Intégration introuvable.");

        if (req.integration.type === INTEGRATIONS_TYPE.CUSTOM_AUTH) {
            const token = req.headers.authorization.replace("Token ", "");
            if (!token) throw new Error("Requête invalide.");

            let config = {};
            switch (req.integration.options.verifyAuthToken.token.place) {
                case TOKEN_PLACES_TYPE.AUTHORIZATION: config = { headers: { authorization: req.integration.options.verifyAuthToken.token.key + " " + token } }; break;
                case TOKEN_PLACES_TYPE.QUERY: config = { params: { [req.integration.options.verifyAuthToken.token.key]: token } }; break;
                case TOKEN_PLACES_TYPE.URLENCODED: config = { data: qs.stringify({ [req.integration.options.verifyAuthToken.token.key]: token }), headers: { 'content-type': 'application/x-www-form-urlencoded' } }; break;
            }

            let result = (await axios.get(req.integration.options.verifyAuthToken.route, config).catch(() => { throw new Error("Erreur de vérification du token.") })).data;
            if (!result || !result.username || !result.id || typeof result.username != "string" || typeof result.id != "string" || typeof result.avatar != "string") throw new Error("Erreur de vérification du token.");

            // get/update or create user
            var profile = await Profile.getProfileByUserId(result.id) ||
                await Profile.create(await Profile.generateUnsedUsername(USERS_TYPE.OAUTHED, result.username, req.integration._id).catch(() => { throw new Error("Erreur de vérification du token.") }), undefined, result.id, req.integration._id, USERS_TYPE.OAUTHED);

            if (result.avatar) {
                const fileheader = (await axios.head(result.avatar).catch(console.error))?.headers;
                if (fileheader && fileheader["content-length"] && Number.parseInt(fileheader["content-length"]) < 500_000 && AVATAR_MIME_TYPE.includes(fileheader["content-type"])) {
                    const image = await axios.get(result.avatar, { responseType: "arraybuffer" }).catch(console.error);
                    if (image && image.data) {

                        const type = await new Promise((resolve, reject) => {
                            new Magic(MAGIC_MIME_TYPE).detect(image.data, (err, res) => {
                                if (err) reject(err);
                                else resolve(res);
                            });
                        });
                        if (type === fileheader["content-type"]) {
                            fs.createWriteStream(path.join(__dirname, "avatars", profile._id.toString() + ".png")).write(image.data);
                        }
                    }
                }
            }

            if (profile.username != result.username) {
                profile.username = result.username === profile.username ? profile.username : await Profile.generateUnsedUsername(USERS_TYPE.OAUTHED, result.username, req.integration._id).catch(() => { throw new Error("Erreur de vérification du token.") });

                await profile.save({ validateBeforeSave: true });
            }

            // update or create session
            var session = await Session.getSessionByProfileId(profile._id);
            const ip = getClientIp(req);
            if (session) {
                session.active = true;
                if (!session.fingerprints.includes(req.fingerprint.hash)) session.fingerprints.push(req.fingerprint.hash);
                if (!session.ips.includes(ip)) session.ips.push(ip);
                await session.save({ validateBeforeSave: true });
            } else {
                session = await Session.create(profile._id, req.fingerprint.hash, ip);
            }
        }
        else {
            // anonyme login
            const username = await Profile.generateUnsedUsername(USERS_TYPE.ANONYME, "ano" + Math.floor(Math.random() * 1000).toString().padStart(3, "0"), req.integration._id);
            var profile = await Profile.create(username, undefined, undefined, req.integration._id, USERS_TYPE.ANONYME);
            var session = await Session.create(profile._id, req.fingerprint.hash, getClientIp(req));
        }

        const expires = new Date(24 * 60 * 60 * 1000 + new Date().getTime());
        res.cookie(profile.type === USERS_TYPE.DEFAULT ? "token" : req.integration._id.toString() + "-token", session.token, { expires, sameSite: "none", secure: "true" }).json(Profile.getProfileFields(profile, true));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// example route oauth
app.get("/api/user/@me", (req, res) => {
    res.send({ id: "abc123", username: "titout", avatar: "https://cdn.pixabay.com/photo/2015/04/23/22/00/tree-736885__480.jpg" });
});

// utilisateurs en ligne
app.get("/api/profiles/online", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const online = (await io.to("integrationid:" + req.integration?._id.toString()).fetchSockets()).map(a => a.profileId).concat(disconnected.filter(a => (a.intid || req.integration) ? a.intid?.equals(req.integration?._id) : true).map(a => a.id));
        res.status(200).send((await Profile.getUsernamesByIds(online)).map(a => ({ id: a._id, username: a.username })));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// récupérer profil
app.get("/api/profile/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || (!ObjectId.isValid(id) && id != "@me")) throw new Error("Requête invalide.");

        const profile = id === "@me" ? req.profile : await Profile.getProfileById(id);

        res.status(200).send(Profile.getProfileFields(profile, id == "@me"));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// mettre à jour profil
app.patch("/api/profile/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        if (profile.type != USERS_TYPE.DEFAULT) throw new Error("Impossible de modifier cet utilisateur.");

        if (req.body.username) {
            profile.username = req.body.username;
        }
        if (req.body.email) {
            profile.email.address = req.body.email;
        }

        await profile.save({ validateBeforeSave: true });

        res.status(200).send(Profile.getProfileFields(profile, true));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

app.get("/api/profile/:id/badges", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || (!ObjectId.isValid(id) && id != "@me")) throw new Error("Requête invalide.");

        res.status(200).send(await Profile.getBadges(id === "@me" ? req.profile : await Profile.getProfileById(id), req.integration));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// upload avatar
app.put("/api/profile/@me/avatar", rateLimit({
    windowMs: 1000 * 60 * 10,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) throw new Error("Requête invalide.");

        const tempPath = req.file.path;
        const targetPath = path.join(__dirname, "avatars", req.profile._id.toString() + ".png");

        fs.renameSync(tempPath, targetPath);

        await req.profile.save();

        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(400).send(err.message || "Erreur inattendue");
    }
});

// créer profil
app.post("/api/profile", rateLimit({
    windowMs: 1000 * 60 * 5,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.isValidAuthExpress, async (req, res) => {
    try {
        if (req.isAuthed) throw new Error("Vous êtes déjà authentifié.");
        if (!req.body || !req.body.username || !req.body.password || typeof req.body.username != "string" || typeof req.body.password != "string" || (req.body.email ? typeof req.body.email != "string" : false)) throw new Error("Requête invalide.");

        let { username, password, email } = req.body;
        username = username.toLowerCase().trim();
        password = password.trim();

        if (!/^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,32}$)/.test(password) || !FIELD_REGEX.test(username) || !isEmail(email)) throw new Error("Requête invalide.");

        const profile = await Profile.create(username, password, undefined, undefined, USERS_TYPE.DEFAULT, email);
        const ip = getClientIp(req);
        const session = await Session.create(profile._id, req.fingerprint.hash, ip);
        const expires = new Date(24 * 60 * 60 * 1000 + new Date().getTime());
        res.cookie("token", session.token, { expires, sameSite: "none", secure: "true" }).json(Profile.getProfileFields(profile, true));
    }
    catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// supprimer la session
app.delete("/api/profile", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        await Session.disable(req.session);
        res.clearCookie((req.integration && req.profile.type !== USERS_TYPE.DEFAULT) ? req.integration._id.toString() + "-token" : "token", { sameSite: "none", secure: "true" }).sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// connexion
app.post("/api/login", rateLimit({
    windowMs: 1000 * 60,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.isValidAuthExpress, Middleware.parseIntegrationExpress, async (req, res) => {
    try {
        if (req.isAuthed) throw new Error("Vous êtes déjà authentifié.");
        if (!req.body || !req.body.username || !req.body.password || typeof req.body.username != "string") throw new Error("Requête invalide.");

        const { username, password } = req.body;

        const profile = await Profile.check(username, password);
        if (!profile) throw new Error("Identifants incorrects.");

        let session = await Session.getSessionByProfileId(profile._id);
        const ip = getClientIp(req);
        if (session) {
            session.active = true;
            if (!session.fingerprints.includes(req.fingerprint.hash)) session.fingerprints.push(req.fingerprint.hash);
            if (!session.ips.includes(ip)) session.ips.push(ip);
            await session.save({ validateBeforeSave: true });
        } else {
            session = await Session.create(profile._id, req.fingerprint.hash, ip);
        }

        const expires = new Date(24 * 60 * 60 * 1000 + new Date().getTime());
        res.cookie((req.integration && profile.type !== USERS_TYPE.DEFAULT) ? req.integration._id.toString() + "-token" : "token", session.token, { expires, sameSite: "none", secure: "true" }).json(Profile.getProfileFields(profile, true));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// message
app.put("/api/message", rateLimit({
    windowMs: 1000 * 5,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false
}), rateLimit({
    windowMs: 1000 * 60,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.body || !req.body.content || typeof req.body.content != "string") throw new Error("Requête invalide.");

        const content = req.body.content.trim();
        await Message.create(req.profile._id, content, req.integration?._id);

        const i = typing.findIndex(a => a.id.equals(req.profile._id));
        if (i != -1) typing.splice(i, 1);

        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// récupérer des messages
app.get("/api/messages", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.query || !req.query.from) throw new Error("Requête invalide.");

        const from = req.query.from;
        const mes = await Message.getMessages(req.profile, req.integration?._id, from, 20);
        res.status(200).json(mes);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

app.get("/api/messages/:id/count", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.params.id || !ObjectId.isValid(req.params.id)) throw new Error("Requête invalide.");

        const mes = await Message.getMemberMessagesCount(req.params.id);
        res.status(200).json(mes);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// voir des messages
app.put("/api/messages/view", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.body || !req.body.ids) throw new Error("Requête invalide.");

        let ids = req.body.ids;
        if (!Array.isArray(ids)) throw new Error("Requête invalide.");

        ids = ids.map(a => ObjectId.isValid(a) ? new ObjectId(a) : null);
        ids = ids.filter(a => a != null);
        if (ids.length == 0) throw new Error("Requête invalide.");

        await Message.addViewToMessages(ids, req.profile._id);

        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

app.put("/api/messages/view/all", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const unreadMessages = await Message.getUnread(req.profile);

        if (unreadMessages.length === 0) return res.sendStatus(200);

        await Message.addViewToMessages(unreadMessages.map(a => a._id), req.profile._id);

        res.sendStatus(201);
    }
    catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// supprimer un message
app.delete("/api/message/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        const message = await Message.getById(new ObjectId(id));
        if (!message.author || !message.author._id.equals(req.profile._id)) return res.sendStatus(403);

        message.deleted = true;
        await message.save();

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// récupérer ceux qui évrivent
app.get("/api/profiles/typing", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        res.status(200).json(typing.filter(a => a.integrationId?.equals(req.integration?._id)));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// écrire
app.put("/api/typing", Middleware.requiresValidAuthExpress, (req, res) => {
    try {
        const isTyping = req.body.isTyping ? true : false;

        const i = typing.findIndex(a => a.id.equals(req.profile._id));
        if ((i == -1 && !isTyping) || (i != -1 && isTyping)) return res.sendStatus(200);

        if (isTyping) addTyping(req.profile, req.integration?._id);
        else removeTyping(req.profile, req.integration?._id);

        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

function generateID(length) {
    const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890".split("");
    const b = [];
    for (let i = 0; i < length; i++) {
        const j = (Math.random() * (a.length - 1)).toFixed(0);
        b[i] = a[j];
    }
    return b.join("");
}

function addTyping(profile, integrationId) {
    if (!typing.some(a => a.id.equals(profile._id))) {
        typing.push({ id: profile._id, username: profile.username, integrationId });
        io.to("integrationid:" + integrationId?.toString()).emit("message.typing", { isTyping: true, id: profile._id, username: profile.username });
    }
}

function removeTyping(profile, integrationId) {
    const i = typing.findIndex(a => a.id.equals(profile._id));
    if (i != -1) {
        typing.splice(i, 1);
        io.to("integrationid:" + integrationId?.toString()).emit("message.typing", { isTyping: false, id: profile._id, username: profile.username });
    }
}