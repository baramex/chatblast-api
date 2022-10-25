const { default: axios } = require("axios");
const { Magic, MAGIC_MIME_TYPE } = require("mmmagic");
const { INTEGRATIONS_TYPE, TOKEN_PLACES_TYPE } = require("../models/integration.model");
const { Profile, USERS_TYPE, FIELD_REGEX, NAME_REGEX, LASTNAME_REGEX } = require("../models/profile.model");
const { Middleware, Session } = require("../models/session.model");
const fs = require("fs");
const { getClientIp } = require("request-ip");
const { default: rateLimit } = require("express-rate-limit");
const { default: isEmail } = require("validator/lib/isEmail");

const router = require("express").Router();

// integration auth
router.post("/integration/:int_id/profile/oauth", rateLimit({
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
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// example route oauth
router.get("/user/@me", (req, res) => {
    res.send({ id: "abc123", username: "titout", avatar: "https://cdn.pixabay.com/photo/2015/04/23/22/00/tree-736885__480.jpg" });
});

// créer profil
router.post("/profile", rateLimit({
    windowMs: 1000 * 60 * 5,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.isValidAuthExpress, async (req, res) => {
    try {
        if (req.isAuthed) throw new Error("Vous êtes déjà authentifié.");
        if (!req.body || !req.body.username || !req.body.password || typeof req.body.username != "string" || typeof req.body.password != "string" || (req.body.email ? typeof req.body.email != "string" : false) || (req.body.firstname ? typeof req.body.firstname != "string" : false) || (req.body.lastname ? typeof req.body.lastname != "string" : false)) throw new Error("Requête invalide.");

        let { username, password, email, firstname, lastname } = req.body;
        username = username.toLowerCase().trim();
        password = password.trim();

        if (!/^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,32}$)/.test(password) || !FIELD_REGEX.test(username) || !isEmail(email) || !NAME_REGEX.test(firstname) || !LASTNAME_REGEX.test(lastname)) throw new Error("Requête invalide.");

        const profile = await Profile.create(username, password, undefined, undefined, USERS_TYPE.DEFAULT, email, firstname, lastname);
        const ip = getClientIp(req);
        const session = await Session.create(profile._id, req.fingerprint.hash, ip);
        const expires = new Date(24 * 60 * 60 * 1000 + new Date().getTime());
        res.cookie("token", session.token, { expires, sameSite: "none", secure: "true" }).json(Profile.getProfileFields(profile, true));
    }
    catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// déconnexion
router.post("/disconnect", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        await Session.disable(req.session);
        res.clearCookie((req.integration && req.profile.type !== USERS_TYPE.DEFAULT) ? req.integration._id.toString() + "-token" : "token", { sameSite: "none", secure: "true" }).sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// connexion
router.post("/login", rateLimit({
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
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

module.exports = router;