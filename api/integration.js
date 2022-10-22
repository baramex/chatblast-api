const { ObjectId } = require("mongodb");
const { Integration } = require("../models/integration.model");

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
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

module.exports = router;