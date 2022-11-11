const axios = require('axios');
const { default: rateLimit } = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { Integration } = require('../models/integration.model');
const { Middleware } = require('../models/session.model');
const { Verification, VERIFICATIONS_TYPE } = require('../models/verification.model');
const { mail, header, footer, CustomError } = require('../server');

const router = require('express').Router();

router.post("/verification/email/send", rateLimit({
    windowMs: 1000 * 30,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (req.profile.email.isVerified) throw new Error("Adresse email déjà vérifiée.");

        const email = req.profile.email.address;
        const verif = await Verification.create(req.profile._id, VERIFICATIONS_TYPE.EMAIL);
        const url = process.env.HOST + "/verification/email?code=" + verif.code;

        await mail.transporter.sendMail({
            from: "ChatBlast <noreplay@chatblast.io>",
            to: email,
            subject: "[ChatBlast] Veuillez vérifier votre adresse email",
            text: "⚠ Si vous n'êtes pas l'auteur de cette action, de rien faire.\n\nSinon, cliquez ici pour vérifier votre adrese email: " + url,
            html: header +
                `<p style="color: #f5760a;">⚠ Si vous n'êtes pas l'auteur de cette action, de rien faire.</p><br/>
                <a style="border-radius: 50px;background-color: #059669;border: none;outline: none;color: white;padding: 8px 15px;text-decoration: none;" href="${url}">Vérifier votre adresse email</a>`
                + footer
        });

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

router.post("/verification/email/code", rateLimit({
    windowMs: 1000 * 30,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (req.profile.email.isVerified) throw new Error("Adresse email déjà vérifiée.");

        const code = req.body.code;
        if (typeof code != "string") throw new Error("Requête invalide.");

        const verif = await Verification.getValideCode(req.profile._id, VERIFICATIONS_TYPE.EMAIL, code);
        if (!verif) throw new Error("Code invalide ou expiré.");

        req.profile.email.isVerified = true;
        await req.profile.save();

        await Verification.delete(code);

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

router.post("/verification/integration/:id/domain", rateLimit({
    windowMs: 1000 * 30,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const integrationId = req.params.id;
        if (!ObjectId.isValid(integrationId)) throw new Error("Requête invalide.");

        const integration = await Integration.getById(integrationId);
        if (!integration) throw new Error("Intégration introuvable.");

        if (!integration.owner.equals(req.profile._id)) throw new CustomError("Non autorisé.", 403);
        if (integration.options.domain.isVerified) throw new Error("Domaine déjà vérifié.");

        const domain = integration.options.domain.value;

        const dns = await axios.get("https://api.api-ninjas.com/v1/dnslookup", { params: { domain }, headers: { "X-Api-Key": process.env.NINJAS_API_KEY } }).catch(() => { throw new Error("Une erreur est survenue.") });
        const isVerified = dns.data.some(a => a.record_type == "TXT" && a.value == "chatblast-checkowner=" + integration._id);
        if (!isVerified) throw new Error("Entrée non trouvée sur le domaine.");

        integration.options.domain.isVerified = true;
        await integration.save();

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

module.exports = router;