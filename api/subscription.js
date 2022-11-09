const router = require("express").Router();

const { default: rateLimit } = require("express-rate-limit");
const { ObjectId } = require("mongodb");
const Article = require("../models/article.model");
const Invoice = require("../models/invoice.model");
const { Profile, USER_PERMISSIONS } = require("../models/profile.model");
const { Middleware } = require("../models/session.model");
const { CustomError } = require("../server");

router.post("/subscribe", rateLimit({
    windowMs: 1000 * 30,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.body.planId;
        const modules = req.body.modules;
        const additionalSites = req.body.additionalSites;
        if (!ObjectId.isValid(id) || (modules && (!Array.isArray(modules) || !modules.every(a => ObjectId.isValid(a)))) || (additionalSites && (typeof additionalSites !== "number" || additionalSites < 0 || additionalSites > 5))) throw new Error("Requête invalide.");

        const article = await Article.getById(id).populate("product", "name");
        if (!article) throw new Error("Article introuvable.");

        const subscription = await Article.createSubscription(article, req.profile, modules, additionalSites);

        res.status(200).json({ approveUrl: subscription.links.find(a => a.rel == "approve").href });
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

// facture pdf
router.get("/invoice/:invoiceid/pdf", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (id != "@me") throw new Error("Requête invalide.");

        const invoice = await Invoice.getById(req.params.invoiceid).populate("profile", "name").populate("articles.article", "name price");
        if (!invoice) throw new Error("Facture introuvable.");
        if (invoice.profile._id != req.profile._id && !Profile.hasPermission(req.profile, USER_PERMISSIONS.VIEW_USER_INVOICES)) throw new CustomError("Non autorisé.", 403);

        Invoice.exportToPdf(invoice).pipe(res);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).send(error.message || "Une erreur est survenue.");
    }
});

module.exports = router;