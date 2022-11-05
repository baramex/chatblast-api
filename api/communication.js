const { default: rateLimit } = require("express-rate-limit");
const { ObjectId } = require("mongodb");
const { getTestMessageUrl } = require("nodemailer");
const { Contact, CONTACTS_STATE } = require("../models/contact.model");
const { Profile, USER_PERMISSIONS } = require("../models/profile.model");
const { Middleware } = require("../models/session.model");
const { mail, header, footer, CustomError } = require("../server");

const router = require("express").Router();

router.post("/contact", rateLimit({
    windowMs: 1000 * 60 * 5,
    max: 1,
    standardHeaders: true,
    legacyHeaders: false
}), async (req, res) => {
    try {
        const { subject, email, message } = req.body;

        if ([subject, email, message].some(a => typeof a != "string")) throw new Error("Requête invalide.");

        await Contact.create(email, subject, message);

        await mail.transporter.sendMail({
            from: "ChatBlast <noreplay@chatblast.io>",
            to: email,
            subject: "[Contact ChatBlast] Votre message a bien été envoyé",
            text: "Votre message a bien été envoyé, nous vous répondrons dans les plus brefs délais.\n\nRécapitulatif:\nSujet: " + subject + "\nMessage: " + message,
            html: header +
                `<p>Votre message a bien été envoyé, nous vous répondrons dans les plus brefs délais.</p><br/>
                <p>Récapitulatif:</p>
                <table style="margin-left: 10px;">
                    <tr>
                        <td style="width: 100px;padding: 5px 0;">Sujet:</td>
                        <td>${subject}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0;">Message:</td>
                        <td>${message}</td>
                    </tr>
                </table>`
                + footer
        });

        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(400).send(error.message || "Une erreur est survenue.");
    }
});

router.get("/contacts", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!Profile.hasPermission(req.profile, USER_PERMISSIONS.VIEW_CONTACTS)) throw new CustomError("Non autorisé", 403);

        const contacts = await Contact.getAll();

        res.status(200).json(contacts);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).send(error.message || "Une erreur est survenue.");
    }
});

router.get("/contact/:id", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!Profile.hasPermission(req.profile, USER_PERMISSIONS.VIEW_CONTACTS)) throw new CustomError("Non autorisé", 403);

        const id = req.params.id;
        if (!ObjectId.isValid(id)) throw new Error("Requête invalide.");

        const contact = await Contact.getById(id);
        if (!contact) throw new Error("Contact introuvable.");

        res.status(200).json(contact);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).send(error.message || "Une erreur est survenue.");
    }
});

router.post("/contact/:id/answer", Middleware.requiresValidAuthExpress, async (req, res) => {
    try {
        if (!Profile.hasPermission(req.profile, USER_PERMISSIONS.ANSWER_CONTACTS)) throw new CustomError("Non autorisé", 403);

        const id = req.params.id;
        if (!ObjectId.isValid(id)) throw new Error("Requête invalide.");

        const answer = req.body.answer;
        if (typeof answer != "string") throw new Error("Requête invalide.");

        const contact = await Contact.getById(id);
        if (!contact) throw new Error("Contact introuvable.");
        if (contact.state != CONTACTS_STATE.PENDING) throw new Error("Ce message n'attend plus de réponse.");

        contact.answer = answer;
        contact.save({ validateBeforeSave: true });

        await mail.transporter.sendMail({
            from: "ChatBlast <noreplay@chatblast.io>",
            to: contact.email,
            subject: "[Contact ChatBlast] Vous avez reçu une réponse",
            text: "Un membre du staff de ChatBlast vous a répondu:\n\n" + answer,
            html: header +
                `<p>Un membre du staff de ChatBlast vous a répondu:</p>
                <p style="margin-left: 10px;">${answer}</p>`
                + footer
        });

        res.status(200).json(contact);
    } catch (error) {
        console.error(error);
        res.status(error.status || 400).send(error.message || "Une erreur est survenue.");
    }
});

module.exports = router;