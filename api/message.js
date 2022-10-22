const { default: rateLimit } = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { Message } = require('../models/message.model');
const { Middleware } = require('../models/session.model');
const { typing, addTyping, removeTyping } = require('../socket-io');

const router = require('express').Router();

// poster message
router.put("/api/message", rateLimit({
    windowMs: 1000 * 5,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false
}), rateLimit({
    windowMs: 1000 * 60,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
}), Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.body || !req.body.content || typeof req.body.content != "string") throw new Error("Requête invalide.");

        const content = req.body.content.trim();
        await Message.create(req.profile._id, content, req.integration?._id);

        const i = typing.findIndex(a => a.id.equals(req.profile._id));
        if (i != -1) typing.splice(i, 1);

        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// récupérer des messages
router.get("/api/messages", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.query || !req.query.from) throw new Error("Requête invalide.");

        const from = req.query.from;
        const mes = await Message.getMessages(req.profile, req.integration?._id, from, 20);
        res.status(200).json(mes);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// nombre de message d'un membre
router.get("/api/profile/:id/messages/count", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.params.id || !ObjectId.isValid(req.params.id)) throw new Error("Requête invalide.");

        const mes = await Message.getMemberMessagesCount(req.params.id);
        res.status(200).json(mes);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// voir des messages
router.put("/api/messages/view", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!req.body || !req.body.ids) throw new Error("Requête invalide.");

        let ids = req.body.ids;
        if (!Array.isArray(ids)) throw new Error("Requête invalide.");

        ids = ids.map(a => ObjectId.isValid(a) ? new ObjectId(a) : null);
        ids = ids.filter(a => a != null);
        if (ids.length == 0) throw new Error("Requête invalide.");

        await Message.addViewToMessages(ids, req.profile._id);

        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// tout voir
router.put("/api/messages/view/all", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const unreadMessages = await Message.getUnread(req.profile);

        if (unreadMessages.length === 0) return res.sendStatus(200);

        await Message.addViewToMessages(unreadMessages.map(a => a._id), req.profile._id);

        res.sendStatus(201);
    }
    catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// supprimer un message
router.delete("/api/message/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        const id = req.params.id;
        const message = await Message.getById(new ObjectId(id));
        if (!message.author || !message.author._id.equals(req.profile._id)) return res.sendStatus(403);

        message.deleted = true;
        await message.save();

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// écrire
router.put("/api/typing", Middleware.requiresValidAuthExpress, (req, res) => {
    try {
        const isTyping = req.body.isTyping ? true : false;

        const i = typing.findIndex(a => a.id.equals(req.profile._id));
        if ((i == -1 && !isTyping) || (i != -1 && isTyping)) return res.sendStatus(200);

        if (isTyping) addTyping(req.profile, req.integration?._id);
        else removeTyping(req.profile, req.integration?._id);

        res.sendStatus(201);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

// récupérer ceux qui évrivent
router.get("/api/profiles/typing", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        res.status(200).json(typing.filter(a => a.integrationId?.equals(req.integration?._id)));
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Erreur inattendue");
    }
});

module.exports = router;