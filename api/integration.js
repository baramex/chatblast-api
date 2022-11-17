const { default: rateLimit } = require("express-rate-limit");
const { ObjectId } = require("mongodb");
const { Integration } = require("../models/integration.model");
const { Profile, USER_PERMISSIONS } = require("../models/profile.model");
const { Middleware } = require("../models/session.model");
const { CustomError } = require("../server");

const router = require("express").Router();

router.get("/integration/:id", async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) throw new Error("Requête invalide.");

        const integration = await Integration.getById(id);
        if (!integration) throw new Error("Intégration introuvable.");

        res.json({ id: integration._id, state: integration.state, type: integration.type, cookieName: integration.options.cookieName });
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
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
        const intid = req.params.intid;
        if (!ObjectId.isValid(intid)) throw new Error("Requête invalide.");
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
            if (typeof req.body.options.domain?.value == "string") {
                integration.options.domain.value = req.body.options.domain.value;
            }
            if (typeof req.body.options.customAuth == "object") {
                if (!integration.options.customAuth) integration.options.customAuth = {};
                if (typeof req.body.options.customAuth.route == "string") {
                    integration.options.customAuth.route = req.body.options.customAuth.route;
                }
                if (typeof req.body.options.customAuth.apiKey == "string") {
                    integration.options.customAuth.apiKey = req.body.options.customAuth.apiKey;
                }
                if (typeof req.body.options.customAuth.token == "object") {
                    if (!integration.options.customAuth.token) integration.options.customAuth.token = {};
                    if (typeof req.body.options.customAuth.token.place == "number") {
                        integration.options.customAuth.token.place = req.body.options.customAuth.token.place;
                    }
                    if (typeof req.body.options.customAuth.token.key == "string") {
                        integration.options.customAuth.token.key = req.body.options.customAuth.token.key;
                    }
                }
            }
        }
        await integration.save({ validateBeforeSave: true });

        res.status(200).json(await Integration.populate(integration));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.errors ? Object.values(error.errors)[0].message : (error.message || "Une erreur est survenue."));
    }
});

module.exports = router;