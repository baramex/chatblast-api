const router = require("express").Router();

const { ObjectId } = require("mongodb");
const Article = require("../models/article.model");
const Invoice = require("../models/invoice.model");
const { Profile, USER_PERMISSIONS } = require("../models/profile.model");
const { Middleware } = require("../models/session.model");
const { CustomError } = require("../server");

router.post("/subscription/:id/subscribe", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) throw new Error("Requête invalide.");

        const article = await Article.getById(id).populate("product", "name");
        if (!article) throw new Error("Article introuvable.");

        if (!Profile.isComplete(req.profile)) throw new Error("Votre profil n'est pas complet.");

        const subscription = await Article.createSubscription(article, req.profile);

        res.status(200).json({ href: subscription.links.find(a => a.rel == "approve").href });
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