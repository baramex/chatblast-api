const { default: rateLimit } = require("express-rate-limit");

const router = require("express").Router();

router.get("/website-traffic", rateLimit({
    windowMs: 1000 * 60 * 10,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
}), (req, res) => {
    try {
        const domain = req.query.domain;
        if (typeof domain !== "string") throw new Error("Requête invalide.");

        res.json({ monthlyVisitors: 0 });
    } catch (error) {
        console.error(err);
        res.status(400).send(err.message || "Une erreur est survenue.");
    }
});

module.exports = router;