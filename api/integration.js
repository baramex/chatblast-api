const { ObjectId } = require("mongodb");
const { Integration } = require("../models/integration.model");
const { Profile, USER_PERMISSIONS } = require("../models/profile.model");
const { CustomError } = require("../server");

const router = require("express").Router();

router.get("/integration/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) throw new Error("Requête invalide.");

        const integration = await Integration.getById(new ObjectId(id));
        if (!integration) throw new Error("Intégration introuvable.");

        res.json({ id: integration._id, state: integration.state, type: integration.type, cookieName: integration.options.cookieName });
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// récupérer intégration
router.get("/integration/:intid", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const intid = req.params.intid;
        const integration = await Integration.getById(intid);
        if (!integration) throw new Error("Intégration introuvable.");
        if (integration.owner != req.profile._id && !Profile.hasPermission(req.profile, USER_PERMISSIONS.VIEW_USER_INTEGRATIONS)) throw new CustomError("Non autorisé.", 403);

        res.status(200).json(integration);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).send(error.message || "Une erreur est survenue.");
    }
});

// mettre à jour intégration
router.patch("/integration/:intid", rateLimit({
    windowMs: 1000 * 30,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const intid = req.params.intid;
        const integration = await Integration.getById(intid);
        if (!integration) throw new Error("Intégration introuvable.");
        if (integration.owner != req.profile._id && !Profile.hasPermission(req.profile, USER_PERMISSIONS.EDIT_USER_INTEGRATIONS)) throw new CustomError("Non autorisé.", 403);

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