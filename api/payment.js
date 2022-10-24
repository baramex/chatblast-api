const router = require("express").Router();

const { ObjectId } = require("mongodb");
const Article = require("../models/article.model");
const { Profile } = require("../models/profile.model");
const { Middleware } = require("../models/session.model");

router.post("/article/:id/buy", Middleware.requiresValidAuthExpress, async (req, res) => {
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
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

module.exports = router;