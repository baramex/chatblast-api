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
router.patch("/profile/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        if (profile.type != USERS_TYPE.DEFAULT) throw new Error("Impossible de modifier cet utilisateur.");

        if (typeof req.body.username == "string") {
            profile.username = req.body.username;
        }
        if (typeof req.body.email?.address == "string") {
            if(!profile.email) profile.email = {};
            profile.email.address = req.body.email.address;
        }
        if (typeof req.body.name?.firstname == "string") {
            if(!profile.name) profile.name = {};
            profile.name.firstname = req.body.name.firstname;
        }
        if (typeof req.body.name?.lastname == "string") {
            if(!profile.name) profile.name = {};
            profile.name.lastname = req.body.name.lastname;
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
        res.status(200).json(await Invoice.getByProfile(profile._id));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// facture pdf
router.get("/profile/:id/invoice/:invoiceid/pdf", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        const invoice = await Invoice.getById(req.params.invoiceid).populate("profile", "name").populate("articles.article", "name price");
        if (!invoice || invoice.profile._id != profile._id) throw new Error("Facture introuvable.");

        Invoice.exportToPdf(invoice).pipe(res);
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
        const integrations = await Integration.getByOwner(profile._id);

        res.status(200).json(integrations);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// récupérer intégration
router.get("/profile/:id/integration/:intid", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        const intid = req.params.intid;
        const integration = await Integration.getById(intid);
        if (!integration || integration.owner != profile._id) throw new Error("Intégration introuvable.");

        res.status(200).json(integration);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// mettre à jour intégration
router.patch("/profile/:id/integration/:intid", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const profile = req.profile;
        const intid = req.params.intid;
        const integration = await Integration.getById(intid);
        if (!integration || integration.owner != profile._id) throw new Error("Intégration introuvable.");

        if (typeof req.body.name == "string") {
            integration.name = req.body.name;
        }
        if (typeof req.body.state == "number" && req.body.state >= 0 && req.body.state <= 1) {
            integration.state = req.body.state;
        }
        if (typeof req.body.type == "number") {
            integration.type = req.body.type;
        }
        if (typeof req.body.options == "object") {
            if (typeof req.body.options.domain == "string") {
                integration.options.domain = req.body.options.domain;
            }
            if (typeof req.body.options.verifyAuthToken == "object") {
                if (typeof req.body.options.verifyAuthToken.route == "string") {
                    integration.options.verifyAuthToken.route = req.body.options.verifyAuthToken.route;
                }
                if (typeof req.body.options.verifyAuthToken.apiKey == "string") {
                    integration.options.verifyAuthToken.apiKey = req.body.options.verifyAuthToken.apiKey;
                }
                if (typeof req.body.options.verifyAuthToken.token == "object") {
                    if (typeof req.body.options.verifyAuthToken.token.place == "number") {
                        integration.options.verifyAuthToken.token.place = req.body.options.verifyAuthToken.token.place;
                    }
                    if (typeof req.body.options.verifyAuthToken.token.key == "string") {
                        integration.options.verifyAuthToken.token.key = req.body.options.verifyAuthToken.token.key;
                    }
                }
            }
        }
        await integration.save({ validateBeforeSave: true });

        res.status(200).json(integration);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

module.exports = router;