const { default: rateLimit } = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { Profile, USERS_TYPE } = require('../models/profile.model');
const { Middleware } = require('../models/session.model');
const path = require('path');
const fs = require('fs');
const { disconnected, io } = require('../socket-io');
const { upload } = require('../server');

const router = require('express').Router();

// récupérer avatar
router.get("/profile/:id/avatar", Middleware.requiresValidAuthExpress, async (req, res) => {
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

// utilisateurs en ligne
router.get("/profiles/online", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const online = (await io.to("integrationid:" + req.integration?._id.toString()).fetchSockets()).map(a => a.profileId).concat(disconnected.filter(a => (a.intid || req.integration) ? a.intid?.equals(req.integration?._id) : true).map(a => a.id));
        res.status(200).send((await Profile.getUsernamesByIds(online)).map(a => ({ id: a._id, username: a.username })));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// récupérer profil
router.get("/profile/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
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
router.patch("/profile/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
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

// récupérer badges
router.get("/profile/:id/badges", Middleware.requiresValidAuthExpress, async (req, res) => {
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
router.put("/profile/@me/avatar", rateLimit({
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

module.exports = router;