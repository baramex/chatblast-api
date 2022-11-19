const { default: rateLimit } = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { Profile, USERS_TYPE } = require('../models/profile.model');
const { Middleware } = require('../models/session.model');
const path = require('path');
const fs = require('fs');
const { disconnected } = require('../socket-io');
const { upload, io } = require('../server');
const Invoice = require('../models/invoice.model');
const { Integration } = require('../models/integration.model');
const { Magic, MAGIC_MIME_TYPE } = require('mmmagic');
const { hash } = require('bcrypt');
const Subscription = require('../models/subscription.model');
const { Affiliate } = require('../models/affiliate.model');

const router = require('express').Router();

// récupérer avatar
router.get("/profile/:id/avatar", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id || (!ObjectId.isValid(id) && id != "@me" && id != "deleted")) throw new Error("Requête invalide.");
        if (id == "deleted") return res.sendFile(path.join(__dirname, "..", "avatars", "user.png"));

        const profile = (id == "@me" || id == req.profile._id.toString()) ? req.profile : await Profile.getProfileById(new ObjectId(id));

        const name = profile._id.toString() + ".png";
        if (!name || !fs.existsSync(path.join(__dirname, "..", "avatars", name))) return res.sendFile(path.join(__dirname, "..", "avatars", "user.png"));
        res.sendFile(path.join(__dirname, "..", "avatars", name));
    } catch (err) {
        console.error(err);
        res.status(400).send(err.message || "Une erreur est survenue.");
    }
});

// utilisateurs en ligne
router.get("/profiles/online", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const online = (await io.to("integrationid:" + req.integration?._id.toString()).fetchSockets()).map(a => a.profileId).concat(disconnected.filter(a => (a.intid || req.integration) ? a.intid?.equals(req.integration?._id) : true).map(a => a.id));
        res.status(200).send((await Profile.getUsernamesByIds(online)).map(a => ({ id: a._id, username: a.username })));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
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
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// mettre à jour profil
router.patch("/profile/:id",
    rateLimit({
        windowMs: 1000 * 30,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false
    }), Middleware.requiresValidAuthExpress, async (req, res) => {
        try {
            const id = req.params.id;
            if (id != "@me") throw new Error("Requête invalide.");

            const profile = req.profile;
            if (profile.type != USERS_TYPE.DEFAULT) throw new Error("Impossible de modifier cet utilisateur.");

            if (typeof req.body.username == "string") {
                profile.username = req.body.username;
            }
            if (typeof req.body.email?.address == "string") {
                if (!profile.email) profile.email = {};
                profile.email.address = req.body.email.address;
            }
            if (typeof req.body.name?.firstname == "string") {
                if (!profile.name) profile.name = {};
                profile.name.firstname = req.body.name.firstname;
            }
            if (typeof req.body.name?.lastname == "string") {
                if (!profile.name) profile.name = {};
                profile.name.lastname = req.body.name.lastname;
            }
            if (typeof req.body.password == "string") {
                if (/^(((?=.*[a-z])(?=.*[A-Z]))|((?=.*[a-z])(?=.*[0-9]))|((?=.*[A-Z])(?=.*[0-9])))(?=.{6,32}$)/.test(req.body.password)) {
                    profile.password = await hash(req.body.password, 10);
                }
            }
            await profile.save({ validateBeforeSave: true });

            res.status(200).send(Profile.getProfileFields(profile, true));
        } catch (error) {
            console.error(error);
            res.status(400).send(error.message || "Une erreur est survenue.");
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
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// upload avatar
router.put("/profile/@me/avatar", rateLimit({
    windowMs: 1000 * 60,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, upload.single("avatar"), async (req, res) => {
    try {
        if (!req.file) throw new Error("Requête invalide.");

        const type = await new Promise((resolve, reject) => {
            new Magic(MAGIC_MIME_TYPE).detect(req.file.buffer, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });
        if (type !== req.file.mimetype) throw new Error("Type de fichier invalide.");

        fs.writeFileSync(path.join(__dirname, "..", "avatars", req.profile._id.toString() + ".png"), req.file.buffer);

        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.status(400).send(err.message || "Une erreur est survenue.");
    }
});

// récupérer factures
router.get("/profile/:id/invoices", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        res.status(200).json(await Invoice.getByProfile(profile._id).populate("articles.article", "price"));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// récupérer intégrations
router.get("/profile/:id/integrations", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        const integrations = await Integration.populate(Integration.getByOwner(profile._id));

        res.status(200).json(integrations);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// récupérer souscriptions
router.get("/profile/:id/subscriptions", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        const subscriptions = await Subscription.getBySubscriber(profile._id).populate("plan", "name price").populate("modules");

        res.status(200).json(subscriptions);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// récupérer affiliation
router.get("/profile/:id/affiliation", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        const affiliation = await Affiliate.getByProfile(profile._id);
        if (!affiliation) return res.status(200).json(null);

        const users = await Affiliate.getUsers(affiliation._id);

        res.status(200).json({ ...affiliation, users });
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

module.exports = router;